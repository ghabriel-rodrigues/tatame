import { randomUUID } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrationsFolder, runMigrations } from '../lib/migrate.js';
import { APPEND_ONLY_TABLES } from '../schema/index.js';
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

const ATTENDANCE_TABLES = ['class_sessions', 'checkin_codes', 'attendances'];

const GRADUATION_TABLES = [
  // Shared catalogs (no tenant_id — the meta tenant sweep cannot see them,
  // so they are asserted explicitly here).
  'martial_arts',
  'belt_ladders',
  'belts',
  // Tenant-scoped graduation tables.
  'graduation_rules',
  'student_graduations',
  'student_notes',
];

const BILLING_TABLES = [
  'academy_plans',
  'charges',
  'payments',
  'payment_mandates',
  'billing_customers',
];

const EVENTS_TABLES = ['events', 'event_registrations'];

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

  it('creates all 12 auth-critical tables, the 5 enrollment tables, the 3 attendance tables, the 6 graduation tables, the 5 billing tables and the 2 events tables', async () => {
    const res = await client.query(
      `SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`,
    );
    const names = res.rows.map((r) => r.tablename);
    for (const table of [
      ...AUTH_TABLES,
      ...ENROLLMENT_TABLES,
      ...ATTENDANCE_TABLES,
      ...GRADUATION_TABLES,
      ...BILLING_TABLES,
      ...EVENTS_TABLES,
    ]) {
      expect(names).toContain(table);
    }
  });

  it('has RLS enabled AND forced on every auth-critical, enrollment, attendance, graduation, billing and events table', async () => {
    const allTables = [
      ...AUTH_TABLES,
      ...ENROLLMENT_TABLES,
      ...ATTENDANCE_TABLES,
      ...GRADUATION_TABLES,
      ...BILLING_TABLES,
      ...EVENTS_TABLES,
    ];
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
    expect(res.rows.length).toBeGreaterThanOrEqual(11); // 3 auth + 5 enrollment + 3 attendance
    // The catalog-driven sweep must pick the new slices' tables up on its own.
    const names = res.rows.map((r) => r.table_name);
    for (const table of [
      ...ENROLLMENT_TABLES,
      ...ATTENDANCE_TABLES,
      ...BILLING_TABLES,
      ...EVENTS_TABLES,
    ]) {
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
      'class_sessions_class_fk',
      'checkin_codes_session_fk',
      'attendances_session_fk',
      'attendances_student_fk',
      'student_graduations_student_fk',
      'student_graduations_reverses_fk', // revocation cannot target a foreign tenant's row
      'student_notes_student_fk',
      // Billing slice (BIL.2–BIL.4): money can never cross academies, and the
      // two Phase-3 academy_plan_id stubs are now hardened.
      'charges_student_fk',
      'charges_guardian_fk',
      'charges_academy_plan_fk',
      'payments_charge_fk',
      'payment_mandates_student_fk',
      'students_academy_plan_fk',
      'invites_academy_plan_fk',
      // Events slice (EVT.1/EVT.2): registrations bind same-tenant events and
      // students, and the BIL.2 event_registration_id stub is now hardened.
      'event_registrations_event_fk',
      'event_registrations_student_fk',
      'charges_event_registration_fk',
    ]) {
      expect(names, `composite FK ${fk}`).toContain(fk);
    }
  });

  it('meta: every registered append-only table is guarded at all three layers', async () => {
    // Registry-driven (ATT.3): each declared table must have NO update/delete
    // grants for either runtime role, NO update/delete-capable RLS policy,
    // and the forbid_mutation() guard trigger.
    const tables = [...APPEND_ONLY_TABLES];
    expect(tables).toContain('attendances');
    expect(tables).toContain('student_graduations'); // GRD.3 joins the sweep

    const grants = await client.query(
      `SELECT table_name, grantee, privilege_type
       FROM information_schema.role_table_grants
       WHERE table_schema = 'public'
         AND table_name = ANY($1)
         AND grantee IN ('tatame_app', 'tatame_platform')
         AND privilege_type IN ('UPDATE', 'DELETE')`,
      [tables],
    );
    expect(
      grants.rows.map((r) => `${r.table_name}:${r.grantee}:${r.privilege_type}`),
      'append-only tables must carry no UPDATE/DELETE grants',
    ).toEqual([]);

    const policies = await client.query(
      `SELECT tablename, policyname, cmd FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = ANY($1)
         AND cmd IN ('UPDATE', 'DELETE', 'ALL')`,
      [tables],
    );
    expect(
      policies.rows.map((r) => `${r.tablename}:${r.policyname}:${r.cmd}`),
      'append-only tables must have no update/delete-capable policies',
    ).toEqual([]);

    // Catalog sweep: the set of tables wearing the guard trigger must be
    // exactly the registry — a declared table cannot ship without the
    // trigger, and a triggered table cannot stay undeclared.
    const triggered = await client.query(
      `SELECT c.relname
       FROM pg_trigger t
       JOIN pg_class c ON c.oid = t.tgrelid
       JOIN pg_proc p ON p.oid = t.tgfoid
       WHERE NOT t.tgisinternal AND p.proname = 'forbid_mutation'`,
    );
    expect(triggered.rows.map((r) => r.relname).sort()).toEqual([...tables].sort());
  });

  it('creates the attendance_revoke void seam, executable by tatame_app only', async () => {
    const res = await client.query(
      `SELECT proname, prosecdef FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace AND n.nspname = 'public'
       WHERE proname = 'attendance_revoke'`,
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0].prosecdef, 'attendance_revoke must be SECURITY DEFINER').toBe(true);

    const sig = 'attendance_revoke(uuid, uuid, uuid, text, uuid)';
    const priv = await client.query(
      `SELECT
         has_function_privilege('tatame_app', '${sig}', 'EXECUTE') AS app_can,
         has_function_privilege('tatame_platform', '${sig}', 'EXECUTE') AS platform_can`,
    );
    expect(priv.rows[0].app_can).toBe(true);
    expect(priv.rows[0].platform_can).toBe(false);
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

  it('hardens the academy_plan_id stubs over Phase-5 data (dangling bindings nulled, FKs added)', async () => {
    // Rebuild pre-billing state: a migrations folder truncated at 0013.
    const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'));
    const phase5Entries = journal.entries.filter((e: { idx: number }) => e.idx <= 13);
    expect(phase5Entries).toHaveLength(14);
    const partialDir = mkdtempSync(join(tmpdir(), 'tatame-phase5-'));
    mkdirSync(join(partialDir, 'meta'));
    writeFileSync(
      join(partialDir, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: phase5Entries }),
    );
    for (const entry of phase5Entries) {
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
      // Phases 1–5 only, then live data: a student and an invite carrying
      // dangling plan bindings (academy_plans did not exist yet, so any uuid
      // was accepted by the plain-uuid stubs).
      await migrate(drizzle(pool), { migrationsFolder: partialDir });
      const tenant = randomUUID();
      const creator = randomUUID();
      await pool.query(
        `INSERT INTO academies (id, name, slug, contact_email) VALUES ($1, 'Phase5', 'phase5', 'p5@t.dev')`,
        [tenant],
      );
      await pool.query(
        `INSERT INTO users (id, email, full_name) VALUES ($1, 'p5@t.dev', 'Phase Five')`,
        [creator],
      );
      await pool.query(
        `INSERT INTO students (id, tenant_id, full_name, birth_date, academy_plan_id)
         VALUES ($1, $2, 'Phase Five Student', '2000-01-01', $3)`,
        [randomUUID(), tenant, randomUUID()],
      );
      await pool.query(
        `INSERT INTO invites (id, tenant_id, token_hash, kind, academy_plan_id, created_by_user_id, expires_at)
         VALUES ($1, $2, 'phase5-token', 'student', $3, $4, now() + interval '7 days')`,
        [randomUUID(), tenant, randomUUID(), creator],
      );

      // The billing migrations (0014+) must apply on top of that state.
      await migrate(drizzle(pool), { migrationsFolder });

      const student = await pool.query(
        `SELECT academy_plan_id FROM students WHERE full_name = 'Phase Five Student'`,
      );
      expect(student.rows).toHaveLength(1);
      expect(student.rows[0].academy_plan_id).toBeNull(); // dangling binding cleaned

      const invite = await pool.query(
        `SELECT academy_plan_id FROM invites WHERE token_hash = 'phase5-token'`,
      );
      expect(invite.rows).toHaveLength(1);
      expect(invite.rows[0].academy_plan_id).toBeNull(); // dangling binding cleaned

      const fks = await pool.query(
        `SELECT conname FROM pg_constraint
         WHERE conname IN ('students_academy_plan_fk', 'invites_academy_plan_fk') AND contype = 'f'`,
      );
      expect(fks.rows.map((r) => r.conname).sort()).toEqual([
        'invites_academy_plan_fk',
        'students_academy_plan_fk',
      ]);
    } finally {
      await pool.end();
      await admin.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await admin.end();
      rmSync(partialDir, { recursive: true, force: true });
    }
  });

  it('hardens charges.event_registration_id over Phase-6 data (dangling event charges removed, FK added)', async () => {
    // Rebuild pre-events state: a migrations folder truncated at 0016.
    const journal = JSON.parse(readFileSync(join(migrationsFolder, 'meta', '_journal.json'), 'utf8'));
    const phase6Entries = journal.entries.filter((e: { idx: number }) => e.idx <= 16);
    expect(phase6Entries).toHaveLength(17);
    const partialDir = mkdtempSync(join(tmpdir(), 'tatame-phase6-'));
    mkdirSync(join(partialDir, 'meta'));
    writeFileSync(
      join(partialDir, 'meta', '_journal.json'),
      JSON.stringify({ ...journal, entries: phase6Entries }),
    );
    for (const entry of phase6Entries) {
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
      // Phases 1–6 only, then live data: an event-origin charge with a
      // dangling registration binding (event_registrations did not exist yet,
      // so the BIL.2 plain-uuid stub accepted any uuid) plus its settlement
      // attempt — and a plan charge that must survive the cleanup untouched.
      await migrate(drizzle(pool), { migrationsFolder: partialDir });
      const tenant = randomUUID();
      const student = randomUUID();
      const plan = randomUUID();
      const eventCharge = randomUUID();
      const planCharge = randomUUID();
      await pool.query(
        `INSERT INTO academies (id, name, slug, contact_email) VALUES ($1, 'Phase6', 'phase6', 'p6@t.dev')`,
        [tenant],
      );
      await pool.query(
        `INSERT INTO students (id, tenant_id, full_name, birth_date) VALUES ($1, $2, 'Phase Six Student', '2000-01-01')`,
        [student, tenant],
      );
      await pool.query(
        `INSERT INTO academy_plans (id, tenant_id, name, amount_cents, recurrence, due_day)
         VALUES ($1, $2, 'Mensal', 18000, 'monthly', 5)`,
        [plan, tenant],
      );
      await pool.query(
        `INSERT INTO charges (id, tenant_id, student_id, origin, event_registration_id, amount_cents, due_date)
         VALUES ($1, $2, $3, 'event', $4, 6000, '2026-09-01')`,
        [eventCharge, tenant, student, randomUUID()],
      );
      await pool.query(
        `INSERT INTO payments (id, tenant_id, charge_id, method, amount_cents, provider)
         VALUES ($1, $2, $3, 'pix', 6000, 'simulated')`,
        [randomUUID(), tenant, eventCharge],
      );
      await pool.query(
        `INSERT INTO charges (id, tenant_id, student_id, origin, academy_plan_id, period_start, period_end, amount_cents, due_date)
         VALUES ($1, $2, $3, 'plan', $4, '2026-08-01', '2026-08-31', 18000, '2026-08-05')`,
        [planCharge, tenant, student, plan],
      );

      // The events migrations (0017+) must apply on top of that state.
      await migrate(drizzle(pool), { migrationsFolder });

      // The dangling event charge and its payment are gone (the per-origin
      // CHECK forbids nulling, unlike the 0006/0014 nullable stubs)...
      const gone = await pool.query(`SELECT 1 FROM charges WHERE origin = 'event'`);
      expect(gone.rows).toHaveLength(0);
      const orphanPayments = await pool.query(`SELECT 1 FROM payments`);
      expect(orphanPayments.rows).toHaveLength(0);
      // ...while plan money survives untouched.
      const survivor = await pool.query(`SELECT id FROM charges WHERE origin = 'plan'`);
      expect(survivor.rows.map((r) => r.id)).toEqual([planCharge]);

      const fk = await pool.query(
        `SELECT 1 FROM pg_constraint WHERE conname = 'charges_event_registration_fk' AND contype = 'f'`,
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
