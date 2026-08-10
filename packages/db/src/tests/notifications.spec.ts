import pg from 'pg';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createAppDb,
  createPlatformDb,
  withPlatform,
  withTenant,
  type DbHandle,
} from '../lib/client.js';
import { academies, memberships, notifications, users } from '../schema/index.js';
import {
  seedBeltCatalog,
  seedBillingFixtures,
  seedDevFixtures,
  seedEventFixtures,
  seedNotificationFixtures,
  seedPlatformPlans,
} from '../seed/index.js';
import { createFreshDb, testAdminUrl, type FreshDb } from '../testing/test-db.js';

const CATEGORIES = ['payment', 'event', 'graduation', 'attendance', 'store'] as const;

describe('notifications schema + seeds (spec 010, NOT.1–NOT.2)', () => {
  let fresh: FreshDb;
  let app: DbHandle;
  let platform: DbHandle;
  let client: pg.Client;

  let alphaId: string;
  let bravoId: string;

  beforeAll(async () => {
    fresh = await createFreshDb(testAdminUrl());
    app = createAppDb(fresh.url);
    platform = createPlatformDb(fresh.url);
    client = new pg.Client({ connectionString: fresh.url });
    await client.connect();

    await seedPlatformPlans(platform.db);
    await seedBeltCatalog(platform.db);
    await seedDevFixtures({ appDb: app.db, platformDb: platform.db });
    await seedBillingFixtures({ appDb: app.db, platformDb: platform.db });
    await seedEventFixtures({ appDb: app.db, platformDb: platform.db });
    await seedNotificationFixtures({ appDb: app.db, platformDb: platform.db });

    const rows = await withPlatform(platform.db, (tx) =>
      tx.select({ id: academies.id, slug: academies.slug }).from(academies),
    );
    alphaId = rows.find((r) => r.slug === 'alpha-jj')!.id;
    bravoId = rows.find((r) => r.slug === 'bravo-bjj')!.id;
  });

  afterAll(async () => {
    await client?.end();
    await app?.close();
    await platform?.close();
    await fresh?.drop();
  });

  it('carries the list index and the partial unread index', async () => {
    const res = await client.query(
      `SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = 'notifications'`,
    );
    const byName = Object.fromEntries(res.rows.map((r) => [r.indexname, r.indexdef]));

    expect(byName['notifications_tenant_user_created_idx']).toContain('created_at DESC');
    // The badge count rides a partial index over unread rows only.
    expect(byName['notifications_tenant_user_unread_idx']).toContain('read_at IS NULL');
  });

  it('memberships.notifications_enabled defaults to true on every seeded row', async () => {
    const rows = await withPlatform(platform.db, (tx) =>
      tx.select({ enabled: memberships.notificationsEnabled }).from(memberships),
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.enabled)).toBe(true);
  });

  it('seeds mixed read/unread rows across all five categories in both academies', async () => {
    for (const tenantId of [alphaId, bravoId]) {
      const rows = await withTenant(app.db, tenantId, (tx) =>
        tx
          .select({
            category: notifications.category,
            readAt: notifications.readAt,
            title: notifications.title,
            userId: notifications.userId,
          })
          .from(notifications),
      );
      expect(rows.length).toBeGreaterThanOrEqual(5);
      const seeded = new Set(rows.map((r) => r.category));
      for (const category of CATEGORIES) expect(seeded, `category ${category}`).toContain(category);
      expect(rows.some((r) => r.readAt === null), 'has unread rows').toBe(true);
      expect(rows.some((r) => r.readAt !== null), 'has read rows').toBe(true);
    }
  });

  it('resolves the event fixture rows to a real event route + day-of-month chip', async () => {
    const rows = await withTenant(app.db, alphaId, (tx) =>
      tx
        .select({ route: notifications.route, chip: notifications.chip })
        .from(notifications)
        .where(eq(notifications.category, 'event')),
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      expect(row.route).toMatch(/^event\/[0-9a-f-]{36}$/);
      expect(row.chip).toMatch(/^\d{1,2}$/);
    }
  });

  it('addresses rows only to users holding a login (fan-out contract mirror)', async () => {
    // Every seeded recipient resolves to a real users row by construction of
    // the FK; assert none of the login-less fixture people ever got a row by
    // checking recipients all have credentials-bearing emails.
    const recipients = await withPlatform(platform.db, (tx) =>
      tx
        .selectDistinct({ email: users.email })
        .from(notifications)
        .innerJoin(users, eq(users.id, notifications.userId)),
    );
    for (const { email } of recipients) {
      expect(email).toMatch(/@tatame\.dev$/);
    }
  });

  it('RLS: tenant context sees only its own feed; unset context sees nothing', async () => {
    const bravoRows = await withTenant(app.db, alphaId, (tx) =>
      tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(eq(notifications.tenantId, bravoId)),
    );
    expect(bravoRows).toHaveLength(0);

    // Fail-closed: no tenant GUC, no rows.
    const bare = await app.db.execute(sql`SELECT count(*)::int AS n FROM notifications`);
    expect(bare.rows[0]?.['n']).toBe(0);
  });

  it('unread rows satisfy the partial-index predicate arithmetic', async () => {
    const unread = await withTenant(app.db, alphaId, (tx) =>
      tx
        .select({ id: notifications.id })
        .from(notifications)
        .where(and(isNull(notifications.readAt))),
    );
    const all = await withTenant(app.db, alphaId, (tx) =>
      tx.select({ id: notifications.id }).from(notifications),
    );
    expect(unread.length).toBeGreaterThan(0);
    expect(unread.length).toBeLessThan(all.length);
  });

  it('re-running the notification seed changes no row counts (idempotent)', async () => {
    const count = async () =>
      withPlatform(platform.db, async (tx) => {
        const [n] = await tx.select({ n: sql<number>`count(*)::int` }).from(notifications);
        return n!.n;
      });
    const before = await count();
    await seedNotificationFixtures({ appDb: app.db, platformDb: platform.db });
    expect(await count()).toBe(before);
  });
});
