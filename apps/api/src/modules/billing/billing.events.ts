/**
 * Domain events for the billing slice (spec 006 — backend wayfinder 05).
 * Emitted on the `@nestjs/event-emitter` bus AFTER the tenant transaction
 * commits; notifications stay a listener-only concern (delivery is a later
 * slice), so dunning plugs in without touching billing.
 *
 * Guardian variants: when the charge carries a bill-to guardian (minor
 * dependents — the responsável is the payer of record) the same event name is
 * emitted with `audience: 'guardian'` and the guardian ids populated, so a
 * listener addresses the responsável instead of the aluno.
 */

export const BILLING_CHARGE_CREATED = 'billing.charge.created';
export const BILLING_CHARGE_PAID = 'billing.charge.paid';
export const BILLING_CHARGE_OVERDUE = 'billing.charge.overdue';
export const BILLING_CHARGE_REFUNDED = 'billing.charge.refunded';

interface ChargeEventBase {
  tenantId: string;
  chargeId: string;
  /**
   * What the charge bills for (spec 010 delta): listeners filter on it —
   * notifications ride `billing.charge.*` only for plan-origin charges;
   * event/order settlements are covered by their own richer events
   * (`events.registration.confirmed`, `store.order.paid`), so without the
   * filter every event/order payment would double-notify.
   */
  origin: 'plan' | 'event' | 'order';
  /** Null only on order-origin charges of a professor buyer (spec 009). */
  studentId: string | null;
  /** Bill-to guardian (minors); null = student pays self. */
  guardianId: string | null;
  /** Who the notification addresses — the guardian variant switch. */
  audience: 'student' | 'guardian';
  amountCents: number;
  currency: string;
  /** Tenant-local YYYY-MM-DD. */
  dueDate: string;
  /** Competência start (plan charges). */
  periodStart: string | null;
}

/** Nova cobrança — emitted only for rows actually inserted by materialization. */
export type ChargeCreatedEvent = ChargeEventBase;

/** Comprovante payload — the paid confirmation + receipt pointer. */
export interface ChargePaidEvent extends ChargeEventBase {
  paymentId: string;
  method: 'pix' | 'boleto' | 'card';
  /** ISO instant. */
  paidAt: string;
  receiptUrl: string | null;
}

/**
 * Cobrança automática da inadimplência: carries the deep link into the
 * Carteira Pix sheet. Emitted only for rows actually flipped open → overdue.
 */
export interface ChargeOverdueEvent extends ChargeEventBase {
  /** Mobile deep link into the Carteira payment sheet. */
  pixDeepLink: string;
}

export interface ChargeRefundedEvent extends ChargeEventBase {
  paymentId: string;
  providerRefundId: string | null;
}
