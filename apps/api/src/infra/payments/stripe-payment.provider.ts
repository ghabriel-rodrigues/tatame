import type {
  BoletoChargeResult,
  CardChargeResult,
  ChargeIntent,
  MandateIntent,
  PaymentProviderPort,
  PixChargeResult,
  ProviderEvent,
} from './payment-provider.port.js';

/**
 * Stage-2 driver stub (spec 006 two-stage decision, recorded — not
 * relitigated): Stripe Connect destination charges on a single platform
 * account. This class exists so the port stays compile-checked against the
 * swap; it is selected only by `PAYMENTS_PROVIDER=stripe` and every method
 * throws until the swap lands. The swap PR brings: the SDK dependency wired
 * here (`STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` config keys below), the
 * `@Public` webhook route with raw-body signature verification in
 * {@link StripePaymentProvider.verifyAndParseWebhook}, and the
 * `provider_webhook_events` dedup table — nothing in the billing module
 * changes (it consumes normalized events only).
 */
export class StripePaymentProvider implements PaymentProviderPort {
  readonly name = 'stripe' as const;

  constructor(
    /** `sk_…` — platform account secret key (stage 2, STRIPE_SECRET_KEY). */
    protected readonly secretKey: string | null = null,
    /** `whsec_…` — webhook signing secret (stage 2, STRIPE_WEBHOOK_SECRET). */
    protected readonly webhookSecret: string | null = null,
  ) {}

  private notConfigured(): never {
    throw new Error(
      'StripePaymentProvider is not configured — the Stripe Connect swap is stage 2 ' +
        '(spec 006). Run with PAYMENTS_PROVIDER=simulated.',
    );
  }

  async createPixCharge(_intent: ChargeIntent): Promise<PixChargeResult> {
    this.notConfigured();
  }

  async createBoletoCharge(_intent: ChargeIntent): Promise<BoletoChargeResult> {
    this.notConfigured();
  }

  async createCardCharge(
    _intent: ChargeIntent & { providerMandateId?: string | null },
  ): Promise<CardChargeResult> {
    this.notConfigured();
  }

  async createMandate(_intent: MandateIntent): Promise<{ providerMandateId: string }> {
    this.notConfigured();
  }

  async cancelMandate(_providerMandateId: string): Promise<void> {
    this.notConfigured();
  }

  async refund(_providerPaymentId: string): Promise<{ providerRefundId: string }> {
    this.notConfigured();
  }

  verifyAndParseWebhook(_rawBody: Buffer, _signature: string): ProviderEvent[] {
    this.notConfigured();
  }
}
