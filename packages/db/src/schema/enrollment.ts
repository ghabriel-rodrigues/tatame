import { sql } from 'drizzle-orm';
import {
  check,
  date,
  foreignKey,
  index,
  integer,
  pgPolicy,
  pgTable,
  smallint,
  text,
  time,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { academies } from './academies.js';
import { academyPlans } from './academy-plans.js';
import { users } from './auth.js';
import { belts } from './catalogs.js';
import { classStatus, enrollmentStatus, studentStatus } from './enums.js';
import { id, timestamps } from './helpers.js';
import { appRole } from './roles.js';

/**
 * Enrollment slice (spec 003, ENR.1) — the people-and-classes triangle from
 * the core entity model: students, guardians, classes (turmas),
 * class_schedules (recurring weekly slots) and enrollments.
 *
 * All five are tenant-scoped (RLS class 1): fail-closed tenant policy on the
 * `app.tenant_id` GUC, `UNIQUE (tenant_id, id)` so children FK via composite
 * `(tenant_id, <parent>_id)` — FK checks bypass RLS, composite keys make
 * cross-tenant references impossible at the constraint level. RLS is FORCED
 * in the custom hardening migration (mirrors 0002).
 */

const tenantPolicy = (tenantId: AnyPgColumn) => ({
  using: sql`${tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
  withCheck: sql`${tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
});

/**
 * Guardians (responsáveis) — 1 guardian → N students via
 * `students.guardian_id`. May exist with no login (`user_id` NULL: created by
 * the admin before any invite is accepted).
 */
export const guardians = pgTable(
  'guardians',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    /** NULL = record without a login (admin-created, not yet claimed). */
    userId: uuid('user_id').references(() => users.id),
    fullName: text('full_name').notNull(),
    phone: text('phone'),
    email: text('email'),
    ...timestamps,
  },
  (t) => [
    unique('guardians_tenant_id_id_uq').on(t.tenantId, t.id),
    unique('guardians_tenant_user_uq').on(t.tenantId, t.userId),
    index('guardians_tenant_id_idx').on(t.tenantId),
    pgPolicy('guardians_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);

/**
 * Students (alunos) — the person record, decoupled from login: `user_id` is
 * NULL for minors and pre-activation records (derived badge: Pendente =
 * active with no linked user). The "minor ⇒ guardian linked" rule is
 * app/service-enforced (age is time-dependent) in every creation path.
 */
export const students = pgTable(
  'students',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    /** NULL = record not yet claimed by a login (Pendente). */
    userId: uuid('user_id').references(() => users.id),
    fullName: text('full_name').notNull(),
    birthDate: date('birth_date').notNull(),
    /** Guardian link — required for minors (service-enforced). */
    guardianId: uuid('guardian_id'),
    /**
     * Mensalidade plan binding — composite tenant FK onto `academy_plans`
     * (spec 006 BIL.4 closing the recorded 003 debt). NULL = no plan assigned
     * (the Carteira shows a clean empty state, billing never invents money).
     */
    academyPlanId: uuid('academy_plan_id'),
    status: studentStatus('status').notNull().default('active'),
    ...timestamps,
  },
  (t) => [
    unique('students_tenant_id_id_uq').on(t.tenantId, t.id),
    unique('students_tenant_user_uq').on(t.tenantId, t.userId),
    index('students_tenant_id_idx').on(t.tenantId),
    index('students_tenant_guardian_idx').on(t.tenantId, t.guardianId),
    foreignKey({
      name: 'students_guardian_fk',
      columns: [t.tenantId, t.guardianId],
      foreignColumns: [guardians.tenantId, guardians.id],
    }),
    foreignKey({
      name: 'students_academy_plan_fk',
      columns: [t.tenantId, t.academyPlanId],
      foreignColumns: [academyPlans.tenantId, academyPlans.id],
    }),
    pgPolicy('students_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);

/**
 * Classes (turmas) — recurring weekly training groups. The professor is a
 * plain user reference; the professor-membership role is validated in the
 * service (no person table for professors). `age_min`/`age_max` power the
 * Kids chip and the age-suggestion rule; `min_belt_id`/`max_belt_id` power
 * the turma belt-range chips (graduation slice).
 */
export const classes = pgTable(
  'classes',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    name: text('name').notNull(),
    /** Role (active professor membership) validated in the service. */
    professorUserId: uuid('professor_user_id')
      .notNull()
      .references(() => users.id),
    /** Student limit — "Lotada" when active enrollments reach it. */
    capacity: integer('capacity').notNull(),
    /** Optional age range (Kids: "4 a 12 anos"); NULL = no restriction. */
    ageMin: integer('age_min'),
    ageMax: integer('age_max'),
    /**
     * Optional belt range ("Branca a Azul" chips — spec 005 GRD.4 closing the
     * Phase-3 deferral). Plain catalog FKs: belts are global.
     */
    minBeltId: uuid('min_belt_id').references(() => belts.id),
    maxBeltId: uuid('max_belt_id').references(() => belts.id),
    status: classStatus('status').notNull().default('active'),
    ...timestamps,
  },
  (t) => [
    unique('classes_tenant_id_id_uq').on(t.tenantId, t.id),
    index('classes_tenant_id_idx').on(t.tenantId),
    pgPolicy('classes_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);

/**
 * Recurring weekly slots — one row per weekday chip ("Seg · Qua · Sex 19:00"
 * = 3 rows). Creating a turma with N chips inserts N rows in one transaction.
 */
export const classSchedules = pgTable(
  'class_schedules',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    classId: uuid('class_id').notNull(),
    /** 0 = Sunday … 6 = Saturday. */
    weekday: smallint('weekday').notNull(),
    startTime: time('start_time').notNull(),
    durationMinutes: integer('duration_minutes').notNull(),
    ...timestamps,
  },
  (t) => [
    unique('class_schedules_tenant_id_id_uq').on(t.tenantId, t.id),
    unique('class_schedules_tenant_class_weekday_time_uq').on(
      t.tenantId,
      t.classId,
      t.weekday,
      t.startTime,
    ),
    check('class_schedules_weekday_ck', sql`${t.weekday} BETWEEN 0 AND 6`),
    foreignKey({
      name: 'class_schedules_class_fk',
      columns: [t.tenantId, t.classId],
      foreignColumns: [classes.tenantId, classes.id],
    }),
    pgPolicy('class_schedules_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);

/**
 * Enrollments — student ↔ class membership under the capacity limit. One row
 * per (tenant, class, student): removing flips `status` to `removed`,
 * re-adding reactivates the same row (upsert on the unique key) — never a
 * second row. Capacity is enforced in the service under a `FOR UPDATE` lock
 * on the class row, inside the tenant transaction.
 */
export const enrollments = pgTable(
  'enrollments',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    classId: uuid('class_id').notNull(),
    studentId: uuid('student_id').notNull(),
    status: enrollmentStatus('status').notNull().default('active'),
    ...timestamps,
  },
  (t) => [
    unique('enrollments_tenant_id_id_uq').on(t.tenantId, t.id),
    unique('enrollments_tenant_class_student_uq').on(
      t.tenantId,
      t.classId,
      t.studentId,
    ),
    index('enrollments_tenant_student_idx').on(t.tenantId, t.studentId),
    foreignKey({
      name: 'enrollments_class_fk',
      columns: [t.tenantId, t.classId],
      foreignColumns: [classes.tenantId, classes.id],
    }),
    foreignKey({
      name: 'enrollments_student_fk',
      columns: [t.tenantId, t.studentId],
      foreignColumns: [students.tenantId, students.id],
    }),
    pgPolicy('enrollments_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);
