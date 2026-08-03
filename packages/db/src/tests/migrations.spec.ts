import { randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrationsFolder, runMigrations } from '../lib/migrate.js';
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

const ENROLLMENT_TABLES = ['students', 'guardians', 'classes', 'class_schedules', 'enrollments'];

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

  it('creates all 12 auth-critical tables and the 5 enrollment tables', async () => {
    const res = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const names = res.rows.map((r) => r.tablename);
    for (const table of [...AUTH_TABLES, ...ENROLLMENT_TABLES]) {
      expect(names).toContain(table);
    }
  });

  it('has RLS enabled AND forced on every auth-critical and enrollment table', async () => {
    const allTables = [...AUTH_TABLES, ...ENROLLMENT_TABLES];
    const res = await client.query(
      `SELECT relname, relrowsecurity, relforcerowsecurity
       FROM pg_class
       WHERE relname = ANY($1) AND relkind = 'r'`,
      [allTables],
    );
    expect(res.rows).toHaveLength(allTables.length);
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
    expect(res.rows.length).toBeGreaterThanOrEqual(8); // 3 auth + 5 enrollment
    // The catalog-driven sweep must pick the enrollment tables up on its own.
    const names = res.rows.map((r) => r.table_name);
    for (const table of ENROLLMENT_TABLES) {
      expect(names, `meta-test must cover ${table}`).toContain(table);
    }
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

  it('creates the invite-accept v2 seam, executable by tatame_app only (v1 kept)', async () => {
    const res = await client.query(
      `SELECT proname, prosecdef FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
       WHERE proname IN ('auth_accept_invite', 'auth_accept_invite_v2')`,
    );
    expect(res.rows.map((r) => r.proname).sort()).toEqual([
      'auth_accept_invite',
      'auth_accept_invite_v2',
    ]);
    for (const row of res.rows) {
      expect(row.prosecdef, `${row.proname} must be SECURITY DEFINER`).toBe(true);
    }

    const sig = 'auth_accept_invite_v2(text, text, text, text, date, text, jsonb)';
    const priv = await client.query(
      `SELECT
         has_function_privilege('tatame_app', '${sig}', 'EXECUTE') AS app_can,
         has_function_privilege('tatame_platform', '${sig}', 'EXECUTE') AS platform_can`,
    );
    expect(priv.rows[0].app_can).toBe(true);
    expect(priv.rows[0].platform_can).toBe(false);
  });

  it('hardens same-tenant references with composite FKs on the enrollment tables', async () => {
    const res = await client.query(`
      SELECT conname
      FROM pg_constraint
      WHERE contype = 'f' AND connamespace = 'public'::regnamespace
    `);
    const names = res.rows.map((r) => r.conname);
    for (const fk of [
      'students_guardian_fk',
      'class_schedules_class_fk',
      'enrollments_class_fk',
      'enrollments_student_fk',
      'invites_class_fk', // ENR.3 — the 001 debt closed
    ]) {
      expect(names, `composite FK ${fk}`).toContain(fk);
    }
  });

  it('hardens invites.class_id over Phase-2 data (dangling bindings nulled, FK added)', async () => {
    // Rebuild Phase-2 state: a migrations folder truncated at 0005.
    const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'));
    const phase2Entries = journal.entries.filter((e: { idx: number }) => e.idx <= 5);
    expect(phase2Entries).toHaveLength(6);
    const partialDir = mkdtempSync(join(tmpdir(), 'tatame-phase2-'));
    mkdirSync(join(partialDir, 'meta'));
    writeFileSync(
      join(partialDir, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: phase2Entries }),
    );
    for (const entry of phase2Entries) {
      cpSync(join(migrationsFolder, `${entry.tag}.sql`), join(partialDir, `${entry.tag}.sql`));
    }

    const dbName = `t_${randomUUID().replaceAll('-', '')}`;
    const admin = new pg.Client({ connectionString: testAdminUrl() });
    await admin.connect();
    await admin.query(`CREATE DATABASE ${dbName}`);
    const url = new URL(testAdminUrl());
    url.pathname = `/${dbName}`;

    const pool = new pg.Pool({ connectionString: url.toString(), max: 1 });
    try {
      // Phase 2 only, then live data: an invite with a dangling class binding
      // (classes did not exist yet, so any uuid was accepted).
      await migrate(drizzle(pool), { migrationsFolder: partialDir });
      const tenant = randomUUID();
      const creator = randomUUID();
      await pool.query(
        `INSERT INTO academies (id, name, slug, contact_email) VALUES ($1, 'Phase2', 'phase2', 'p2@t.dev')`,
        [tenant],
      );
      await pool.query(
        `INSERT INTO users (id, email, full_name) VALUES ($1, 'p2@t.dev', 'Phase Two')`,
        [creator],
      );
      await pool.query(
        `INSERT INTO invites (id, tenant_id, token_hash, kind, class_id, created_by_user_id, expires_at)
         VALUES ($1, $2, 'phase2-token', 'student', $3, $4, now() + interval '7 days')`,
        [randomUUID(), tenant, randomUUID(), creator],
      );

      // The remaining migrations (0006+) must apply on top of that state.
      await migrate(drizzle(pool), { migrationsFolder });

      const invite = await pool.query(`SELECT class_id FROM invites WHERE token_hash = 'phase2-token'`);
      expect(invite.rows).toHaveLength(1);
      expect(invite.rows[0].class_id).toBeNull(); // dangling binding cleaned

      const fk = await pool.query(
        `SELECT 1 FROM pg_constraint WHERE conname = 'invites_class_fk' AND contype = 'f'`,
      );
      expect(fk.rows).toHaveLength(1);
    } finally {
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await admin.end();
      rmSync(partialDir, { recursive: true, force: true });
    }
  });
});
