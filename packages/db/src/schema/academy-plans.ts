import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  integer,
  pgPolicy,
  pgTable,
  smallint,
  text,
  unique,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { academies } from './academies.js';
import { billingRecurrence } from './enums.js';
import { id, timestamps } from './helpers.js';
import { appRole } from './roles.js';

/**
 * Academy → student plan catalog (spec 006, BIL.1) — the admin's "planos de
 * mensalidade para alunos". Lives in its own module (not billing.ts) so
 * `students`/`invites` can harden their `academy_plan_id` stubs into
 * composite FKs without an import cycle (billing.ts imports enrollment.ts).
 *
 * Tenant-scoped (RLS class 1): fail-closed tenant policy on the
 * `app.tenant_id` GUC, `UNIQUE (tenant_id, id)` so children FK via composite
 * `(tenant_id, academy_plan_id)`. RLS is FORCED in the hardening migration
 * (mirrors 0002/0008).
 */

const tenantPolicy = (tenantId: AnyPgColumn) => ({
  using: sql`${tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
  withCheck: sql`${tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
});

/**
 * One mensalidade plan: name, integer-cents value, recurrence chip, due day.
 * `due_day` is capped at 28 (no February problems); the admin UI offers
 * exactly the handoff chips 5/10/15 — the DB stays permissive so a new chip
 * is not a migration. Archive is soft (`is_active`): history referencing the
 * plan stays intact, never hard-delete.
 */
export const academyPlans = pgTable(
  'academy_plans',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    name: text('name').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('BRL'),
    recurrence: billingRecurrence('recurrence').notNull(),
    /** Day of the cycle the charge falls due (1–28; UI chips 5/10/15). */
    dueDay: smallint('due_day').notNull(),
    /** Soft archive — archived plans refuse new assignment, keep history. */
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [
    unique('academy_plans_tenant_id_id_uq').on(t.tenantId, t.id),
    unique('academy_plans_tenant_name_uq').on(t.tenantId, t.name),
    index('academy_plans_tenant_id_idx').on(t.tenantId),
    check('academy_plans_amount_ck', sql`${t.amountCents} > 0`),
    check('academy_plans_due_day_ck', sql`${t.dueDay} BETWEEN 1 AND 28`),
    pgPolicy('academy_plans_tenant_all', { for: 'all', to: appRole, ...tenantPolicy(t.tenantId) }),
  ],
);
