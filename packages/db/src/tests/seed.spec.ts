import { verify } from '@node-rs/argon2';
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAppDb, createPlatformDb, withPlatform, withTenant, type DbHandle } from '../lib/client.js';
import {
  academies,
  academySubscriptions,
  credentials,
  memberships,
  platformPlans,
  platformUsers,
  rolePermissions,
  users,
} from '../schema/index.js';
import { DEV_PASSWORD, seedDevFixtures, seedPlatformPlans } from '../seed/index.js';
import { createFreshDb, testAdminUrl, type FreshDb } from '../testing/test-db.js';

describe('seeds', () => {
  let fresh: FreshDb;
  let app: DbHandle;
  let platform: DbHandle;

  beforeAll(async () => {
    fresh = await createFreshDb(testAdminUrl());
    app = createAppDb(fresh.url);
    platform = createPlatformDb(fresh.url);
    await seedPlatformPlans(platform.db);
    await seedDevFixtures({ appDb: app.db, platformDb: platform.db });
  });

  afterAll(async () => {
    await app?.close();
    await platform?.close();
    await fresh?.drop();
  });

  it('seeds the platform plan catalog (Essencial/Pro/Black)', async () => {
    const plans = await withPlatform(platform.db, (tx) =>
      tx.select().from(platformPlans).orderBy(asc(platformPlans.sortOrder)),
    );
    expect(plans.map((p) => [p.name, p.priceCents, p.studentLimit])).toEqual([
      ['Essencial', 9_900, 80],
      ['Pro', 19_900, 250],
      ['Black', 34_900, null],
    ]);
    // Public catalog readable by the app role with no context at all.
    const publicPlans = await app.db.select().from(platformPlans);
    expect(publicPlans).toHaveLength(3);
  });

  it('seeds two academies with live subscriptions', async () => {
    const rows = await withPlatform(platform.db, (tx) =>
      tx
        .select({
          slug: academies.slug,
          status: academies.status,
          subStatus: academySubscriptions.status,
          plan: platformPlans.name,
        })
        .from(academies)
        .innerJoin(academySubscriptions, eq(academySubscriptions.academyId, academies.id))
        .innerJoin(platformPlans, eq(platformPlans.id, academySubscriptions.platformPlanId))
        .orderBy(asc(academies.slug)),
    );
    expect(rows).toEqual([
      { slug: 'alpha-jj', status: 'active', subStatus: 'active', plan: 'Pro' },
      { slug: 'bravo-bjj', status: 'trial', subStatus: 'trialing', plan: 'Essencial' },
    ]);
  });

  it('seeds users covering all six personas with memberships written under RLS', async () => {
    const [alpha] = await withPlatform(platform.db, (tx) =>
      tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, 'alpha-jj')),
    );
    const [bravo] = await withPlatform(platform.db, (tx) =>
      tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, 'bravo-bjj')),
    );

    // Visible through the tenant-scoped app path — proves they were written
    // (and are readable) under real RLS.
    const alphaMembers = await withTenant(app.db, alpha!.id, (tx) =>
      tx
        .select({ email: users.email, role: memberships.role })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId)),
    );
    const byEmail = new Map(alphaMembers.map((m) => [`${m.email}:${m.role}`, true]));
    expect(byEmail.has('aluno@tatame.dev:student')).toBe(true);
    expect(byEmail.has('professor@tatame.dev:professor')).toBe(true);
    expect(byEmail.has('admin@tatame.dev:admin')).toBe(true);
    expect(byEmail.has('responsavel@tatame.dev:guardian')).toBe(true);
    expect(byEmail.has('multi@tatame.dev:professor')).toBe(true);

    const bravoMembers = await withTenant(app.db, bravo!.id, (tx) =>
      tx
        .select({ email: users.email, role: memberships.role })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId)),
    );
    const bravoSet = new Set(bravoMembers.map((m) => `${m.email}:${m.role}`));
    expect(bravoSet.has('admin.bravo@tatame.dev:admin')).toBe(true);
    expect(bravoSet.has('multi@tatame.dev:admin')).toBe(true);
    // No cross-tenant bleed.
    expect(bravoSet.has('aluno@tatame.dev:student')).toBe(false);

    // Platform personas.
    const staff = await withPlatform(platform.db, (tx) =>
      tx
        .select({ email: users.email, role: platformUsers.role })
        .from(platformUsers)
        .innerJoin(users, eq(users.id, platformUsers.userId)),
    );
    const staffSet = new Set(staff.map((s) => `${s.email}:${s.role}`));
    expect(staffSet.has('owner@tatame.dev:owner')).toBe(true);
    expect(staffSet.has('suporte@tatame.dev:support')).toBe(true);
  });

  it('stores argon2id hashes verifying the known dev password', async () => {
    const rows = await withPlatform(platform.db, (tx) =>
      tx
        .select({ secretHash: credentials.secretHash })
        .from(credentials)
        .innerJoin(users, eq(users.id, credentials.userId))
        .where(sql`${users.email} = 'aluno@tatame.dev'`),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.secretHash.startsWith('$argon2id$')).toBe(true);
    await expect(verify(rows[0]!.secretHash, DEV_PASSWORD)).resolves.toBe(true);
    await expect(verify(rows[0]!.secretHash, 'wrong-password')).resolves.toBe(false);
  });

  it('seeds default permission toggles per academy', async () => {
    const [alpha] = await withPlatform(platform.db, (tx) =>
      tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, 'alpha-jj')),
    );
    const toggles = await withTenant(app.db, alpha!.id, (tx) =>
      tx.select().from(rolePermissions),
    );
    expect(toggles.length).toBeGreaterThanOrEqual(3);
    expect(
      toggles.some((t) => t.role === 'professor' && t.permissionKey === 'events.create' && t.allowed),
    ).toBe(true);
  });

  it('is idempotent — re-running seeds changes no row counts', async () => {
    const count = async () =>
      withPlatform(platform.db, async (tx) => {
        const [u] = await tx.select({ n: sql<number>`count(*)::int` }).from(users);
        const [m] = await tx.select({ n: sql<number>`count(*)::int` }).from(memberships);
        const [p] = await tx.select({ n: sql<number>`count(*)::int` }).from(platformPlans);
        const [s] = await tx.select({ n: sql<number>`count(*)::int` }).from(academySubscriptions);
        return [u!.n, m!.n, p!.n, s!.n];
      });

    const before = await count();
    await seedPlatformPlans(platform.db);
    await seedDevFixtures({ appDb: app.db, platformDb: platform.db });
    const after = await count();
    expect(after).toEqual(before);
  });
});
