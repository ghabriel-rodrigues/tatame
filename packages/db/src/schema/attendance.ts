import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  pgPolicy,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { academies } from './academies.js';
import { users } from './auth.js';
import { classes, students } from './enrollment.js';
import { checkinMethod, classSessionStatus } from './enums.js';
import { id, timestamps } from './helpers.js';
import { appRole } from './roles.js';

/**
 * Attendance slice (spec 004, ATT.1) — the training triangle from the core
 * entity model: class_sessions (lazy materialized occurrence per turma per
 * day), checkin_codes (the professor-opened live window) and attendances
 * (append-only presence rows).
 *
 * All three are tenant-scoped (RLS class 1): fail-closed tenant policy on the
 * `app.tenant_id` GUC, `UNIQUE (tenant_id, id)` so children FK via composite
 * `(tenant_id, <parent>_id)`. RLS is FORCED in the custom hardening migration
 * (mirrors 0002/0008). `attendances` additionally gets the append-only layers
 * of the resolved audit decision: SELECT + INSERT policies ONLY (no update or
 * delete policy — a future grant mistake fails closed here), no UPDATE/DELETE
 * grants, and the `forbid_mutation()` guard trigger (custom migration).
 */

const tenantPolicy = (tenantId: AnyPgColumn) => ({
  using: sql`${tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
  withCheck: sql`${tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
});

/**
 * Materialized class occurrence — created lazily by whichever comes first:
 * professor opens chamada (live or manual) or an aluno manual check-in.
 * Nothing pre-generates sessions; a day nobody touched has no row (the honest
 * denominator rule for derived stats). Materialization is an idempotent
 * upsert on `(tenant_id, class_id, session_date)`.
 */
export const classSessions = pgTable(
  'class_sessions',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    classId: uuid('class_id').notNull(),
    /** Local (tenant-timezone) day of the occurrence. */
    sessionDate: date('session_date').notNull(),
    /** From the day's schedule slot; NULL when no slot was resolvable. */
    startsAt: timestamp('starts_at', { withTimezone: true }),
    status: classSessionStatus('status').notNull().default('scheduled'),
    ...timestamps,
  },
  (t) => [
    unique('class_sessions_tenant_id_id_uq').on(t.tenantId, t.id),
    // One occurrence per turma per day — the idempotent-materialization key.
    unique('class_sessions_tenant_class_date_uq').on(
      t.tenantId,
      t.classId,
      t.sessionDate,
    ),
    index('class_sessions_tenant_date_idx').on(t.tenantId, t.sessionDate),
    foreignKey({
      name: 'class_sessions_class_fk',
      columns: [t.tenantId, t.classId],
      foreignColumns: [classes.tenantId, classes.id],
    }),
    pgPolicy('class_sessions_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);

/**
 * The professor-opened live window: a 4-digit human code plus an opaque QR
 * token, with a TTL and an explicit close ("Encerrar chamada" sets
 * `revoked_at`; reopening inserts a fresh row). Both `code` and `qr_token`
 * are stored plaintext — short-lived, single-purpose, and grant nothing by
 * themselves (the caller must still be an authenticated, enrolled student).
 */
export const checkinCodes = pgTable(
  'checkin_codes',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    classSessionId: uuid('class_session_id').notNull(),
    /** 4 numeric digits, randomly generated app-side. */
    code: text('code').notNull(),
    /** Opaque 128-bit random URL-safe token — the QR encodes only this. */
    qrToken: text('qr_token').notNull().unique(),
    openedByUserId: uuid('opened_by_user_id')
      .notNull()
      .references(() => users.id),
    /** Slot end + 15 min grace (fallback: opening + 60 min) — app-computed. */
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    /** "Encerrar chamada". NULL = not explicitly closed. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('checkin_codes_tenant_id_id_uq').on(t.tenantId, t.id),
    check('checkin_codes_code_digits_ck', sql`${t.code} ~ '^[0-9]{4}$'`),
    // At most one active (not explicitly closed) code per session. Expiry is
    // not expressible in an index predicate (now() is not immutable) — the
    // mint path revokes stale codes before inserting a fresh one.
    uniqueIndex('checkin_codes_one_active_per_session_uq')
      .on(t.tenantId, t.classSessionId)
      .where(sql`${t.revokedAt} IS NULL`),
    // Active code digits unique per tenant — code resolution is unambiguous.
    uniqueIndex('checkin_codes_tenant_code_active_uq')
      .on(t.tenantId, t.code)
      .where(sql`${t.revokedAt} IS NULL`),
    foreignKey({
      name: 'checkin_codes_session_fk',
      columns: [t.tenantId, t.classSessionId],
      foreignColumns: [classSessions.tenantId, classSessions.id],
    }),
    pgPolicy('checkin_codes_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);

/**
 * Append-only presence rows. One *active* check-in per (tenant, session,
 * student) — a revoke followed by a new INSERT is the sanctioned correction
 * pattern. Rows are never edited: the sole permitted UPDATE is the revoke
 * annotation (`revoked_at`/`revoked_by_user_id`/`revoke_reason` NULL → set,
 * once), applied exclusively through the `attendance_revoke` SECURITY DEFINER
 * seam. Policies here are SELECT + INSERT only, deliberately.
 */
export const attendances = pgTable(
  'attendances',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    classSessionId: uuid('class_session_id').notNull(),
    studentId: uuid('student_id').notNull(),
    method: checkinMethod('method').notNull(),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** NULL = self check-in; the professor on manual roll call. */
    recordedByUserId: uuid('recorded_by_user_id').references(() => users.id),
    /** Void annotation — set once via the `attendance_revoke` seam only. */
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    revokedByUserId: uuid('revoked_by_user_id').references(() => users.id),
    revokeReason: text('revoke_reason'),
    ...timestamps,
  },
  (t) => [
    unique('attendances_tenant_id_id_uq').on(t.tenantId, t.id),
    // The charter's "check-in unique per class per student": one ACTIVE row.
    uniqueIndex('attendances_active_session_student_uq')
      .on(t.tenantId, t.classSessionId, t.studentId)
      .where(sql`${t.revokedAt} IS NULL`),
    index('attendances_tenant_session_idx').on(t.tenantId, t.classSessionId),
    index('attendances_tenant_student_idx').on(t.tenantId, t.studentId),
    foreignKey({
      name: 'attendances_session_fk',
      columns: [t.tenantId, t.classSessionId],
      foreignColumns: [classSessions.tenantId, classSessions.id],
    }),
    foreignKey({
      name: 'attendances_student_fk',
      columns: [t.tenantId, t.studentId],
      foreignColumns: [students.tenantId, students.id],
    }),
    pgPolicy('attendances_tenant_select', {
      for: 'select',
      to: appRole,
      using: sql`${t.tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
    }),
    pgPolicy('attendances_tenant_insert', {
      for: 'insert',
      to: appRole,
      withCheck: sql`${t.tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
    }),
  ],
);
