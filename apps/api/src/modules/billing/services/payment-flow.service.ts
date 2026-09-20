import { Inject, Injectable } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';
import {
  academies,
  academyPlans,
  charges,
  guardians,
  orders,
  paymentMandates,
  payments,
  students,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import {
  APP_CONFIG,
  type AppConfig,
} from '../../../infra/config/app-config.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import {
  PAYMENT_PROVIDER_PORT,
  type PaymentProviderPort,
} from '../../../infra/payments/payment-provider.port.js';
import { localDate } from '../../attendance/lib/time.js';
import {
  ProviderEventsService,
  type BillingActor,
} from './provider-events.service.js';

/**
 * `buyer` is the persona-neutral order-charge ownership (spec 009): the payer
 * is whoever placed the order (student or professor), matched on the order's
 * `buyer_user_id` — professors have no student row to match on.
 */
export type PayerKind = 'student' | 'guardian' | 'buyer';

export interface CreatePaymentInput {
  method: 'pix' | 'boleto' | 'card';
  /** Card only: "Usar este cartão na recorrência mensal" toggle. */
  recurrence?: boolean;
  card?: { holderName?: string; last4?: string };
}

export interface PaymentView {
  id: string;
  chargeId: string;
  method: 'pix' | 'boleto' | 'card';
  status: 'pending' | 'succeeded' | 'failed' | 'refunded';
  amountCents: number;
  currency: string;
  provider: 'simulated' | 'stripe';
  providerData: unknown;
  paidAt: string | null;
  receiptUrl: string | null;
}

export interface ChargeView {
  id: string;
  /** Null only on order-origin charges of a professor buyer (spec 009). */
  studentId: string | null;
  guardianId: string | null;
  status: 'open' | 'paid' | 'overdue' | 'canceled' | 'refunded';
  /** Derived truth (`open AND due_date < today`) — never trusts the flip. */
  overdue: boolean;
  amountCents: number;
  currency: string;
  dueDate: string;
  periodStart: string | null;
  periodEnd: string | null;
  academyPlanId: string | null;
}

const asActor = (ctx: AuthContext): BillingActor => ({
  userId: ctx.userId,
  impersonatorUserId: ctx.impersonatorUserId,
});

export function toChargeView(
  row: typeof charges.$inferSelect,
  todayIso: string,
): ChargeView {
  return {
    id: row.id,
    studentId: row.studentId,
    guardianId: row.guardianId,
    status: row.status,
    overdue:
      (row.status === 'open' || row.status === 'overdue') &&
      row.dueDate < todayIso,
    amountCents: row.amountCents,
    currency: row.currency,
    dueDate: row.dueDate,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    academyPlanId: row.academyPlanId,
  };
}

export function toPaymentView(row: typeof payments.$inferSelect): PaymentView {
  return {
    id: row.id,
    chargeId: row.chargeId,
    method: row.method,
    status: row.status,
    amountCents: row.amountCents,
    currency: row.currency,
    provider: row.provider,
    providerData: row.providerData,
    paidAt: row.paidAt ? row.paidAt.toISOString() : null,
    receiptUrl: row.receiptUrl,
  };
}

/**
 * Settlement attempts, mandates, simulate, receipt and refund (spec 006,
 * BIL.8/BIL.10). The only consumer of the PaymentProviderPort besides the
 * materialization auto-settle (which delegates to {@link settleCardCharge}).
 * All settlements funnel through the normalized-event handler.
 */
@Injectable()
export class PaymentFlowService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PAYMENT_PROVIDER_PORT)
    private readonly provider: PaymentProviderPort,
    private readonly providerEvents: ProviderEventsService,
  ) {}

  /**
   * One settlement attempt against an owned charge. Pix/boleto return the
   * render-ready provider payload (pending until simulate/webhook); card
   * settles inline through the normalized handler; the recurrence toggle
   * creates the card mandate in the same gesture.
   */
  async createPayment(
    ctx: AuthContext & { tenantId: string },
    payer: PayerKind,
    chargeId: string,
    input: CreatePaymentInput,
  ): Promise<{
    payment: PaymentView;
    charge: ChargeView;
    mandateCreated: boolean;
  }> {
    if (input.recurrence && input.method !== 'card') {
      throw problem(
        422,
        ErrorCodes.BILLING_METHOD_MANDATE_MISMATCH,
        'Recurrence (mandate) is card-only in v1',
      );
    }

    const today = localDate();
    const prepared = await withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx) => {
        const charge = await this.ownedCharge(tx, ctx, payer, chargeId);
        this.assertPayable(charge);

        let mandateCreated = false;
        let providerMandateId: string | null = null;
        if (input.method === 'card') {
          // Mandates are per-student; a studentless (professor order) charge
          // cannot anchor one. Card-inline settle would still work, but v1
          // keeps store purchases Pix-only at the route DTO anyway.
          if (input.recurrence && !charge.studentId) {
            throw problem(
              422,
              ErrorCodes.BILLING_METHOD_MANDATE_MISMATCH,
              'Recurrence requires a student-addressed charge',
            );
          }
          const active = charge.studentId
            ? await this.activeMandate(tx, charge.studentId)
            : null;
          if (input.recurrence && charge.studentId) {
            if (active) {
              throw problem(
                409,
                ErrorCodes.BILLING_MANDATE_ALREADY_ACTIVE,
                'A card recurrence is already active for this student',
              );
            }
            const created = await this.provider.createMandate({
              tenantId: ctx.tenantId,
              studentId: charge.studentId,
              payerUserId: ctx.userId,
              method: 'card',
            });
            providerMandateId = created.providerMandateId;
            const [mandate] = await tx
              .insert(paymentMandates)
              .values({
                tenantId: ctx.tenantId,
                studentId: charge.studentId,
                payerUserId: ctx.userId,
                method: 'card',
                status: 'active',
                provider: this.provider.name,
                providerMandateId,
              })
              .returning({ id: paymentMandates.id });
            if (!mandate)
              throw problem(
                500,
                ErrorCodes.INTERNAL,
                'Mandate insert returned no row',
              );
            await this.auditMandate(
              tx,
              ctx,
              'billing.mandate.created',
              mandate.id,
              {
                student_id: charge.studentId,
                method: 'card',
              },
            );
            mandateCreated = true;
          } else if (active) {
            providerMandateId = active.providerMandateId;
          }
        }

        const attempt = await this.openAttempt(
          tx,
          ctx.tenantId,
          charge,
          input,
          providerMandateId,
        );
        return {
          charge,
          payment: attempt.payment,
          settleAs: attempt.settleAs,
          mandateCreated,
        };
      },
    );

    // Card settles inline — through the SAME normalized-event handler the
    // Stripe webhook will use (contract: the provider is invisible below it).
    if (input.method === 'card' && prepared.settleAs) {
      await this.providerEvents.handleProviderEvent(
        {
          type: 'payment.succeeded',
          provider: this.provider.name,
          tenantId: ctx.tenantId,
          providerPaymentId: prepared.settleAs,
          paidAt: new Date().toISOString(),
        },
        asActor(ctx),
      );
    }

    const fresh = await this.readPair(ctx.tenantId, prepared.payment.id);
    return {
      payment: toPaymentView(fresh.payment),
      charge: toChargeView(fresh.charge, today),
      mandateCreated: prepared.mandateCreated,
    };
  }

  /**
   * Materialization auto-settle path: charge an open receivable against its
   * student's active mandate. Same normalized-handler funnel as everything
   * else; idempotent per the deterministic provider payment id.
   */
  async settleCardCharge(
    actor: BillingActor,
    tenantId: string,
    charge: typeof charges.$inferSelect,
    providerMandateId: string | null,
  ): Promise<void> {
    const result = await this.provider.createCardCharge({
      tenantId,
      chargeId: charge.id,
      amountCents: charge.amountCents,
      currency: charge.currency,
      dueDate: charge.dueDate,
      providerMandateId,
    });
    await withTenant(
      this.appDb.db,
      { tenantId, userId: actor.userId },
      async (tx) => {
        await this.ensurePendingPayment(tx, tenantId, charge, {
          method: 'card',
          providerPaymentId: result.providerPaymentId,
          providerData: {
            ...result.card,
            recurring: Boolean(providerMandateId),
          },
        });
      },
    );
    if (result.status === 'succeeded') {
      await this.providerEvents.handleProviderEvent(
        {
          type: 'payment.succeeded',
          provider: this.provider.name,
          tenantId,
          providerPaymentId: result.providerPaymentId,
          paidAt: new Date().toISOString(),
        },
        actor,
      );
    }
  }

  /**
   * The handoff's "Simular pagamento" / "Simular compensação" button: exists
   * ONLY when the simulated provider is configured (404 otherwise — a driver
   * affordance, never a production backdoor). Synthesizes `payment.succeeded`
   * through the exact handler the Stripe webhook will use.
   */
  async simulate(
    ctx: AuthContext & { tenantId: string },
    paymentId: string,
  ): Promise<{ payment: PaymentView; charge: ChargeView }> {
    if (
      this.config.paymentsProvider !== 'simulated' ||
      this.provider.name !== 'simulated'
    ) {
      throw problem(404, ErrorCodes.NOT_FOUND, 'Not found');
    }
    const today = localDate();
    const payment = await withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx) => {
        const [row] = await tx
          .select()
          .from(payments)
          .where(eq(payments.id, paymentId));
        if (!row) throw problem(404, ErrorCodes.NOT_FOUND, 'Payment not found');
        // Order charges are persona-neutral: ownership is the order's buyer
        // (spec 009 — a professor buyer has no student row to match on).
        const [target] = await tx
          .select()
          .from(charges)
          .where(eq(charges.id, row.chargeId));
        const payer: PayerKind =
          target?.origin === 'order'
            ? 'buyer'
            : ctx.role === 'guardian'
              ? 'guardian'
              : 'student';
        const charge = await this.ownedCharge(tx, ctx, payer, row.chargeId);
        this.assertPayable(charge);
        if (row.status !== 'pending') {
          throw problem(
            409,
            ErrorCodes.BILLING_CHARGE_NOT_PAYABLE,
            'This payment attempt is already settled',
          );
        }
        if (!row.providerPaymentId) {
          throw problem(
            500,
            ErrorCodes.INTERNAL,
            'Payment attempt has no provider id',
          );
        }
        return row;
      },
    );

    await this.providerEvents.handleProviderEvent(
      {
        type: 'payment.succeeded',
        provider: payment.provider,
        tenantId: ctx.tenantId,
        providerPaymentId: payment.providerPaymentId as string,
        paidAt: new Date().toISOString(),
      },
      asActor(ctx),
    );

    const fresh = await this.readPair(ctx.tenantId, payment.id);
    return {
      payment: toPaymentView(fresh.payment),
      charge: toChargeView(fresh.charge, today),
    };
  }

  /** Comprovante data for a settled payment (student/guardian/admin). */
  async receipt(ctx: AuthContext & { tenantId: string }, paymentId: string) {
    const today = localDate();
    return withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx) => {
        const [row] = await tx
          .select({
            payment: payments,
            charge: charges,
            studentName: students.fullName,
            planName: academyPlans.name,
          })
          .from(payments)
          .innerJoin(
            charges,
            and(
              eq(charges.tenantId, payments.tenantId),
              eq(charges.id, payments.chargeId),
            ),
          )
          .leftJoin(
            students,
            and(
              eq(students.tenantId, charges.tenantId),
              eq(students.id, charges.studentId),
            ),
          )
          .leftJoin(
            academyPlans,
            and(
              eq(academyPlans.tenantId, charges.tenantId),
              eq(academyPlans.id, charges.academyPlanId),
            ),
          )
          .where(eq(payments.id, paymentId));
        if (!row) throw problem(404, ErrorCodes.NOT_FOUND, 'Payment not found');

        // Ownership: admin sees any tenant payment; aluno their own charges;
        // responsável their dependents'. Foreign = 404, never 403.
        if (ctx.role === 'student') {
          const student = await this.studentOf(tx, ctx.userId);
          if (!student || student.id !== row.charge.studentId) {
            throw problem(404, ErrorCodes.NOT_FOUND, 'Payment not found');
          }
        } else if (ctx.role === 'guardian') {
          const guardian = await this.guardianOf(tx, ctx.userId);
          const chargeStudentId = row.charge.studentId;
          const [dependent] =
            guardian && chargeStudentId
              ? await tx
                  .select({ id: students.id })
                  .from(students)
                  .where(
                    and(
                      eq(students.id, chargeStudentId),
                      eq(students.guardianId, guardian.id),
                    ),
                  )
              : [];
          if (!dependent)
            throw problem(404, ErrorCodes.NOT_FOUND, 'Payment not found');
        }

        // A comprovante exists only once settled.
        if (
          row.payment.status !== 'succeeded' &&
          row.payment.status !== 'refunded'
        ) {
          throw problem(
            404,
            ErrorCodes.NOT_FOUND,
            'No receipt for an unsettled payment',
          );
        }

        const [academy] = await tx
          .select({ name: academies.name })
          .from(academies)
          .where(eq(academies.id, ctx.tenantId));

        return {
          payment: toPaymentView(row.payment),
          charge: toChargeView(row.charge, today),
          studentName: row.studentName,
          planName: row.planName,
          academyName: academy?.name ?? null,
        };
      },
    );
  }

  /** Audited admin full refund via the provider path — no row editing. */
  async refund(
    ctx: AuthContext & { tenantId: string },
    paymentId: string,
    reason?: string,
  ): Promise<{ payment: PaymentView; charge: ChargeView }> {
    const target = await withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx) => {
        const [row] = await tx
          .select()
          .from(payments)
          .where(eq(payments.id, paymentId));
        if (!row) throw problem(404, ErrorCodes.NOT_FOUND, 'Payment not found');
        if (row.status !== 'succeeded' || !row.providerPaymentId) {
          throw problem(
            409,
            ErrorCodes.BILLING_REFUND_UNSETTLED,
            'Only settled payments can be refunded',
          );
        }
        return row;
      },
    );

    const { providerRefundId } = await this.provider.refund(
      target.providerPaymentId as string,
    );
    // Simulated driver: instant `payment.refunded` through the same handler.
    await this.providerEvents.handleProviderEvent(
      {
        type: 'payment.refunded',
        provider: target.provider,
        tenantId: ctx.tenantId,
        providerPaymentId: target.providerPaymentId as string,
        providerRefundId,
        reason,
      },
      asActor(ctx),
    );

    // The admin trigger itself is audited with impersonation attribution
    // (spec: materialize + refund are audited admin actions).
    await withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      (tx) =>
        tx.execute(sql`
        SELECT audit_append(
          ${ctx.tenantId}::uuid,
          ${ctx.userId}::uuid,
          ${ctx.impersonatorUserId}::uuid,
          'billing.payment.refunded',
          'payment',
          ${target.id}::text,
          ${JSON.stringify({
            charge_id: target.chargeId,
            provider_refund_id: providerRefundId,
            reason: reason ?? null,
          })}::jsonb
        )
      `),
    );

    const fresh = await this.readPair(ctx.tenantId, target.id);
    return {
      payment: toPaymentView(fresh.payment),
      charge: toChargeView(fresh.charge, localDate()),
    };
  }

  /** Cancelar recorrência — flips the single active mandate; audited. */
  async cancelMandate(ctx: AuthContext & { tenantId: string }): Promise<void> {
    await withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx) => {
        const student = await this.studentOf(tx, ctx.userId);
        if (!student)
          throw problem(404, ErrorCodes.NOT_FOUND, 'No active student record');
        const mandate = await this.activeMandate(tx, student.id);
        if (!mandate)
          throw problem(404, ErrorCodes.NOT_FOUND, 'No active recurrence');
        if (mandate.providerMandateId) {
          await this.provider.cancelMandate(mandate.providerMandateId);
        }
        await tx
          .update(paymentMandates)
          .set({
            status: 'canceled',
            canceledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(paymentMandates.id, mandate.id));
        await this.auditMandate(
          tx,
          ctx,
          'billing.mandate.canceled',
          mandate.id,
          {
            student_id: student.id,
          },
        );
      },
    );
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private assertPayable(charge: typeof charges.$inferSelect): void {
    if (charge.status !== 'open' && charge.status !== 'overdue') {
      throw problem(
        409,
        ErrorCodes.BILLING_CHARGE_NOT_PAYABLE,
        `Charge is ${charge.status} — only open charges are payable`,
      );
    }
  }

  private async ownedCharge(
    tx: DbTransaction,
    ctx: AuthContext,
    payer: PayerKind,
    chargeId: string,
  ): Promise<typeof charges.$inferSelect> {
    const [charge] = await tx
      .select()
      .from(charges)
      .where(eq(charges.id, chargeId));
    // Foreign/unknown charge = 404, never 403 (no existence leak; RLS already
    // hides other tenants).
    if (!charge) throw problem(404, ErrorCodes.NOT_FOUND, 'Charge not found');
    if (payer === 'buyer') {
      // Persona-neutral order-charge ownership (spec 009): the payer is the
      // order's buyer, student or professor alike.
      const [order] = charge.orderId
        ? await tx.select().from(orders).where(eq(orders.id, charge.orderId))
        : [];
      if (
        charge.origin !== 'order' ||
        !order ||
        order.buyerUserId !== ctx.userId
      ) {
        throw problem(404, ErrorCodes.NOT_FOUND, 'Charge not found');
      }
    } else if (payer === 'student') {
      const student = await this.studentOf(tx, ctx.userId);
      if (!student || charge.studentId !== student.id) {
        throw problem(404, ErrorCodes.NOT_FOUND, 'Charge not found');
      }
    } else {
      const guardian = await this.guardianOf(tx, ctx.userId);
      if (!guardian || charge.guardianId !== guardian.id) {
        throw problem(404, ErrorCodes.NOT_FOUND, 'Charge not found');
      }
    }
    return charge;
  }

  private async studentOf(tx: DbTransaction, userId: string) {
    const [row] = await tx
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.userId, userId), eq(students.status, 'active')));
    return row ?? null;
  }

  private async guardianOf(tx: DbTransaction, userId: string) {
    const [row] = await tx
      .select({ id: guardians.id })
      .from(guardians)
      .where(eq(guardians.userId, userId));
    return row ?? null;
  }

  private async activeMandate(tx: DbTransaction, studentId: string) {
    const [row] = await tx
      .select()
      .from(paymentMandates)
      .where(
        and(
          eq(paymentMandates.studentId, studentId),
          eq(paymentMandates.status, 'active'),
        ),
      );
    return row ?? null;
  }

  /**
   * Opens the settlement attempt for the chosen method. The simulated driver
   * emits DETERMINISTIC provider ids keyed by charge id, so a repeated
   * attempt reuses the pending row (the aluno reopening the Pix sheet gets
   * the same copia-e-cola) and a failed one is revived — the provider unique
   * key stays the idempotency anchor.
   */
  private async openAttempt(
    tx: DbTransaction,
    tenantId: string,
    charge: typeof charges.$inferSelect,
    input: CreatePaymentInput,
    providerMandateId: string | null,
  ): Promise<{ payment: typeof payments.$inferSelect; settleAs?: string }> {
    const intent = {
      tenantId,
      chargeId: charge.id,
      amountCents: charge.amountCents,
      currency: charge.currency,
      dueDate: charge.dueDate,
    };
    if (input.method === 'pix') {
      const pix = await this.provider.createPixCharge(intent);
      const payment = await this.ensurePendingPayment(tx, tenantId, charge, {
        method: 'pix',
        providerPaymentId: pix.providerPaymentId,
        providerData: {
          qrPayload: pix.qrPayload,
          copiaECola: pix.copiaECola,
          expiresAt: pix.expiresAt,
        },
      });
      return { payment };
    }
    if (input.method === 'boleto') {
      const boleto = await this.provider.createBoletoCharge(intent);
      const payment = await this.ensurePendingPayment(tx, tenantId, charge, {
        method: 'boleto',
        providerPaymentId: boleto.providerPaymentId,
        providerData: {
          linhaDigitavel: boleto.linhaDigitavel,
          barcodePayload: boleto.barcodePayload,
          dueDate: boleto.dueDate,
        },
      });
      return { payment };
    }
    const card = await this.provider.createCardCharge({
      ...intent,
      providerMandateId,
    });
    const payment = await this.ensurePendingPayment(tx, tenantId, charge, {
      method: 'card',
      providerPaymentId: card.providerPaymentId,
      providerData: {
        ...card.card,
        holderName: input.card?.holderName ?? null,
        recurring: Boolean(providerMandateId),
      },
    });
    return {
      payment,
      settleAs:
        card.status === 'succeeded' ? card.providerPaymentId : undefined,
    };
  }

  private async ensurePendingPayment(
    tx: DbTransaction,
    tenantId: string,
    charge: typeof charges.$inferSelect,
    attempt: {
      method: 'pix' | 'boleto' | 'card';
      providerPaymentId: string;
      providerData: Record<string, unknown>;
    },
  ): Promise<typeof payments.$inferSelect> {
    const [existing] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.provider, this.provider.name),
          eq(payments.providerPaymentId, attempt.providerPaymentId),
        ),
      );
    if (existing) {
      if (existing.status === 'pending') return existing;
      if (existing.status === 'failed') {
        const [revived] = await tx
          .update(payments)
          .set({
            status: 'pending',
            providerData: attempt.providerData,
            updatedAt: new Date(),
          })
          .where(eq(payments.id, existing.id))
          .returning();
        if (!revived)
          throw problem(
            500,
            ErrorCodes.INTERNAL,
            'Payment revive returned no row',
          );
        return revived;
      }
      // succeeded/refunded on an open charge — inconsistent; refuse cleanly.
      throw problem(
        409,
        ErrorCodes.BILLING_CHARGE_NOT_PAYABLE,
        'A settled payment already exists for this attempt',
      );
    }
    const [inserted] = await tx
      .insert(payments)
      .values({
        tenantId,
        chargeId: charge.id,
        method: attempt.method,
        status: 'pending',
        amountCents: charge.amountCents,
        currency: charge.currency,
        provider: this.provider.name,
        providerPaymentId: attempt.providerPaymentId,
        providerData: attempt.providerData,
      })
      .returning();
    if (!inserted)
      throw problem(500, ErrorCodes.INTERNAL, 'Payment insert returned no row');
    return inserted;
  }

  private async readPair(tenantId: string, paymentId: string) {
    return withTenant(this.appDb.db, tenantId, async (tx) => {
      const [payment] = await tx
        .select()
        .from(payments)
        .where(eq(payments.id, paymentId));
      if (!payment)
        throw problem(500, ErrorCodes.INTERNAL, 'Payment vanished mid-flow');
      const [charge] = await tx
        .select()
        .from(charges)
        .where(eq(charges.id, payment.chargeId));
      if (!charge)
        throw problem(500, ErrorCodes.INTERNAL, 'Charge vanished mid-flow');
      return { payment, charge };
    });
  }

  private async auditMandate(
    tx: DbTransaction,
    ctx: AuthContext & { tenantId: string },
    action: string,
    mandateId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await tx.execute(sql`
      SELECT audit_append(
        ${ctx.tenantId}::uuid,
        ${ctx.userId}::uuid,
        ${ctx.impersonatorUserId}::uuid,
        ${action},
        'payment_mandate',
        ${mandateId}::text,
        ${JSON.stringify(metadata)}::jsonb
      )
    `);
  }
}
