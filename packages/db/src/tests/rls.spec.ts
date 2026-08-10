import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAppDb, createPlatformDb, withPlatform, withTenant, type DbHandle } from '../lib/client.js';
import {
  academies,
  credentials,
  invites,
  memberships,
  platformPlans,
  platformUsers,
  rolePermissions,
  sessions,
  users,
} from '../schema/index.js';
import { createFreshDb, testAdminUrl, type FreshDb } from '../testing/test-db.js';

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Drizzle wraps pg errors; the RLS message lives on the cause chain. */
async function expectRlsViolation(promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toSatisfy((error: unknown) => {
    let current = error as (Error & { cause?: unknown }) | undefined;
    while (current) {
      if (/row-level security/.test(current.message)) return true;
      current = current.cause as (Error & { cause?: unknown }) | undefined;
    }
    return false;
  });
}

describe('row-level security', () => {
  let fresh: FreshDb;
  let app: DbHandle;
  let platform: DbHandle;

  let tenantA: string;
  let tenantB: string;
  let userA: string; // member of tenant A (admin)
  let userB: string; // member of tenant B (admin)

  beforeAll(async () => {
    fresh = await createFreshDb(testAdminUrl());
    app = createAppDb(fresh.url);
    platform = createPlatformDb(fresh.url);

    // Global provisioning through the platform (BYPASSRLS) pool.
    await withPlatform(platform.db, async (tx) => {
      const [a] = await tx
        .insert(academies)
        .values({ name: 'Tenant A', slug: 'tenant-a', contactEmail: 'a@t.dev', status: 'active' })
        .returning({ id: academies.id });
      const [b] = await tx
        .insert(academies)
        .values({ name: 'Tenant B', slug: 'tenant-b', contactEmail: 'b@t.dev', status: 'active' })
        .returning({ id: academies.id });
      tenantA = a!.id;
      tenantB = b!.id;

      const [ua] = await tx
        .insert(users)
        .values({ email: 'user-a@t.dev', fullName: 'User A' })
        .returning({ id: users.id });
      const [ub] = await tx
        .insert(users)
        .values({ email: 'user-b@t.dev', fullName: 'User B' })
        .returning({ id: users.id });
      userA = ua!.id;
      userB = ub!.id;

      await tx.insert(credentials).values({ userId: userA, secretHash: 'argon2id$fake-a' });
      await tx.insert(credentials).values({ userId: userB, secretHash: 'argon2id$fake-b' });
    });

    // Tenant-scoped rows through the honest (RLS WITH CHECK) path.
    await withTenant(app.db, tenantA, async (tx) => {
      await tx.insert(memberships).values({ tenantId: tenantA, userId: userA, role: 'admin' });
      await tx
        .insert(rolePermissions)
        .values({ tenantId: tenantA, role: 'professor', permissionKey: 'events.create', allowed: true });
      await tx.insert(invites).values({
        tenantId: tenantA,
        tokenHash: sha256('invite-a'),
        kind: 'student',
        createdByUserId: userA,
        expiresAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
      });
    });
    await withTenant(app.db, tenantB, async (tx) => {
      await tx.insert(memberships).values({ tenantId: tenantB, userId: userB, role: 'admin' });
    });
  });

  afterAll(async () => {
    await app?.close();
    await platform?.close();
    await fresh?.drop();
  });

  describe('fail-closed: tenant context unset', () => {
    it('returns zero rows from every tenant-scoped table', async () => {
      expect(await app.db.select().from(memberships)).toHaveLength(0);
      expect(await app.db.select().from(rolePermissions)).toHaveLength(0);
      expect(await app.db.select().from(invites)).toHaveLength(0);
    });

    it('returns zero rows from auth-global and platform tables (no self/tenant context)', async () => {
      expect(await app.db.select().from(users)).toHaveLength(0);
      expect(await app.db.select().from(credentials)).toHaveLength(0);
      expect(await app.db.select().from(sessions)).toHaveLength(0);
      expect(await app.db.select().from(academies)).toHaveLength(0);
      expect(await app.db.select().from(platformUsers)).toHaveLength(0);
    });

    it('rejects writes into tenant-scoped tables', async () => {
      await expectRlsViolation(
        app.db.insert(memberships).values({ tenantId: tenantA, userId: userA, role: 'student' }),
      );
      await expectRlsViolation(
        app.db
          .insert(rolePermissions)
          .values({ tenantId: tenantA, role: 'admin', permissionKey: 'x', allowed: true }),
      );
      await expectRlsViolation(
        app.db.insert(users).values({ email: 'evil@t.dev', fullName: 'Evil' }),
      );
    });

    it('keeps the public plan catalog readable (narrow policy)', async () => {
      await withPlatform(platform.db, async (tx) => {
        await tx
          .insert(platformPlans)
          .values({ name: 'Visible', priceCents: 100 })
          .onConflictDoNothing({ target: platformPlans.name });
      });
      const plans = await app.db.select().from(platformPlans);
      expect(plans.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('tenant context set', () => {
    it('sees only its own tenant rows; the other tenant is invisible', async () => {
      const rowsA = await withTenant(app.db, tenantA, (tx) => tx.select().from(memberships));
      expect(rowsA).toHaveLength(1);
      expect(rowsA[0]!.tenantId).toBe(tenantA);

      const rowsB = await withTenant(app.db, tenantB, (tx) => tx.select().from(memberships));
      expect(rowsB).toHaveLength(1);
      expect(rowsB[0]!.tenantId).toBe(tenantB);
    });

    it('reads exactly its own academy row (narrow policy)', async () => {
      const rows = await withTenant(app.db, tenantA, (tx) => tx.select().from(academies));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.id).toBe(tenantA);
    });

    it('WITH CHECK blocks writing a row into another tenant', async () => {
      await expectRlsViolation(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(memberships).values({ tenantId: tenantB, userId: userA, role: 'student' }),
        ),
      );
    });

    it('updates exactly its own academy row (spec 011 own-row update policy)', async () => {
      // The admin settings PUT path: brand + toggle mutate through the app
      // pool, scoped to the active tenant's own row.
      const updated = await withTenant(app.db, tenantA, (tx) =>
        tx
          .update(academies)
          .set({ brandDeep: '#14213D', brandVibrant: '#3A5FA8', brandAccent: '#E63946' })
          .returning({ id: academies.id }),
      );
      expect(updated.map((r) => r.id)).toEqual([tenantA]);

      // The other tenant's row is invisible to the update — zero rows touched.
      const foreign = await withTenant(app.db, tenantA, (tx) =>
        tx
          .update(academies)
          .set({ autoNotificationsEnabled: false })
          .where(sql`${academies.id} = ${tenantB}::uuid`)
          .returning({ id: academies.id }),
      );
      expect(foreign).toHaveLength(0);

      // No context at all: fail closed.
      const blind = await app.db
        .update(academies)
        .set({ autoNotificationsEnabled: false })
        .returning({ id: academies.id });
      expect(blind).toHaveLength(0);

      // Leave the fixture clean for the rest of the suite.
      await withTenant(app.db, tenantA, (tx) =>
        tx
          .update(academies)
          .set({ brandDeep: null, brandVibrant: null, brandAccent: null }),
      );
    });

    it('exposes member names of the active tenant only (users membership-read policy)', async () => {
      const rows = await withTenant(app.db, tenantA, (tx) =>
        tx.select({ id: users.id }).from(users),
      );
      expect(rows.map((r) => r.id)).toEqual([userA]);
    });
  });

  describe('self policies (app.user_id)', () => {
    it('lets a user read only themselves and their own memberships across tenants', async () => {
      const own = await withTenant(app.db, { userId: userA }, (tx) => tx.select().from(users));
      expect(own.map((u) => u.id)).toEqual([userA]);

      const ownMemberships = await withTenant(app.db, { userId: userA }, (tx) =>
        tx.select().from(memberships),
      );
      expect(ownMemberships).toHaveLength(1);
      expect(ownMemberships[0]!.userId).toBe(userA);
    });
  });

  describe('SECURITY DEFINER pre-auth seams (only bypass, tatame_app)', () => {
    it('login lookup works with no context while direct credential reads return nothing', async () => {
      const direct = await app.db.select().from(credentials);
      expect(direct).toHaveLength(0);

      const result = await app.db.execute(sql`SELECT * FROM auth_login_lookup(${'USER-A@t.dev'})`);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!['user_id']).toBe(userA);
      expect(result.rows[0]!['secret_hash']).toBe('argon2id$fake-a');
    });

    it('resolves a user own memberships pre-tenant-context', async () => {
      const result = await app.db.execute(sql`SELECT * FROM auth_user_memberships(${userA}::uuid)`);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0]!['tenant_id']).toBe(tenantA);
      expect(result.rows[0]!['academy_slug']).toBe('tenant-a');
    });

    it('mints sessions, rotates refresh tokens, and revokes the family on reuse', async () => {
      const t1 = sha256(randomBytes(32).toString('hex'));
      const t2 = sha256(randomBytes(32).toString('hex'));
      const t3 = sha256(randomBytes(32).toString('hex'));
      const expires = new Date(Date.now() + 30 * 24 * 3600 * 1000);

      const minted = await app.db.execute(
        sql`SELECT * FROM auth_create_session(${userA}::uuid, NULL, ${'vitest'}, ${t1}, ${expires})`,
      );
      const sessionId = minted.rows[0]!['session_id'] as string;
      expect(sessionId).toBeTruthy();

      const rotated = await app.db.execute(
        sql`SELECT * FROM auth_rotate_refresh_token(${t1}, ${t2}, ${expires})`,
      );
      expect(rotated.rows[0]!['status']).toBe('rotated');
      expect(rotated.rows[0]!['user_id']).toBe(userA);

      // Reuse of the consumed token is a theft signal: whole session revoked.
      const reused = await app.db.execute(
        sql`SELECT * FROM auth_rotate_refresh_token(${t1}, ${t3}, ${expires})`,
      );
      expect(reused.rows[0]!['status']).toBe('reused');

      // The rotated (t2) token now belongs to a revoked session.
      const afterRevoke = await app.db.execute(
        sql`SELECT * FROM auth_rotate_refresh_token(${t2}, ${t3}, ${expires})`,
      );
      expect(afterRevoke.rows[0]!['status']).toBe('session_revoked');
    });

    it('password reset: request + single-use consume revoking all sessions', async () => {
      const reset = sha256('reset-1');
      const requested = await app.db.execute(
        sql`SELECT * FROM auth_request_password_reset(${'user-a@t.dev'}, ${reset}, ${new Date(Date.now() + 3600 * 1000)})`,
      );
      expect(requested.rows).toHaveLength(1);

      // Unknown email: empty result (caller still answers 202).
      const unknown = await app.db.execute(
        sql`SELECT * FROM auth_request_password_reset(${'ghost@t.dev'}, ${sha256('x')}, ${new Date(Date.now() + 3600 * 1000)})`,
      );
      expect(unknown.rows).toHaveLength(0);

      const consumed = await app.db.execute(
        sql`SELECT * FROM auth_consume_password_reset(${reset}, ${'argon2id$new-hash'})`,
      );
      expect(consumed.rows[0]!['status']).toBe('reset');
      expect(consumed.rows[0]!['user_id']).toBe(userA);

      // Single use.
      const again = await app.db.execute(
        sql`SELECT * FROM auth_consume_password_reset(${reset}, ${'argon2id$other'})`,
      );
      expect(again.rows[0]!['status']).toBe('invalid');

      // All sessions revoked.
      const open = await withTenant(app.db, { userId: userA }, (tx) =>
        tx.select().from(sessions).where(sql`${sessions.revokedAt} IS NULL`),
      );
      expect(open).toHaveLength(0);

      // New hash active.
      const lookup = await app.db.execute(sql`SELECT * FROM auth_login_lookup(${'user-a@t.dev'})`);
      expect(lookup.rows[0]!['secret_hash']).toBe('argon2id$new-hash');
    });

    it('invite landing + atomic accept, with the minor rule enforced', async () => {
      const landing = await app.db.execute(
        sql`SELECT * FROM auth_invite_landing(${sha256('invite-a')})`,
      );
      expect(landing.rows[0]!['status']).toBe('valid');
      expect(landing.rows[0]!['tenant_id']).toBe(tenantA);
      expect(landing.rows[0]!['academy_name']).toBe('Tenant A');

      const dead = await app.db.execute(
        sql`SELECT * FROM auth_invite_landing(${sha256('no-such-invite')})`,
      );
      expect(dead.rows[0]!['status']).toBe('not_found');

      // A minor cannot become a standalone aluno via a student invite.
      const minorBirth = new Date();
      minorBirth.setFullYear(minorBirth.getFullYear() - 12);
      const minor = await app.db.execute(
        sql`SELECT * FROM auth_accept_invite(${sha256('invite-a')}, ${'kid@t.dev'}, ${'Kid'}, NULL, ${minorBirth.toISOString().slice(0, 10)}::date, ${'argon2id$kid'})`,
      );
      expect(minor.rows[0]!['status']).toBe('minor_requires_guardian');

      const accepted = await app.db.execute(
        sql`SELECT * FROM auth_accept_invite(${sha256('invite-a')}, ${'new-adult@t.dev'}, ${'New Adult'}, NULL, ${'1999-01-01'}::date, ${'argon2id$adult'})`,
      );
      expect(accepted.rows[0]!['status']).toBe('accepted');
      expect(accepted.rows[0]!['tenant_id']).toBe(tenantA);
      expect(accepted.rows[0]!['role']).toBe('student');

      // Membership landed in tenant A, visible through the tenant path.
      const rows = await withTenant(app.db, tenantA, (tx) => tx.select().from(memberships));
      expect(rows.some((m) => m.userId === accepted.rows[0]!['user_id'])).toBe(true);

      // Duplicate email refused.
      const dup = await app.db.execute(
        sql`SELECT * FROM auth_accept_invite(${sha256('invite-a')}, ${'new-adult@t.dev'}, ${'Dup'}, NULL, ${'1999-01-01'}::date, ${'argon2id$dup'})`,
      );
      expect(dup.rows[0]!['status']).toBe('email_exists');
    });
  });
});
