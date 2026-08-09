/**
 * Payment-provider seam (spec 006, BIL.6 — implements backend wayfinder
 * ticket 05 verbatim). Same port/driver/config-factory pattern as the
 * notifications seam: the `billing` domain module is the ONLY consumer and
 * never imports a provider SDK. The billing service consumes ONLY normalized
 * {@link ProviderEvent}s — whether they came from the simulated endpoint or
 * the future Stripe webhook is invisible downstream, so the stage-2 swap is a
 * driver-only change.
 */
export const PAYMENT_PROVIDER_PORT = Symbol('PAYMENT_PROVIDER_PORT');

export type PaymentProviderName = 'simulated' | 'stripe';

/** What the driver needs to open a settlement attempt against a charge. */
export interface ChargeIntent {
  tenantId: string;
  chargeId: string;
  amountCents: number;
  currency: string;
  /** Tenant-local YYYY-MM-DD the charge falls due (boleto vencimento). */
  dueDate: string;
  /** Client copy, e.g. "Mensalidade de agosto · Horizonte BJJ". */
  description?: string;
}

export interface MandateIntent {
  tenantId: string;
  studentId: string;
  payerUserId: string;
  /** v1: `card` only (Pix/boleto mandates are out of scope). */
  method: 'card';
}

export interface PixChargeResult {
  providerPaymentId: string;
  /** QR payload — clients render the QR from this string. */
  qrPayload: string;
  copiaECola: string;
  /** ISO instant the Pix code expires. */
  expiresAt: string;
}

export interface BoletoChargeResult {
  providerPaymentId: string;
  linhaDigitavel: string;
  barcodePayload: string;
  /** Tenant-local YYYY-MM-DD boleto vencimento. */
  dueDate: string;
}

export interface CardChargeResult {
  providerPaymentId: string;
  /** `succeeded` settles inline (simulated card / active mandate). */
  status: 'succeeded' | 'pending' | 'failed';
  card: { brand: string; last4: string };
}

/**
 * Normalized provider event union — the ONE shape the billing service
 * consumes. The simulated driver synthesizes these; the Stripe driver's
 * webhook verification will parse into the same union. `tenantId` rides the
 * event (Stripe stage: from PaymentIntent metadata) so the handler can bind
 * the RLS context without a cross-tenant lookup.
 */
export type ProviderEvent =
  | {
      type: 'payment.succeeded';
      provider: PaymentProviderName;
      tenantId: string;
      providerPaymentId: string;
      /** ISO instant of settlement. */
      paidAt: string;
    }
  | {
      type: 'payment.failed';
      provider: PaymentProviderName;
      tenantId: string;
      providerPaymentId: string;
      reason?: string;
    }
  | {
      type: 'payment.refunded';
      provider: PaymentProviderName;
      tenantId: string;
      providerPaymentId: string;
      providerRefundId: string;
      reason?: string;
    }
  | {
      type: 'subscription.past_due';
      provider: PaymentProviderName;
      providerSubscriptionId: string;
    }
  | {
      type: 'subscription.active';
      provider: PaymentProviderName;
      providerSubscriptionId: string;
    };

export interface PaymentProviderPort {
  /** Which driver this is — written into `payments.provider`. */
  readonly name: PaymentProviderName;

  createPixCharge(intent: ChargeIntent): Promise<PixChargeResult>;

  createBoletoCharge(intent: ChargeIntent): Promise<BoletoChargeResult>;

  /**
   * Card settlement attempt. With `mandateId` (active recurrence) the
   * simulated driver settles inline at creation — the auto-settle path of the
   * materialization pass rides this.
   */
  createCardCharge(
    intent: ChargeIntent & { providerMandateId?: string | null },
  ): Promise<CardChargeResult>;

  /** Card recurrence opt-in ("recorrência ativa" toggle). */
  createMandate(intent: MandateIntent): Promise<{ providerMandateId: string }>;

  cancelMandate(providerMandateId: string): Promise<void>;

  /** Estorno — full refund only in v1. */
  refund(providerPaymentId: string): Promise<{ providerRefundId: string }>;

  /**
   * Webhook verification → normalized events. The simulated driver has no
   * webhooks (the simulate endpoint synthesizes events directly); the Stripe
   * driver implements signature verification here at the stage-2 swap.
   */
  verifyAndParseWebhook(rawBody: Buffer, signature: string): ProviderEvent[];
}
