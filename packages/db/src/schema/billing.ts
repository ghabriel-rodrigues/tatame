import { sql } from 'drizzle-orm';
import {
  char,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
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
import { academyPlans } from './academy-plans.js';
import { users } from './auth.js';
import { guardians, students } from './enrollment.js';
import { eventRegistrations } from './events.js';
import { orders } from './store.js';
import {
  chargeOrigin,
  chargeStatus,
  mandateStatus,
  paymentMethod,
  paymentProvider,
  paymentStatus,
} from './enums.js';
import { id, timestamps } from './helpers.js';
import { appRole } from './roles.js';

/**
 * Billing slice (spec 006, BIL.2/BIL.3) — implements the resolved money
 * ticket (database wayfinder 05) verbatim: charges (one receivable per
 * student per cycle), payments (settlement attempts carrying provider ids and
 * render-ready payloads), payment_mandates (card "recorrência ativa" opt-in)
 * and billing_customers (Stripe Customer mapping, empty in v1).
 *
 * All tenant-scoped (RLS class 1): fail-closed tenant policy on the
 * `app.tenant_id` GUC, `UNIQUE (tenant_id, id)` + composite `(tenant_id, …)`
 * FKs so money can never reference another academy's rows. RLS is FORCED in
 * the hardening migration. Charges and payments are NOT append-only (status
 * mutates); money truth is protected by the audit trail plus provider ids.
 */

const tenantPolicy = (tenantId: AnyPgColumn) => ({
  using: sql`${tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
  withCheck: sql`${tenantId} = NULLIF(current_setting('app.tenant_id', true), '')::uuid`,
});

/**
 * One receivable ("cobrança"), any origin. Origin is hardened to per-origin
 * columns + CHECK (polymorphic bare uuid rejected): exactly the column
 * matching `origin` is non-null. All three per-origin columns are composite
 * tenant FKs — `academy_plan_id` since BIL.2, `event_registration_id` since
 * spec 008 EVT.2, and `order_id` since spec 009 STO.2 closed the last BIL.2
 * stub (same hardening pattern as the Phase-3 `invites.class_id` migration).
 */
export const charges = pgTable(
  'charges',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    /**
     * Who the charge is *about*. Required for plan/event origins; nullable
     * only on order origin (spec 009 STO.2 relaxation): order charges are
     * addressed by the order's buyer, and a professor buyer has no student
     * row. A student buyer's order charge still sets it so the Carteira
     * histórico picks the payment up.
     */
    studentId: uuid('student_id'),
    /**
     * Bill-to for minors, denormalized at issuance (the responsável is the
     * payer of record); NULL = student pays self.
     */
    guardianId: uuid('guardian_id'),
    origin: chargeOrigin('origin').notNull(),
    /** Set iff origin = 'plan' (composite tenant FK). */
    academyPlanId: uuid('academy_plan_id'),
    /** Set iff origin = 'event' (composite tenant FK — spec 008 EVT.2). */
    eventRegistrationId: uuid('event_registration_id'),
    /** Set iff origin = 'order' (composite tenant FK — spec 009 STO.2). */
    orderId: uuid('order_id'),
    /** Competência of a plan cycle (with period_end); NULL for other origins. */
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    amountCents: integer('amount_cents').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('BRL'),
    /** From the plan's due_day for plan charges. */
    dueDate: date('due_date').notNull(),
    status: chargeStatus('status').notNull().default('open'),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('charges_tenant_id_id_uq').on(t.tenantId, t.id),
    // Admin financial overview + previsão de recebimentos (ticket 03 index).
    index('charges_tenant_status_due_date_idx').on(
      t.tenantId,
      t.status,
      t.dueDate,
    ),
    // Wallet/histórico lookups per student.
    index('charges_tenant_student_idx').on(t.tenantId, t.studentId),
    // Exactly the column matching `origin` is non-null.
    check(
      'charges_origin_ck',
      sql`(${t.origin} = 'plan' AND ${t.academyPlanId} IS NOT NULL AND ${t.eventRegistrationId} IS NULL AND ${t.orderId} IS NULL)
       OR (${t.origin} = 'event' AND ${t.eventRegistrationId} IS NOT NULL AND ${t.academyPlanId} IS NULL AND ${t.orderId} IS NULL)
       OR (${t.origin} = 'order' AND ${t.orderId} IS NOT NULL AND ${t.academyPlanId} IS NULL AND ${t.eventRegistrationId} IS NULL)`,
    ),
    // Plan charges always carry their competência — the idempotency key below
    // would silently admit duplicates on NULL period_start otherwise.
    check(
      'charges_plan_period_ck',
      sql`${t.origin} <> 'plan' OR ${t.periodStart} IS NOT NULL`,
    ),
    // student_id is optional only for order-origin charges (professor buyers
    // have no student row); plan and event charges are always about a student.
    check(
      'charges_student_origin_ck',
      sql`${t.origin} = 'order' OR ${t.studentId} IS NOT NULL`,
    ),
    // Charge-materialization idempotency key (backend ticket 05): two
    // concurrent wallet opens insert-on-conflict-do-nothing against this.
    uniqueIndex('charges_plan_cycle_uq')
      .on(t.tenantId, t.studentId, t.academyPlanId, t.periodStart)
      .where(sql`${t.origin} = 'plan'`),
    foreignKey({
      name: 'charges_student_fk',
      columns: [t.tenantId, t.studentId],
      foreignColumns: [students.tenantId, students.id],
    }),
    foreignKey({
      name: 'charges_guardian_fk',
      columns: [t.tenantId, t.guardianId],
      foreignColumns: [guardians.tenantId, guardians.id],
    }),
    foreignKey({
      name: 'charges_academy_plan_fk',
      columns: [t.tenantId, t.academyPlanId],
      foreignColumns: [academyPlans.tenantId, academyPlans.id],
    }),
    foreignKey({
      name: 'charges_event_registration_fk',
      columns: [t.tenantId, t.eventRegistrationId],
      foreignColumns: [eventRegistrations.tenantId, eventRegistrations.id],
    }),
    foreignKey({
      name: 'charges_order_fk',
      columns: [t.tenantId, t.orderId],
      foreignColumns: [orders.tenantId, orders.id],
    }),
    pgPolicy('charges_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);

/**
 * One settlement attempt against a charge. `provider_data` is the snapshot
 * clients render (Pix QR payload + copia-e-cola, boleto linha digitável +
 * barcode — deterministic strings from the simulated driver). The partial
 * unique on (provider, provider_payment_id) is the webhook/re-delivery
 * idempotency key. Refund columns are full-refund only in v1 (the handoff's
 * "1 dia útil" is provider SLA copy, not schema).
 */
export const payments = pgTable(
  'payments',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    chargeId: uuid('charge_id').notNull(),
    method: paymentMethod('method').notNull(),
    status: paymentStatus('status').notNull().default('pending'),
    amountCents: integer('amount_cents').notNull(),
    currency: char('currency', { length: 3 }).notNull().default('BRL'),
    provider: paymentProvider('provider').notNull(),
    /** Stripe: `pi_…`; simulated: generated. */
    providerPaymentId: text('provider_payment_id'),
    providerData: jsonb('provider_data'),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    /** Comprovante; the simulated driver renders an internal receipt route. */
    receiptUrl: text('receipt_url'),
    refundedAt: timestamp('refunded_at', { withTimezone: true }),
    providerRefundId: text('provider_refund_id'),
    refundReason: text('refund_reason'),
    ...timestamps,
  },
  (t) => [
    unique('payments_tenant_id_id_uq').on(t.tenantId, t.id),
    index('payments_tenant_charge_idx').on(t.tenantId, t.chargeId),
    uniqueIndex('payments_provider_payment_uq')
      .on(t.provider, t.providerPaymentId)
      .where(sql`${t.providerPaymentId} IS NOT NULL`),
    foreignKey({
      name: 'payments_charge_fk',
      columns: [t.tenantId, t.chargeId],
      foreignColumns: [charges.tenantId, charges.id],
    }),
    pgPolicy('payments_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);

/**
 * Card recurrence opt-in ("recorrência ativa" toggle). Charges are still
 * materialized per cycle; an active mandate just means the provider driver
 * auto-settles them at due date. At most one active mandate per student
 * (partial unique); cancel + re-opt-in creates a fresh row.
 */
export const paymentMandates = pgTable(
  'payment_mandates',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    studentId: uuid('student_id').notNull(),
    /** Who pays: the aluno themself or the responsável (guardian) login. */
    payerUserId: uuid('payer_user_id')
      .notNull()
      .references(() => users.id),
    /** v1: `card` only (Pix/boleto mandates are out of scope). */
    method: paymentMethod('method').notNull(),
    status: mandateStatus('status').notNull().default('active'),
    provider: paymentProvider('provider').notNull(),
    /** Stripe: PaymentMethod/SetupIntent id; simulated: generated. */
    providerMandateId: text('provider_mandate_id'),
    canceledAt: timestamp('canceled_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    unique('payment_mandates_tenant_id_id_uq').on(t.tenantId, t.id),
    index('payment_mandates_tenant_student_idx').on(t.tenantId, t.studentId),
    uniqueIndex('payment_mandates_single_active_uq')
      .on(t.tenantId, t.studentId)
      .where(sql`${t.status} = 'active'`),
    foreignKey({
      name: 'payment_mandates_student_fk',
      columns: [t.tenantId, t.studentId],
      foreignColumns: [students.tenantId, students.id],
    }),
    pgPolicy('payment_mandates_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);

/**
 * User ↔ provider-customer mapping — one Stripe Customer per paying user per
 * academy context (a guardian paying in two academies is two Customers;
 * Customers live under the platform account with destination charges, so the
 * tenant-scoped row keeps contexts clean). Created now so the stage-2 swap is
 * migration-free; **empty in v1** — the simulated driver never writes it.
 */
export const billingCustomers = pgTable(
  'billing_customers',
  {
    id: id(),
    tenantId: uuid('tenant_id')
      .notNull()
      .references(() => academies.id),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id),
    provider: paymentProvider('provider').notNull(),
    providerCustomerId: text('provider_customer_id').notNull(),
    ...timestamps,
  },
  (t) => [
    unique('billing_customers_tenant_id_id_uq').on(t.tenantId, t.id),
    unique('billing_customers_tenant_user_provider_uq').on(
      t.tenantId,
      t.userId,
      t.provider,
    ),
    pgPolicy('billing_customers_tenant_all', {
      for: 'all',
      to: appRole,
      ...tenantPolicy(t.tenantId),
    }),
  ],
);
