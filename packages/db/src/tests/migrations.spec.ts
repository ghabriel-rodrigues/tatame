import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runMigrations } from '../lib/migrate.js';
import { createFreshDb, testAdminUrl, type FreshDb } from '../testing/test-db.js';

const AUTH_TABLES = [
  'users',
  'credentials',
  'sessions',
  'refresh_tokens',
  'password_reset_tokens',
  'memberships',
  'role_permissions',
  'invites',
  'academies',
  'platform_users',
  'platform_plans',
  'academy_subscriptions',
];

const AUTH_FUNCTIONS = [
  'auth_login_lookup',
  'auth_user_memberships',
  'auth_create_session',
  'auth_rotate_refresh_token',
  'auth_request_password_reset',
  'auth_consume_password_reset',
  'auth_invite_landing',
  'auth_accept_invite',
];

describe('migrations', () => {
  let fresh: FreshDb;
  let client: pg.Client;

  beforeAll(async () => {
    fresh = await createFreshDb(testAdminUrl());
    client = new pg.Client({ connectionString: fresh.url });
    await client.connect();
  });

  afterAll(async () => {
    await client?.end();
    await fresh?.drop();
  });

  it('applies cleanly to a fresh Postgres 16 and is idempotent on re-run', async () => {
    // createFreshDb already applied them once; a second run must be a no-op.
    await expect(runMigrations(fresh.url)).resolves.toBeUndefined();
  });

  it('creates all 12 auth-critical tables', async () => {
    const res = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const names = res.rows.map((r) => r.tablename);
    for (const table of AUTH_TABLES) {
      expect(names).toContain(table);
    }
  });

  it('has RLS enabled AND forced on every auth-critical table', async () => {
    const res = await client.query(
      `SELECT relname, relrowsecurity, relforcerowsecurity
       FROM pg_class
       WHERE relname = ANY($1) AND relkind = 'r'`,
      [AUTH_TABLES],
    );
    expect(res.rows).toHaveLength(AUTH_TABLES.length);
    for (const row of res.rows) {
      expect(row.relrowsecurity, `${row.relname} must have RLS enabled`).toBe(true);
      expect(row.relforcerowsecurity, `${row.relname} must have RLS forced`).toBe(true);
    }
  });

  it('meta: every table carrying tenant_id has forced RLS and a tenant policy', async () => {
    // Guards future slices: a new tenant table cannot silently ship unprotected.
    const res = await client.query(`
      SELECT c.table_name,
             cl.relrowsecurity,
             cl.relforcerowsecurity,
             EXISTS (
               SELECT 1 FROM pg_policies p
               WHERE p.schemaname = 'public'
                 AND p.tablename = c.table_name
                 AND p.qual LIKE '%tenant_id%'
             ) AS has_tenant_policy
      FROM information_schema.columns c
      JOIN pg_class cl ON cl.relname = c.table_name AND cl.relkind = 'r'
      JOIN pg_namespace n ON n.oid = cl.relnamespace AND n.nspname = 'public'
      WHERE c.table_schema = 'public' AND c.column_name = 'tenant_id'
    `);
    expect(res.rows.length).toBeGreaterThanOrEqual(3); // memberships, role_permissions, invites
    for (const row of res.rows) {
      expect(row.relrowsecurity, `${row.table_name} RLS enabled`).toBe(true);
      expect(row.relforcerowsecurity, `${row.table_name} RLS forced`).toBe(true);
      expect(row.has_tenant_policy, `${row.table_name} tenant policy`).toBe(true);
    }
  });

  it('creates the runtime roles with the right RLS posture', async () => {
    const res = await client.query(
      `SELECT rolname, rolbypassrls, rolcanlogin FROM pg_roles WHERE rolname IN ('tatame_app', 'tatame_platform')`,
    );
    const byName = Object.fromEntries(res.rows.map((r) => [r.rolname, r]));
    expect(byName['tatame_app']).toBeDefined();
    expect(byName['tatame_app'].rolbypassrls).toBe(false);
    expect(byName['tatame_app'].rolcanlogin).toBe(false);
    expect(byName['tatame_platform']).toBeDefined();
    expect(byName['tatame_platform'].rolbypassrls).toBe(true);
    expect(byName['tatame_platform'].rolcanlogin).toBe(false);
  });

  it('creates the SECURITY DEFINER pre-auth seams, executable by tatame_app only', async () => {
    const res = await client.query(
      `SELECT proname, prosecdef FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
       WHERE proname = ANY($1)`,
      [AUTH_FUNCTIONS],
    );
    expect(res.rows.map((r) => r.proname).sort()).toEqual([...AUTH_FUNCTIONS].sort());
    for (const row of res.rows) {
      expect(row.prosecdef, `${row.proname} must be SECURITY DEFINER`).toBe(true);
    }

    const priv = await client.query(`
      SELECT
        has_function_privilege('tatame_app', 'auth_login_lookup(text)', 'EXECUTE') AS app_can,
        has_function_privilege('tatame_platform', 'auth_login_lookup(text)', 'EXECUTE') AS platform_can
    `);
    expect(priv.rows[0].app_can).toBe(true);
    expect(priv.rows[0].platform_can).toBe(false);
  });
});
