import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import {
  academyPlans,
  charges,
  payments,
  students,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { localDate, TENANT_TIMEZONE } from '../../attendance/lib/time.js';
import { monthKey, monthStart } from '../lib/cycle.js';
import {
  MaterializationService,
  type MaterializationResult,
} from './materialization.service.js';

export interface OverviewView {
  /** Tenant-local YYYY-MM the aggregates are computed for. */
  month: string;
  /** RECEITA DE <MÊS> — succeeded payments by paid_at, tenant timezone. */
  receitaMesCents: number;
  /** "no ano" — succeeded payments in the current tenant-local year. */
  receitaAnoCents: number;
  /** Previsão <próximo mês>: open charges due in the next month, post-pass. */
  previsaoProximoMesCents: number;
  /** Overdue-open amount ÷ current-month materialized plan total, by value. */
  inadimplenciaPct: number;
  /** "Receita mensal" bar chart — last 6 months including the current. */
  series: Array<{ month: string; totalCents: number }>;
  /** "Próximos vencimentos" — upcoming open charges grouped by due date. */
  proximosVencimentos: Array<{
    dueDate: string;
    count: number;
    totalCents: number;
    charges: Array<{
      chargeId: string;
      studentId: string;
      studentName: string;
      amountCents: number;
      planName: string | null;
    }>;
  }>;
  /** Inadimplência target list — who, how much, since when. */
  inadimplentes: Array<{
    studentId: string;
    fullName: string;
    totalCents: number;
    oldestDueDate: string;
    chargeCount: number;
  }>;
  /** What the on-read pass did before aggregating. */
  materialization: MaterializationResult;
}

/**
 * Admin Visão financeira aggregates (spec 006, BIL.10) — derived on read
 * against the seeded truth, no caching, no jobs. The tenant-wide
 * materialization pass runs first so previsão reflects every plan, not just
 * wallets already opened. Money-truth predicates never trust the lazy
 * overdue flip.
 */
@Injectable()
export class AdminOverviewService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly materialization: MaterializationService,
  ) {}

  async overview(ctx: AuthContext & { tenantId: string }): Promise<OverviewView> {
    const materialization = await this.materialization.ensureCurrentCycleCharges({
      tenantId: ctx.tenantId,
      userId: ctx.userId,
      impersonatorUserId: ctx.impersonatorUserId,
    });

    const today = localDate();
    const thisMonthStart = monthStart(today, 0);
    const nextMonthStart = monthStart(today, 1);
    const monthAfterNextStart = monthStart(today, 2);
    const yearStart = `${today.slice(0, 4)}-01-01`;
    const sixMonthsStart = monthStart(today, -5);

    return withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx) => {
        // Receita série — succeeded payments bucketed by tenant-local month.
        const buckets = await tx
          .select({
            month: sql<string>`to_char(${payments.paidAt} AT TIME ZONE ${TENANT_TIMEZONE}, 'YYYY-MM')`,
            totalCents: sql<string>`COALESCE(SUM(${payments.amountCents}), 0)`,
          })
          .from(payments)
          .where(
            and(
              eq(payments.status, 'succeeded'),
              sql`${payments.paidAt} IS NOT NULL`,
              sql`(${payments.paidAt} AT TIME ZONE ${TENANT_TIMEZONE})::date >= LEAST(${sixMonthsStart}::date, ${yearStart}::date)`,
            ),
          )
          .groupBy(sql`1`);
        const byMonth = new Map(buckets.map((b) => [b.month, Number(b.totalCents)]));

        const currentMonth = monthKey(today, 0);
        const receitaMesCents = byMonth.get(currentMonth) ?? 0;
        let receitaAnoCents = 0;
        for (const [month, total] of byMonth) {
          if (month >= yearStart.slice(0, 7) && month <= currentMonth) receitaAnoCents += total;
        }
        const series = Array.from({ length: 6 }, (_, i) => {
          const month = monthKey(today, i - 5);
          return { month, totalCents: byMonth.get(month) ?? 0 };
        });

        // Previsão: open charges due inside the next tenant-local month.
        const [previsao] = await tx
          .select({ total: sql<string>`COALESCE(SUM(${charges.amountCents}), 0)` })
          .from(charges)
          .where(
            and(
              inArray(charges.status, ['open', 'overdue']),
              gte(charges.dueDate, nextMonthStart),
              lt(charges.dueDate, monthAfterNextStart),
            ),
          );

        // Inadimplência % by value: overdue-open (predicate!) ÷ current-month
        // materialized plan total.
        const [overdueRow] = await tx
          .select({ total: sql<string>`COALESCE(SUM(${charges.amountCents}), 0)` })
          .from(charges)
          .where(
            and(
              eq(charges.origin, 'plan'),
              inArray(charges.status, ['open', 'overdue']),
              lt(charges.dueDate, today),
            ),
          );
        const [monthPlanRow] = await tx
          .select({ total: sql<string>`COALESCE(SUM(${charges.amountCents}), 0)` })
          .from(charges)
          .where(and(eq(charges.origin, 'plan'), eq(charges.periodStart, thisMonthStart)));
        const overdueCents = Number(overdueRow?.total ?? 0);
        const monthPlanCents = Number(monthPlanRow?.total ?? 0);
        const inadimplenciaPct =
          monthPlanCents === 0 ? 0 : Math.round((overdueCents / monthPlanCents) * 100);

        return {
          month: currentMonth,
          receitaMesCents,
          receitaAnoCents,
          previsaoProximoMesCents: Number(previsao?.total ?? 0),
          inadimplenciaPct,
          series,
          proximosVencimentos: await this.upcoming(tx, today),
          inadimplentes: await this.delinquents(tx, today),
          materialization,
        };
      },
    );
  }

  /** Upcoming open charges grouped by due date (the 5/10/15 day chips). */
  private async upcoming(tx: DbTransaction, today: string): Promise<OverviewView['proximosVencimentos']> {
    const rows = await tx
      .select({
        chargeId: charges.id,
        studentId: charges.studentId,
        studentName: students.fullName,
        amountCents: charges.amountCents,
        dueDate: charges.dueDate,
        planName: academyPlans.name,
      })
      .from(charges)
      .innerJoin(
        students,
        and(eq(students.tenantId, charges.tenantId), eq(students.id, charges.studentId)),
      )
      .leftJoin(
        academyPlans,
        and(
          eq(academyPlans.tenantId, charges.tenantId),
          eq(academyPlans.id, charges.academyPlanId),
        ),
      )
      .where(and(inArray(charges.status, ['open', 'overdue']), gte(charges.dueDate, today)))
      .orderBy(asc(charges.dueDate), asc(students.fullName));

    const groups: OverviewView['proximosVencimentos'] = [];
    for (const row of rows) {
      let group = groups[groups.length - 1];
      if (!group || group.dueDate !== row.dueDate) {
        group = { dueDate: row.dueDate, count: 0, totalCents: 0, charges: [] };
        groups.push(group);
      }
      group.count += 1;
      group.totalCents += row.amountCents;
      group.charges.push({
        chargeId: row.chargeId,
        studentId: row.studentId,
        studentName: row.studentName,
        amountCents: row.amountCents,
        planName: row.planName,
      });
    }
    return groups;
  }

  /** Students with past-due open plan charges (derived, never a column). */
  private async delinquents(tx: DbTransaction, today: string): Promise<OverviewView['inadimplentes']> {
    const rows = await tx
      .select({
        studentId: charges.studentId,
        fullName: students.fullName,
        totalCents: sql<string>`SUM(${charges.amountCents})`,
        oldestDueDate: sql<string>`MIN(${charges.dueDate})`,
        chargeCount: sql<string>`COUNT(*)`,
      })
      .from(charges)
      .innerJoin(
        students,
        and(eq(students.tenantId, charges.tenantId), eq(students.id, charges.studentId)),
      )
      .where(
        and(
          eq(charges.origin, 'plan'),
          inArray(charges.status, ['open', 'overdue']),
          lt(charges.dueDate, today),
        ),
      )
      .groupBy(charges.studentId, students.fullName)
      .orderBy(sql`MIN(${charges.dueDate})`);
    return rows.map((row) => ({
      studentId: row.studentId,
      fullName: row.fullName,
      totalCents: Number(row.totalCents),
      oldestDueDate: row.oldestDueDate,
      chargeCount: Number(row.chargeCount),
    }));
  }
}
