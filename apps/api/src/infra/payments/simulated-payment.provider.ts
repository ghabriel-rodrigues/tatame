import type {
  BoletoChargeResult,
  CardChargeResult,
  ChargeIntent,
  MandateIntent,
  PaymentProviderPort,
  PixChargeResult,
  ProviderEvent,
} from './payment-provider.port.js';

/** Pix codes live for 24h in the simulated driver (display copy only). */
const PIX_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * The only runtime driver in v1 (spec 006 two-stage decision): deterministic,
 * network-free payloads keyed by charge id, stored verbatim in
 * `payments.provider_data` so all four clients render real-looking Pix QR /
 * boleto screens from day one. Settlement is the "Simular pagamento" endpoint
 * (which synthesizes `payment.succeeded` through the same normalized-event
 * handler the Stripe webhook will use); a card charge under an active mandate
 * settles inline at creation; refund emits `payment.refunded` instantly.
 *
 * Payload shapes mirror the BIL.5 seed fixtures exactly — the seeds are the
 * same strings this driver emits.
 */
export class SimulatedPaymentProvider implements PaymentProviderPort {
  readonly name = 'simulated' as const;

  async createPixCharge(intent: ChargeIntent): Promise<PixChargeResult> {
    const code = `TATAME-SIM-PIX-${intent.chargeId}`;
    return {
      providerPaymentId: `SIM-PIX-${intent.chargeId}`,
      qrPayload: code,
      copiaECola: code,
      expiresAt: new Date(Date.now() + PIX_TTL_MS).toISOString(),
    };
  }

  async createBoletoCharge(intent: ChargeIntent): Promise<BoletoChargeResult> {
    return {
      providerPaymentId: `SIM-BOLETO-${intent.chargeId}`,
      // Fixed template + amount (mirrors the seed fixture payload).
      linhaDigitavel: `23790.00000 00000.000000 00000.000000 0 0000${intent.amountCents}`,
      barcodePayload: `TATAME-SIM-BOLETO-${intent.chargeId}`,
      dueDate: intent.dueDate,
    };
  }

  async createCardCharge(
    intent: ChargeIntent & { providerMandateId?: string | null },
  ): Promise<CardChargeResult> {
    // Simulated cards always authorize; settlement rides the normalized
    // `payment.succeeded` handler (the caller synthesizes it inline).
    return {
      providerPaymentId: `SIM-CARD-${intent.chargeId}`,
      status: 'succeeded',
      card: { brand: 'visa', last4: '4242' },
    };
  }

  async createMandate(intent: MandateIntent): Promise<{ providerMandateId: string }> {
    return { providerMandateId: `SIM-MANDATE-${intent.studentId}` };
  }

  async cancelMandate(): Promise<void> {
    // Nothing to release provider-side in the simulated driver.
  }

  async refund(providerPaymentId: string): Promise<{ providerRefundId: string }> {
    return { providerRefundId: `SIM-REFUND-${providerPaymentId}` };
  }

  verifyAndParseWebhook(): ProviderEvent[] {
    // No webhooks in the simulated driver — the simulate endpoint synthesizes
    // normalized events directly.
    return [];
  }
}
