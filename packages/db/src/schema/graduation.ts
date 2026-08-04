import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { academies } from './academies.js';
import { users } from './auth.js';
import { belts } from './catalogs.js';
import { students } from './enrollment.js';
import { graduationKind } from './enums.js';
import { id, timestamps } from './helpers.js';
import { appRole } from './roles.js';

/**
 * Graduation slice, tenant side (spec 005 GRD.2–GRD.4): graduation_rules
 * (per-academy régua: lessons-per-degree + kids toggles), student_graduations
 * (append-only award/revocation history — the charter's immutable "who
 * promoted, when") and student_notes (persistent staff observações).
 *
 * All three are tenant-scoped (RLS class 1): fail-closed tenant policy on the
 * `app.tenant_id` GUC, `UNIQUE (tenant_id, id)` so children FK via composite
 * `(tenant_id, <parent>_id)`. RLS is FORCED in the hardening migration.
 * `belt_id` columns are plain FKs — belts are a global shared catalog.
 */

const tenantPolicy = (tenantId: AnyPgColumn) => ({
  using: sql`${tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
  withCheck: sql`${tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
});

/**
 * Per-academy graduation rules — one row per (tenant, belt), lazily upserted
 * on save: an untouched academy has no rows and reads code defaults (40
 * lessons per degree, everything enabled). `enabled=false` is the kids-belt
 * toggle (service-enforced to kids-ladder belts only).
 */
export const graduationRules = pgTable(
  'graduation_rules',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    beltId: uuid('belt_id')
      .notNull()
      .references(() => belts.id),
    lessonsPerDegree: integer('lessons_per_degree').notNull().default(40),
    enabled: boolean('enabled').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique('graduation_rules_tenant_id_id_uq').on(t.tenantId, t.id),
    unique('graduation_rules_tenant_belt_uq').on(t.tenantId, t.beltId),
    check('graduation_rules_lessons_min_ck', sql`${t.lessonsPerDegree} >= 10`),
    pgPolicy('graduation_rules_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);

/**
 * Append-only graduation history — award rows (`kind` degree/belt) corrected
 * exclusively by admin-issued `revocation` compensation rows; no UPDATE ever,
 * for anyone (stricter than attendances: the `forbid_mutation()` trigger has
 * no sanctioned transition here). Current belt is DERIVED on read: the latest
 * non-reversed award row; no row ⇒ white belt, zero degrees (presentation
 * default, no synthetic row). Policies are SELECT + INSERT only, deliberately.
 *
 * `degree` is 0 on belt promotions and revocations (resolved 005 shape); the
 * revocation's meaning lives in `reverses_graduation_id` — a composite tenant
 * self-FK so a revocation can never target a foreign tenant's row, with a
 * partial unique so an award is reversed at most once.
 */
export const studentGraduations = pgTable(
  'student_graduations',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    studentId: uuid('student_id').notNull(),
    beltId: uuid('belt_id')
      .notNull()
      .references(() => belts.id),
    kind: graduationKind('kind').notNull(),
    /** Degree awarded; 0 on belt promotions and revocations. */
    degree: smallint('degree').notNull().default(0),
    awardedByUserId: uuid('awarded_by_user_id')
      .notNull()
      .references(() => users.id),
    awardedAt: timestamp('awarded_at', { withTimezone: true }).notNull().defaultNow(),
    notes: text('notes'),
    /** Set exactly when kind = 'revocation' — the reversed award row. */
    reversesGraduationId: uuid('reverses_graduation_id'),
    ...timestamps,
  },
  (t) => [
    unique('student_graduations_tenant_id_id_uq').on(t.tenantId, t.id),
    index('student_graduations_tenant_student_idx').on(t.tenantId, t.studentId, t.awardedAt),
    check(
      'student_graduations_revocation_ck',
      sql`(${t.kind} = 'revocation') = (${t.reversesGraduationId} IS NOT NULL)`,
    ),
    check('student_graduations_degree_ck', sql`${t.degree} >= 0`),
    // An award is reversed at most once — double revocation is impossible.
    uniqueIndex('student_graduations_single_reversal_uq')
      .on(t.tenantId, t.reversesGraduationId)
      .where(sql`${t.reversesGraduationId} IS NOT NULL`),
    foreignKey({
      name: 'student_graduations_student_fk',
      columns: [t.tenantId, t.studentId],
      foreignColumns: [students.tenantId, students.id],
    }),
    foreignKey({
      name: 'student_graduations_reverses_fk',
      columns: [t.tenantId, t.reversesGraduationId],
      foreignColumns: [t.tenantId, t.id],
    }),
    pgPolicy('student_graduations_tenant_select', {
      for: 'select',
      to: appRole,
      using: sql`${t.tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
    }),
    pgPolicy('student_graduations_tenant_insert', {
      for: 'insert',
      to: appRole,
      withCheck: sql`${t.tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
    }),
  ],
);

/**
 * Persistent staff observações on a student (spec 005 GRD.4, recorded delta).
 * Plain tenant table — coaching notes are not charter history (create + list
 * in v1; never visible to the aluno, enforced by the API surface).
 */
export const studentNotes = pgTable(
  'student_notes',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    studentId: uuid('student_id').notNull(),
    authorUserId: uuid('author_user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    ...timestamps,
  },
  (t) => [
    unique('student_notes_tenant_id_id_uq').on(t.tenantId, t.id),
    index('student_notes_tenant_student_idx').on(t.tenantId, t.studentId),
    foreignKey({
      name: 'student_notes_student_fk',
      columns: [t.tenantId, t.studentId],
      foreignColumns: [students.tenantId, students.id],
    }),
    pgPolicy('student_notes_tenant_all', { for: 'all', to: appRole, ...tenantPolicy(t.tenantId) }),
  ],
);
