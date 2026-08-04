import { verify } from '@node-rs/argon2';
import { asc, eq, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAppDb, createPlatformDb, withPlatform, withTenant, type DbHandle } from '../lib/client.js';
import {
  academies,
  academySubscriptions,
  attendances,
  auditLogs,
  classSchedules,
  classSessions,
  classes,
  credentials,
  enrollments,
  guardians,
  memberships,
  platformPlans,
  platformUsers,
  rolePermissions,
  students,
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

  it('seeds 3 turmas per academy with real recurrence and a Lotada class at capacity', async () => {
    for (const slug of ['alpha-jj', 'bravo-bjj']) {
      const [academy] = await withPlatform(platform.db, (tx) =>
        tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, slug)),
      );
      const rows = await withTenant(app.db, academy!.id, (tx) =>
        tx.select().from(classes).orderBy(asc(classes.name)),
      );
      expect(rows.map((c) => c.name)).toEqual(['Adulto Gi', 'Kids', 'Lotada']);

      // Kids carries the age range behind the "4 a 12 anos" chip.
      const kids = rows.find((c) => c.name === 'Kids')!;
      expect([kids.ageMin, kids.ageMax]).toEqual([4, 12]);

      // Weekday chips became real schedule rows.
      const schedules = await withTenant(app.db, academy!.id, (tx) =>
        tx.select().from(classSchedules),
      );
      const bySlot = (classId: string) => schedules.filter((s) => s.classId === classId);
      expect(bySlot(rows.find((c) => c.name === 'Adulto Gi')!.id)).toHaveLength(3);
      expect(bySlot(kids.id)).toHaveLength(2);

      // Lotada is seeded exactly at capacity (active enrollments == capacity).
      const lotada = rows.find((c) => c.name === 'Lotada')!;
      const active = await withTenant(app.db, academy!.id, (tx) =>
        tx
          .select()
          .from(enrollments)
          .where(sql`${enrollments.classId} = ${lotada.id} AND ${enrollments.status} = 'active'`),
      );
      expect(active).toHaveLength(lotada.capacity);
    }
  });

  it('seeds a guardian with 2 dependents enrolled in Kids per academy', async () => {
    for (const slug of ['alpha-jj', 'bravo-bjj']) {
      const [academy] = await withPlatform(platform.db, (tx) =>
        tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, slug)),
      );
      const tenantId = academy!.id;

      const guardianRows = await withTenant(app.db, tenantId, (tx) =>
        tx.select().from(guardians),
      );
      expect(guardianRows).toHaveLength(1);
      const guardian = guardianRows[0]!;

      const dependents = await withTenant(app.db, tenantId, (tx) =>
        tx.select().from(students).where(eq(students.guardianId, guardian.id)),
      );
      expect(dependents).toHaveLength(2);
      // Dependents are minors without logins (Pendente by derivation).
      for (const d of dependents) {
        expect(d.userId).toBeNull();
      }

      const [kids] = await withTenant(app.db, tenantId, (tx) =>
        tx.select().from(classes).where(eq(classes.name, 'Kids')),
      );
      const kidEnrollments = await withTenant(app.db, tenantId, (tx) =>
        tx.select().from(enrollments).where(eq(enrollments.classId, kids!.id)),
      );
      expect(kidEnrollments.map((e) => e.studentId).sort()).toEqual(
        dependents.map((d) => d.id).sort(),
      );
    }

    // The alpha guardian record is claimed by the responsavel login.
    const [alpha] = await withPlatform(platform.db, (tx) =>
      tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, 'alpha-jj')),
    );
    const [claimed] = await withTenant(app.db, alpha!.id, (tx) =>
      tx
        .select({ email: users.email })
        .from(guardians)
        .innerJoin(users, eq(users.id, guardians.userId)),
    );
    expect(claimed?.email).toBe('responsavel@tatame.dev');
  });

  it('seeds this week\'s materialized sessions across the 3 turmas (ATT.5)', async () => {
    for (const slug of ['alpha-jj', 'bravo-bjj']) {
      const [academy] = await withPlatform(platform.db, (tx) =>
        tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, slug)),
      );
      const tenantId = academy!.id;

      const sessions = await withTenant(app.db, tenantId, (tx) =>
        tx
          .select({
            className: classes.name,
            sessionDate: classSessions.sessionDate,
            startsAt: classSessions.startsAt,
          })
          .from(classSessions)
          .innerJoin(classes, eq(classes.id, classSessions.classId)),
      );

      // One session per schedule slot: Adulto Gi 3 + Kids 2 + Lotada 1.
      const byClass = new Map<string, number>();
      for (const s of sessions) byClass.set(s.className, (byClass.get(s.className) ?? 0) + 1);
      expect(byClass.get('Adulto Gi')).toBe(3);
      expect(byClass.get('Kids')).toBe(2);
      expect(byClass.get('Lotada')).toBe(1);

      // Lazy semantics: only days that already happened are materialized.
      const now = Date.now();
      for (const s of sessions) {
        expect(s.startsAt).not.toBeNull();
        const age = now - new Date(`${s.sessionDate}T00:00:00`).getTime();
        expect(age).toBeGreaterThanOrEqual(0);
        expect(age).toBeLessThan(8 * 24 * 3600 * 1000);
      }
    }
  });

  it('seeds mixed-method attendances with an audited revoked + re-checked-in pair (ATT.5)', async () => {
    for (const slug of ['alpha-jj', 'bravo-bjj']) {
      const [academy] = await withPlatform(platform.db, (tx) =>
        tx.select({ id: academies.id }).from(academies).where(eq(academies.slug, slug)),
      );
      const tenantId = academy!.id;

      const rows = await withTenant(app.db, tenantId, (tx) => tx.select().from(attendances));

      // All three methods appear; manual rows carry the recording professor.
      const methods = new Set(rows.map((r) => r.method));
      expect(methods.has('qr')).toBe(true);
      expect(methods.has('code')).toBe(true);
      expect(methods.has('manual')).toBe(true);
      expect(rows.some((r) => r.method === 'manual' && r.recordedByUserId !== null)).toBe(true);
      expect(rows.some((r) => r.method === 'qr' && r.recordedByUserId === null)).toBe(true);

      // Exactly one revoked row — annotated, and its pair re-checked-in.
      const revoked = rows.filter((r) => r.revokedAt !== null);
      expect(revoked).toHaveLength(1);
      expect(revoked[0]!.revokedByUserId).not.toBeNull();
      expect(revoked[0]!.revokeReason).toBe('seed: roll-call correction');
      const recheck = rows.filter(
        (r) =>
          r.classSessionId === revoked[0]!.classSessionId &&
          r.studentId === revoked[0]!.studentId &&
          r.revokedAt === null,
      );
      expect(recheck).toHaveLength(1);

      // The revoke went through the seam: audited in the same transaction.
      const audit = await withTenant(app.db, tenantId, (tx) =>
        tx
          .select()
          .from(auditLogs)
          .where(sql`${auditLogs.action} = 'attendance.revoked'`),
      );
      expect(audit).toHaveLength(1);
      expect(audit[0]!.targetId).toBe(revoked[0]!.id);
    }
  });

  it('is idempotent — re-running seeds changes no row counts', async () => {
    const count = async () =>
      withPlatform(platform.db, async (tx) => {
        const [u] = await tx.select({ n: sql<number>`count(*)::int` }).from(users);
        const [m] = await tx.select({ n: sql<number>`count(*)::int` }).from(memberships);
        const [p] = await tx.select({ n: sql<number>`count(*)::int` }).from(platformPlans);
        const [s] = await tx.select({ n: sql<number>`count(*)::int` }).from(academySubscriptions);
        const [c] = await tx.select({ n: sql<number>`count(*)::int` }).from(classes);
        const [cs] = await tx.select({ n: sql<number>`count(*)::int` }).from(classSchedules);
        const [st] = await tx.select({ n: sql<number>`count(*)::int` }).from(students);
        const [g] = await tx.select({ n: sql<number>`count(*)::int` }).from(guardians);
        const [e] = await tx.select({ n: sql<number>`count(*)::int` }).from(enrollments);
        const [se] = await tx.select({ n: sql<number>`count(*)::int` }).from(classSessions);
        const [at] = await tx.select({ n: sql<number>`count(*)::int` }).from(attendances);
        const [al] = await tx.select({ n: sql<number>`count(*)::int` }).from(auditLogs);
        return [u!.n, m!.n, p!.n, s!.n, c!.n, cs!.n, st!.n, g!.n, e!.n, se!.n, at!.n, al!.n];
      });

    const before = await count();
    await seedPlatformPlans(platform.db);
    await seedDevFixtures({ appDb: app.db, platformDb: platform.db });
    const after = await count();
    expect(after).toEqual(before);
  });
});
