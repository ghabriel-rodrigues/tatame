import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, eq, inArray, isNotNull, lt, sql } from 'drizzle-orm';
import {
  academyPlans,
  charges,
  paymentMandates,
  students,
  withTenant,
  type DbHandle,
} from '@tatame/db';
import { APP_DB } from '../../../infra/db/db.module.js';
import { localDate } from '../../attendance/lib/time.js';
import {
  BILLING_CHARGE_CREATED,
  BILLING_CHARGE_OVERDUE,
  type ChargeCreatedEvent,
  type ChargeOverdueEvent,
} from '../billing.events.js';
import { currentCycle } from '../lib/cycle.js';
import { PaymentFlowService } from './payment-flow.service.js';
import type { BillingActor } from './provider-events.service.js';

/** Tenant-wide pass cap (admin overview is capped/paginated by decision). */
const MATERIALIZATION_CAP = 500;

export interface MaterializationScope {
  /** Restrict to these students (wallet fetch = own charges); absent = tenant-wide. */
  studentIds?: string[];
}

export interface MaterializationResult {
  created: number;
  flippedOverdue: number;
  autoSettled: number;
}

/**
 * Idempotent on-read charge materialization (spec 006, BIL.7 — no cron in
 * v1). Runs at every money-displaying entry point (aluno/responsável wallet,
 * admin overview) and on the audited admin trigger:
 *
 * 1. inserts the current cycle's plan charges (active students with an
 *    assigned ACTIVE plan) with `INSERT … ON CONFLICT DO NOTHING` against the
 *    partial-unique competência key — two concurrent wallet opens never
 *    double-bill;
 * 2. lazily flips `open → overdue` where past due (the column serves
 *    dashboards; money-truth queries always use the predicate);
 * 3. auto-settles due charges of students holding an active card mandate
 *    through the provider driver ("recorrência ativa" means the aluno never
 *    thinks about it) — via the same normalized-event handler as everything.
 *
 * Events `billing.charge.created`/`billing.charge.overdue` are emitted
 * post-commit ONLY for rows actually inserted/flipped.
 */
@Injectable()
export class MaterializationService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly events: EventEmitter2,
    private readonly paymentFlow: PaymentFlowService,
  ) {}

  async ensureCurrentCycleCharges(
    actor: BillingActor & { tenantId: string },
    scope: MaterializationScope = {},
  ): Promise<MaterializationResult> {
    const today = localDate();

    const { created, flipped } = await withTenant(
      this.appDb.db,
      { tenantId: actor.tenantId, userId: actor.userId },
      async (tx) => {
        // Active students with an assigned, non-archived plan.
        const assignments = await tx
          .select({
            studentId: students.id,
            guardianId: students.guardianId,
            planId: academyPlans.id,
            amountCents: academyPlans.amountCents,
            currency: academyPlans.currency,
            recurrence: academyPlans.recurrence,
            dueDay: academyPlans.dueDay,
          })
          .from(students)
          .innerJoin(
            academyPlans,
            and(
              eq(academyPlans.tenantId, students.tenantId),
              eq(academyPlans.id, students.academyPlanId),
              eq(academyPlans.isActive, true),
            ),
          )
          .where(
            and(
              eq(students.status, 'active'),
              isNotNull(students.academyPlanId),
              scope.studentIds ? inArray(students.id, scope.studentIds) : undefined,
            ),
          )
          .limit(MATERIALIZATION_CAP);

        let created: Array<typeof charges.$inferSelect> = [];
        if (assignments.length > 0) {
          created = await tx
            .insert(charges)
            .values(
              assignments.map((a) => {
                const cycle = currentCycle(a.recurrence, a.dueDay, today);
                return {
                  tenantId: actor.tenantId,
                  studentId: a.studentId,
                  // Bill-to denormalized at issuance: the responsável is the
                  // payer of record for guardian-linked students.
                  guardianId: a.guardianId,
                  origin: 'plan' as const,
                  academyPlanId: a.planId,
                  periodStart: cycle.periodStart,
                  periodEnd: cycle.periodEnd,
                  amountCents: a.amountCents,
                  currency: a.currency,
                  dueDate: cycle.dueDate,
                  status: 'open' as const,
                };
              }),
            )
            // The partial-unique competência key settles the race: the loser
            // inserts nothing and RETURNING reports only actual inserts.
            .onConflictDoNothing()
            .returning();

          for (const row of created) {
            await tx.execute(sql`
              SELECT audit_append(
                ${actor.tenantId}::uuid,
                ${actor.userId}::uuid,
                ${actor.impersonatorUserId}::uuid,
                'billing.charge.created',
                'charge',
                ${row.id}::text,
                ${JSON.stringify({
                  origin: 'plan',
                  academy_plan_id: row.academyPlanId,
                  period_start: row.periodStart,
                  amount_cents: row.amountCents,
                })}::jsonb
              )
            `);
          }
        }

        // Lazy open → overdue flip (dashboard column; predicate stays truth).
        const flipped = await tx
          .update(charges)
          .set({ status: 'overdue', updatedAt: new Date() })
          .where(
            and(
              eq(charges.status, 'open'),
              lt(charges.dueDate, today),
              scope.studentIds ? inArray(charges.studentId, scope.studentIds) : undefined,
            ),
          )
          .returning();

        return { created, flipped };
      },
    );

    // Post-commit events — only for rows actually inserted/flipped.
    for (const row of created) {
      const event: ChargeCreatedEvent = {
        tenantId: actor.tenantId,
        chargeId: row.id,
        origin: 'plan',
        studentId: row.studentId,
        guardianId: row.guardianId,
        audience: row.guardianId ? 'guardian' : 'student',
        amountCents: row.amountCents,
        currency: row.currency,
        dueDate: row.dueDate,
        periodStart: row.periodStart,
      };
      this.events.emit(BILLING_CHARGE_CREATED, event);
    }
    for (const row of flipped) {
      const event: ChargeOverdueEvent = {
        tenantId: actor.tenantId,
        chargeId: row.id,
        origin: 'plan',
        studentId: row.studentId,
        guardianId: row.guardianId,
        audience: row.guardianId ? 'guardian' : 'student',
        amountCents: row.amountCents,
        currency: row.currency,
        dueDate: row.dueDate,
        periodStart: row.periodStart,
        // Dunning deep link into the Carteira Pix sheet (aluno-13).
        pixDeepLink: `tatame://carteira/charges/${row.id}/pix`,
      };
      this.events.emit(BILLING_CHARGE_OVERDUE, event);
    }

    const autoSettled = await this.autoSettleWithMandates(actor, scope, today);
    return { created: created.length, flippedOverdue: flipped.length, autoSettled };
  }

  /**
   * Due (or past-due) open plan charges of students with an ACTIVE card
   * mandate settle automatically — the driver charges the mandate and the
   * normalized handler flips the charge, exactly like a manual card payment.
   */
  private async autoSettleWithMandates(
    actor: BillingActor & { tenantId: string },
    scope: MaterializationScope,
    today: string,
  ): Promise<number> {
    const due = await withTenant(
      this.appDb.db,
      { tenantId: actor.tenantId, userId: actor.userId },
      (tx) =>
        tx
          .select({
            charge: charges,
            providerMandateId: paymentMandates.providerMandateId,
            payerUserId: paymentMandates.payerUserId,
          })
          .from(charges)
          .innerJoin(
            paymentMandates,
            and(
              eq(paymentMandates.tenantId, charges.tenantId),
              eq(paymentMandates.studentId, charges.studentId),
              eq(paymentMandates.status, 'active'),
            ),
          )
          .where(
            and(
              eq(charges.origin, 'plan'),
              inArray(charges.status, ['open', 'overdue']),
              sql`${charges.dueDate} <= ${today}`,
              scope.studentIds ? inArray(charges.studentId, scope.studentIds) : undefined,
            ),
          )
          .limit(MATERIALIZATION_CAP),
    );

    for (const row of due) {
      await this.paymentFlow.settleCardCharge(
        actor,
        actor.tenantId,
        row.charge,
        row.providerMandateId,
      );
    }
    return due.length;
  }
}
