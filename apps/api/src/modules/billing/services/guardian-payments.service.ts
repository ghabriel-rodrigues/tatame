import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  academyPlans,
  guardians,
  paymentMandates,
  students,
  withTenant,
  type DbHandle,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { localDate } from '../../attendance/lib/time.js';
import { MaterializationService } from './materialization.service.js';
import type { ChargeView, PaymentView } from './payment-flow.service.js';
import {
  currentChargeOf,
  settledHistory,
  type HistoryEntryView,
  type PlanHeaderView,
} from './wallet.service.js';

export interface DependentPaymentsView {
  studentId: string;
  fullName: string;
  plan: PlanHeaderView | null;
  currentCharge: (ChargeView & { payments: PaymentView[] }) | null;
  /** "Pago via recorrência no cartão" — active mandate on this dependent. */
  recurrenceActive: boolean;
}

export interface GuardianPaymentsView {
  dependents: DependentPaymentsView[];
  /** Consolidated histórico across all dependents (child, month, method…). */
  history: Array<HistoryEntryView & { studentName: string }>;
}

/**
 * Responsável Pagamentos read model (spec 006, BIL.9): one card per
 * dependent, guardian bill-to addressing, consolidated histórico. A
 * money-displaying entry point — materializes the caller's dependents before
 * reading. A caller without a guardian record simply has no dependents.
 */
@Injectable()
export class GuardianPaymentsService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly materialization: MaterializationService,
  ) {}

  async getPayments(ctx: AuthContext & { tenantId: string }): Promise<GuardianPaymentsView> {
    const today = localDate();
    const dependents = await withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx) => {
        const [guardian] = await tx
          .select({ id: guardians.id })
          .from(guardians)
          .where(eq(guardians.userId, ctx.userId));
        if (!guardian) return [];
        return tx
          .select({
            id: students.id,
            fullName: students.fullName,
            academyPlanId: students.academyPlanId,
          })
          .from(students)
          .where(and(eq(students.guardianId, guardian.id), eq(students.status, 'active')))
          .orderBy(asc(students.fullName));
      },
    );
    if (dependents.length === 0) return { dependents: [], history: [] };

    await this.materialization.ensureCurrentCycleCharges(
      { tenantId: ctx.tenantId, userId: ctx.userId, impersonatorUserId: ctx.impersonatorUserId },
      { studentIds: dependents.map((d) => d.id) },
    );

    return withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx) => {
        const ids = dependents.map((d) => d.id);
        const planIds = [
          ...new Set(dependents.map((d) => d.academyPlanId).filter((v): v is string => v != null)),
        ];
        const plans = planIds.length
          ? await tx.select().from(academyPlans).where(inArray(academyPlans.id, planIds))
          : [];
        const planById = new Map(plans.map((p) => [p.id, p]));

        const mandates = await tx
          .select({ studentId: paymentMandates.studentId })
          .from(paymentMandates)
          .where(
            and(
              inArray(paymentMandates.studentId, ids),
              eq(paymentMandates.status, 'active'),
            ),
          );
        const mandateSet = new Set(mandates.map((m) => m.studentId));

        const cards: DependentPaymentsView[] = [];
        for (const dependent of dependents) {
          const plan = dependent.academyPlanId
            ? (planById.get(dependent.academyPlanId) ?? null)
            : null;
          cards.push({
            studentId: dependent.id,
            fullName: dependent.fullName,
            plan: plan
              ? {
                  id: plan.id,
                  name: plan.name,
                  amountCents: plan.amountCents,
                  currency: plan.currency,
                  recurrence: plan.recurrence,
                  dueDay: plan.dueDay,
                  isActive: plan.isActive,
                }
              : null,
            currentCharge: await currentChargeOf(tx, dependent.id, plan, today),
            recurrenceActive: mandateSet.has(dependent.id),
          });
        }

        const nameById = new Map(dependents.map((d) => [d.id, d.fullName]));
        const history = (await settledHistory(tx, ids)).map((entry) => ({
          ...entry,
          studentName: nameById.get(entry.studentId) ?? '',
        }));
        return { dependents: cards, history };
      },
    );
  }
}
