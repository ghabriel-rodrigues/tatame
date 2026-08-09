import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, eq, sql } from 'drizzle-orm';
import { charges, payments, withTenant, type DbHandle, type DbTransaction } from '@tatame/db';
import { APP_DB } from '../../../infra/db/db.module.js';
import type { ProviderEvent } from '../../../infra/payments/payment-provider.port.js';
import {
  BILLING_CHARGE_PAID,
  BILLING_CHARGE_REFUNDED,
  type ChargePaidEvent,
  type ChargeRefundedEvent,
} from '../billing.events.js';

/** Who a settlement is attributed to in the audit trail. */
export interface BillingActor {
  userId: string;
  impersonatorUserId: string | null;
}

export interface ProviderEventOutcome {
  /** false = idempotent no-op (unknown or already-final payment). */
  applied: boolean;
  paymentId?: string;
  chargeId?: string;
}

/**
 * THE normalized-event handler (backend wayfinder 05): every settlement —
 * simulate endpoint, inline card charge, mandate auto-settle at
 * materialization, admin refund, and the future Stripe webhook — funnels
 * through here, so the entire paid-flow (charge status, receipt, audit,
 * domain events, repasse read model) is exercised identically regardless of
 * provider. Idempotent under re-delivery: the payment row is resolved by the
 * `(provider, provider_payment_id)` unique key and already-final payments
 * no-op.
 *
 * v1 always has a request actor (the payer or the admin trigger); the Stripe
 * webhook stage introduces a system actor with the swap.
 */
@Injectable()
export class ProviderEventsService {
  private readonly logger = new Logger('BillingProviderEvents');

  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly events: EventEmitter2,
  ) {}

  async handleProviderEvent(
    event: ProviderEvent,
    actor: BillingActor,
  ): Promise<ProviderEventOutcome> {
    switch (event.type) {
      case 'payment.succeeded':
        return this.onPaymentSucceeded(event, actor);
      case 'payment.failed':
        return this.onPaymentFailed(event);
      case 'payment.refunded':
        return this.onPaymentRefunded(event, actor);
      default:
        // subscription.* — platform SaaS side, owned by the platform slice.
        this.logger.log(`Ignoring provider event ${event.type} (not consumed in v1)`);
        return { applied: false };
    }
  }

  private async onPaymentSucceeded(
    event: Extract<ProviderEvent, { type: 'payment.succeeded' }>,
    actor: BillingActor,
  ): Promise<ProviderEventOutcome> {
    let paid: ChargePaidEvent | null = null;
    const outcome = await withTenant(
      this.appDb.db,
      { tenantId: event.tenantId, userId: actor.userId },
      async (tx): Promise<ProviderEventOutcome> => {
        const payment = await this.paymentByProviderId(tx, event.provider, event.providerPaymentId);
        if (!payment) {
          this.logger.warn(`payment.succeeded for unknown ${event.providerPaymentId} — ignored`);
          return { applied: false };
        }
        // Idempotent re-delivery: a final payment never transitions again.
        if (payment.status !== 'pending') {
          return { applied: false, paymentId: payment.id, chargeId: payment.chargeId };
        }

        const paidAt = new Date(event.paidAt);
        const receiptUrl = `/v1/billing/payments/${payment.id}/receipt`;
        await tx
          .update(payments)
          .set({ status: 'succeeded', paidAt, receiptUrl, updatedAt: new Date() })
          .where(eq(payments.id, payment.id));

        const [charge] = await tx
          .select()
          .from(charges)
          .where(eq(charges.id, payment.chargeId));
        if (!charge) return { applied: false, paymentId: payment.id };

        if (charge.status === 'open' || charge.status === 'overdue') {
          await tx
            .update(charges)
            .set({ status: 'paid', updatedAt: new Date() })
            .where(eq(charges.id, charge.id));
          await this.audit(tx, event.tenantId, actor, 'billing.charge.paid', charge.id, {
            payment_id: payment.id,
            method: payment.method,
            provider: event.provider,
            provider_payment_id: event.providerPaymentId,
          });
          paid = {
            tenantId: event.tenantId,
            chargeId: charge.id,
            studentId: charge.studentId,
            guardianId: charge.guardianId,
            audience: charge.guardianId ? 'guardian' : 'student',
            amountCents: charge.amountCents,
            currency: charge.currency,
            dueDate: charge.dueDate,
            periodStart: charge.periodStart,
            paymentId: payment.id,
            method: payment.method,
            paidAt: paidAt.toISOString(),
            receiptUrl,
          };
        }
        return { applied: true, paymentId: payment.id, chargeId: charge.id };
      },
    );
    // Post-commit emission — only committed settlements reach listeners.
    if (paid) this.events.emit(BILLING_CHARGE_PAID, paid);
    return outcome;
  }

  private async onPaymentFailed(
    event: Extract<ProviderEvent, { type: 'payment.failed' }>,
  ): Promise<ProviderEventOutcome> {
    return withTenant(this.appDb.db, event.tenantId, async (tx) => {
      const payment = await this.paymentByProviderId(tx, event.provider, event.providerPaymentId);
      if (!payment || payment.status !== 'pending') {
        return { applied: false, paymentId: payment?.id, chargeId: payment?.chargeId };
      }
      await tx
        .update(payments)
        .set({ status: 'failed', updatedAt: new Date() })
        .where(eq(payments.id, payment.id));
      // The charge stays open — the aluno simply tries again.
      return { applied: true, paymentId: payment.id, chargeId: payment.chargeId };
    });
  }

  private async onPaymentRefunded(
    event: Extract<ProviderEvent, { type: 'payment.refunded' }>,
    actor: BillingActor,
  ): Promise<ProviderEventOutcome> {
    let refunded: ChargeRefundedEvent | null = null;
    const outcome = await withTenant(
      this.appDb.db,
      { tenantId: event.tenantId, userId: actor.userId },
      async (tx): Promise<ProviderEventOutcome> => {
        const payment = await this.paymentByProviderId(tx, event.provider, event.providerPaymentId);
        if (!payment) return { applied: false };
        // Only settled payments refund; re-delivery no-ops.
        if (payment.status !== 'succeeded') {
          return { applied: false, paymentId: payment.id, chargeId: payment.chargeId };
        }

        await tx
          .update(payments)
          .set({
            status: 'refunded',
            refundedAt: new Date(),
            providerRefundId: event.providerRefundId,
            refundReason: event.reason ?? null,
            updatedAt: new Date(),
          })
          .where(eq(payments.id, payment.id));

        const [charge] = await tx
          .select()
          .from(charges)
          .where(eq(charges.id, payment.chargeId));
        if (!charge) return { applied: true, paymentId: payment.id };

        if (charge.status === 'paid') {
          await tx
            .update(charges)
            .set({ status: 'refunded', updatedAt: new Date() })
            .where(eq(charges.id, charge.id));
          await this.audit(tx, event.tenantId, actor, 'billing.charge.refunded', charge.id, {
            payment_id: payment.id,
            provider_refund_id: event.providerRefundId,
            reason: event.reason ?? null,
          });
          refunded = {
            tenantId: event.tenantId,
            chargeId: charge.id,
            studentId: charge.studentId,
            guardianId: charge.guardianId,
            audience: charge.guardianId ? 'guardian' : 'student',
            amountCents: charge.amountCents,
            currency: charge.currency,
            dueDate: charge.dueDate,
            periodStart: charge.periodStart,
            paymentId: payment.id,
            providerRefundId: event.providerRefundId,
          };
        }
        return { applied: true, paymentId: payment.id, chargeId: charge.id };
      },
    );
    if (refunded) this.events.emit(BILLING_CHARGE_REFUNDED, refunded);
    return outcome;
  }

  private async paymentByProviderId(
    tx: DbTransaction,
    provider: 'simulated' | 'stripe',
    providerPaymentId: string,
  ) {
    const [row] = await tx
      .select()
      .from(payments)
      .where(
        and(eq(payments.provider, provider), eq(payments.providerPaymentId, providerPaymentId)),
      );
    return row ?? null;
  }

  /** In-transaction audit via the append-only SECURITY DEFINER seam. */
  private async audit(
    tx: DbTransaction,
    tenantId: string,
    actor: BillingActor,
    action: string,
    chargeId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await tx.execute(sql`
      SELECT audit_append(
        ${tenantId}::uuid,
        ${actor.userId}::uuid,
        ${actor.impersonatorUserId}::uuid,
        ${action},
        'charge',
        ${chargeId}::text,
        ${JSON.stringify(metadata)}::jsonb
      )
    `);
  }
}
