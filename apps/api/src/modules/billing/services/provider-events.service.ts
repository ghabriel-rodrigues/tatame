import { Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, eq, sql } from 'drizzle-orm';
import {
  charges,
  eventRegistrations,
  events as eventsTable,
  payments,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import { APP_DB } from '../../../infra/db/db.module.js';
import type { ProviderEvent } from '../../../infra/payments/payment-provider.port.js';
import {
  EVENTS_REGISTRATION_CANCELED,
  EVENTS_REGISTRATION_CONFIRMED,
  type RegistrationCanceledEvent,
  type RegistrationConfirmedEvent,
} from '../../events/events.events.js';
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
    let registrationConfirmed: RegistrationConfirmedEvent | null = null;
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
          await this.audit(tx, event.tenantId, actor, 'billing.charge.paid', 'charge', charge.id, {
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
          // Spec 008: settlement of an event-origin charge ALSO confirms its
          // registration — same handler, same transaction, so the simulate
          // button and the future Stripe webhook behave identically.
          registrationConfirmed = await this.confirmEventRegistration(
            tx,
            event.tenantId,
            actor,
            charge,
          );
        }
        return { applied: true, paymentId: payment.id, chargeId: charge.id };
      },
    );
    // Post-commit emission — only committed settlements reach listeners.
    if (paid) this.events.emit(BILLING_CHARGE_PAID, paid);
    if (registrationConfirmed) {
      this.events.emit(EVENTS_REGISTRATION_CONFIRMED, registrationConfirmed);
    }
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
    let registrationCanceled: RegistrationCanceledEvent | null = null;
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
          await this.audit(
            tx,
            event.tenantId,
            actor,
            'billing.charge.refunded',
            'charge',
            charge.id,
            {
              payment_id: payment.id,
              provider_refund_id: event.providerRefundId,
              reason: event.reason ?? null,
            },
          );
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
          // Spec 008: refunding an event-origin charge cancels its
          // registration — the audited admin refund is the only way a paid,
          // confirmed inscription is undone (recorded, never silently).
          registrationCanceled = await this.cancelEventRegistration(
            tx,
            event.tenantId,
            actor,
            charge,
          );
        }
        return { applied: true, paymentId: payment.id, chargeId: charge.id };
      },
    );
    if (refunded) this.events.emit(BILLING_CHARGE_REFUNDED, refunded);
    if (registrationCanceled) {
      this.events.emit(EVENTS_REGISTRATION_CANCELED, registrationCanceled);
    }
    return outcome;
  }

  /** `payment.succeeded` on an event charge: pending_payment → confirmed. */
  private async confirmEventRegistration(
    tx: DbTransaction,
    tenantId: string,
    actor: BillingActor,
    charge: typeof charges.$inferSelect,
  ): Promise<RegistrationConfirmedEvent | null> {
    if (charge.origin !== 'event' || !charge.eventRegistrationId) return null;
    const registration = await this.registrationOf(tx, charge.eventRegistrationId);
    if (!registration || registration.status === 'confirmed') return null;

    await tx
      .update(eventRegistrations)
      .set({ status: 'confirmed', canceledAt: null, updatedAt: new Date() })
      .where(eq(eventRegistrations.id, registration.id));
    await this.audit(
      tx,
      tenantId,
      actor,
      'events.registration.confirmed',
      'event_registration',
      registration.id,
      { event_id: registration.eventId, student_id: registration.studentId, charge_id: charge.id },
    );
    return {
      tenantId,
      eventId: registration.eventId,
      eventName: registration.eventName,
      registrationId: registration.id,
      studentId: registration.studentId,
      guardianId: charge.guardianId,
      audience: charge.guardianId ? 'guardian' : 'student',
      priceCents: registration.priceCents,
    };
  }

  /** `payment.refunded` on an event charge: confirmed → canceled. */
  private async cancelEventRegistration(
    tx: DbTransaction,
    tenantId: string,
    actor: BillingActor,
    charge: typeof charges.$inferSelect,
  ): Promise<RegistrationCanceledEvent | null> {
    if (charge.origin !== 'event' || !charge.eventRegistrationId) return null;
    const registration = await this.registrationOf(tx, charge.eventRegistrationId);
    if (!registration || registration.status === 'canceled') return null;

    await tx
      .update(eventRegistrations)
      .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
      .where(eq(eventRegistrations.id, registration.id));
    await this.audit(
      tx,
      tenantId,
      actor,
      'events.registration.canceled',
      'event_registration',
      registration.id,
      {
        event_id: registration.eventId,
        student_id: registration.studentId,
        charge_id: charge.id,
        via: 'refund',
      },
    );
    return {
      tenantId,
      eventId: registration.eventId,
      eventName: registration.eventName,
      registrationId: registration.id,
      studentId: registration.studentId,
      guardianId: charge.guardianId,
      audience: charge.guardianId ? 'guardian' : 'student',
      priceCents: registration.priceCents,
      via: 'refund',
    };
  }

  private async registrationOf(tx: DbTransaction, registrationId: string) {
    const [row] = await tx
      .select({
        id: eventRegistrations.id,
        eventId: eventRegistrations.eventId,
        studentId: eventRegistrations.studentId,
        status: eventRegistrations.status,
        eventName: eventsTable.name,
        priceCents: eventsTable.priceCents,
      })
      .from(eventRegistrations)
      .innerJoin(
        eventsTable,
        and(
          eq(eventsTable.tenantId, eventRegistrations.tenantId),
          eq(eventsTable.id, eventRegistrations.eventId),
        ),
      )
      .where(eq(eventRegistrations.id, registrationId));
    return row ?? null;
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
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await tx.execute(sql`
      SELECT audit_append(
        ${tenantId}::uuid,
        ${actor.userId}::uuid,
        ${actor.impersonatorUserId}::uuid,
        ${action},
        ${targetType},
        ${targetId}::text,
        ${JSON.stringify(metadata)}::jsonb
      )
    `);
  }
}
