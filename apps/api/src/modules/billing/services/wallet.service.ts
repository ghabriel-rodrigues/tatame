import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import {
  academyPlans,
  charges,
  paymentMandates,
  payments,
  students,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { localDate } from '../../attendance/lib/time.js';
import { currentCycle, nextCycleDueDate } from '../lib/cycle.js';
import { MaterializationService } from './materialization.service.js';
import {
  toChargeView,
  toPaymentView,
  type ChargeView,
  type PaymentView,
} from './payment-flow.service.js';

export interface PlanHeaderView {
  id: string;
  name: string;
  amountCents: number;
  currency: string;
  recurrence: 'monthly' | 'quarterly' | 'semiannual' | 'yearly';
  dueDay: number;
  isActive: boolean;
}

export interface HistoryEntryView {
  studentId: string;
  chargeId: string;
  periodStart: string | null;
  amountCents: number;
  currency: string;
  chargeStatus: 'paid' | 'refunded';
  paymentId: string;
  method: 'pix' | 'boleto' | 'card';
  paidAt: string | null;
  receiptUrl: string | null;
}

export interface WalletView {
  student: { id: string; fullName: string };
  /** Null = no assigned plan → clean empty state (never invented money). */
  plan: PlanHeaderView | null;
  /** The mensalidade card: earliest open charge, else the current cycle's. */
  currentCharge: (ChargeView & { payments: PaymentView[] }) | null;
  /** "Cobrança recorrente ativa" banner data. */
  recurrence: { active: boolean; nextChargeDueDate: string | null };
  history: HistoryEntryView[];
}

const planHeader = (row: typeof academyPlans.$inferSelect): PlanHeaderView => ({
  id: row.id,
  name: row.name,
  amountCents: row.amountCents,
  currency: row.currency,
  recurrence: row.recurrence,
  dueDay: row.dueDay,
  isActive: row.isActive,
});

/**
 * Aluno Carteira read model (spec 006, BIL.8). The fetch is a
 * money-displaying entry point: it materializes the caller's own current
 * cycle first (idempotent), then reads — so the mensalidade card is always
 * real data.
 */
@Injectable()
export class WalletService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly materialization: MaterializationService,
  ) {}

  async getWallet(ctx: AuthContext & { tenantId: string }): Promise<WalletView> {
    const today = localDate();
    const student = await withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx) => {
        const [row] = await tx
          .select({
            id: students.id,
            fullName: students.fullName,
            academyPlanId: students.academyPlanId,
          })
          .from(students)
          .where(and(eq(students.userId, ctx.userId), eq(students.status, 'active')));
        return row ?? null;
      },
    );
    if (!student) {
      throw problem(404, ErrorCodes.NOT_FOUND, 'No active student record for this account');
    }

    // On-read materialization scoped to the caller (own charges only).
    await this.materialization.ensureCurrentCycleCharges(
      { tenantId: ctx.tenantId, userId: ctx.userId, impersonatorUserId: ctx.impersonatorUserId },
      { studentIds: [student.id] },
    );

    return withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx) => {
        const plan = student.academyPlanId
          ? ((await tx
              .select()
              .from(academyPlans)
              .where(eq(academyPlans.id, student.academyPlanId)))[0] ?? null)
          : null;

        const currentCharge = await currentChargeOf(tx, student.id, plan, today);
        const history = await settledHistory(tx, [student.id]);

        const [mandate] = await tx
          .select({ id: paymentMandates.id })
          .from(paymentMandates)
          .where(
            and(
              eq(paymentMandates.studentId, student.id),
              eq(paymentMandates.status, 'active'),
            ),
          );

        return {
          student: { id: student.id, fullName: student.fullName },
          plan: plan ? planHeader(plan) : null,
          currentCharge,
          recurrence: {
            active: Boolean(mandate),
            nextChargeDueDate:
              mandate && plan ? nextCycleDueDate(plan.recurrence, plan.dueDay, today) : null,
          },
          history,
        };
      },
    );
  }
}

/**
 * The mensalidade card charge: the earliest-due open/overdue plan charge, or
 * — when nothing is open — the current competência's charge (shows "Paga").
 */
export async function currentChargeOf(
  tx: DbTransaction,
  studentId: string,
  plan: typeof academyPlans.$inferSelect | null,
  todayIso: string,
): Promise<(ChargeView & { payments: PaymentView[] }) | null> {
  const open = await tx
    .select()
    .from(charges)
    .where(
      and(
        eq(charges.studentId, studentId),
        eq(charges.origin, 'plan'),
        inArray(charges.status, ['open', 'overdue']),
      ),
    )
    .orderBy(charges.dueDate);
  let target = open[0] ?? null;

  if (!target && plan) {
    const cycle = currentCycle(plan.recurrence, plan.dueDay, todayIso);
    const [row] = await tx
      .select()
      .from(charges)
      .where(
        and(
          eq(charges.studentId, studentId),
          eq(charges.origin, 'plan'),
          eq(charges.periodStart, cycle.periodStart),
        ),
      );
    target = row ?? null;
  }
  if (!target) return null;

  const attempts = await tx
    .select()
    .from(payments)
    .where(eq(payments.chargeId, target.id))
    .orderBy(desc(payments.createdAt));
  return { ...toChargeView(target, todayIso), payments: attempts.map(toPaymentView) };
}

/** Settled charges (paid/refunded) with their settling payment, newest first. */
export async function settledHistory(
  tx: DbTransaction,
  studentIds: string[],
): Promise<HistoryEntryView[]> {
  if (studentIds.length === 0) return [];
  const rows = await tx
    .select({ charge: charges, payment: payments })
    .from(charges)
    .innerJoin(
      payments,
      and(eq(payments.tenantId, charges.tenantId), eq(payments.chargeId, charges.id)),
    )
    .where(
      and(
        inArray(charges.studentId, studentIds),
        inArray(charges.status, ['paid', 'refunded']),
        inArray(payments.status, ['succeeded', 'refunded']),
      ),
    )
    .orderBy(desc(payments.paidAt));
  return rows.map((row) => ({
    // The `inArray(charges.studentId, studentIds)` filter guarantees it.
    studentId: row.charge.studentId!,
    chargeId: row.charge.id,
    periodStart: row.charge.periodStart,
    amountCents: row.charge.amountCents,
    currency: row.charge.currency,
    chargeStatus: row.charge.status as 'paid' | 'refunded',
    paymentId: row.payment.id,
    method: row.payment.method,
    paidAt: row.payment.paidAt ? row.payment.paidAt.toISOString() : null,
    receiptUrl: row.payment.receiptUrl,
  }));
}
