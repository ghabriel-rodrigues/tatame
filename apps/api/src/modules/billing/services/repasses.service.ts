import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import {
  academies,
  academySubscriptions,
  charges,
  payments,
  platformPlans,
  withPlatform,
  type DbHandle,
} from '@tatame/db';
import { PLATFORM_DB } from '../../../infra/db/db.module.js';
import { localDate, TENANT_TIMEZONE } from '../../attendance/lib/time.js';

export type RepasseStatus = 'repassado' | 'em_transito' | 'retido';

export interface RepasseRow {
  academyId: string;
  academyName: string;
  /** YYYY-MM period the settled payments belong to (tenant timezone). */
  period: string;
  /** Distinct students with settled payments in the period. */
  studentCount: number;
  grossCents: number;
  /** Platform take in basis points (NULL fee_bps = 0 until priced). */
  feeBps: number;
  feeCents: number;
  netCents: number;
  /** Charter retention rule: delinquent academy ⇒ always withheld. */
  withheld: boolean;
  status: RepasseStatus;
}

export interface RepassesView {
  totals: {
    /** "assinaturas · mês" — live SaaS subscriptions (active + past_due). */
    subscriptionsMonthCents: number;
    /** "taxa de pagamento" — platform fees over the current period. */
    paymentFeesMonthCents: number;
  };
  repasses: RepasseRow[];
}

/**
 * Faturamento e repasses read model (spec 006, BIL.11 — plataforma-09). Pure
 * query, no ledger writes, no money movement: gross = settled payments per
 * academy per period; fee = gross × the academy's SaaS plan `fee_bps`; net =
 * gross − fee; `withheld` on delinquent academies (charter retention rule —
 * at the Stripe stage this becomes payout pausing and the same view
 * reconciles Connect transfers). Platform scope: runs on the BYPASSRLS pool,
 * gated to owner/finance by the roles guard.
 *
 * Every non-suspended academy gets a current-period row even at zero gross,
 * so retention is visible truth before the first payment lands.
 */
@Injectable()
export class RepassesService {
  constructor(@Inject(PLATFORM_DB) private readonly platformDb: DbHandle) {}

  async repasses(): Promise<RepassesView> {
    const currentPeriod = localDate().slice(0, 7);
    return withPlatform(this.platformDb.db, async (tx) => {
      const academyRows = await tx
        .select({
          id: academies.id,
          name: academies.name,
          status: academies.status,
          feeBps: platformPlans.feeBps,
          subscriptionStatus: academySubscriptions.status,
          priceCents: platformPlans.priceCents,
        })
        .from(academies)
        .leftJoin(
          academySubscriptions,
          and(
            eq(academySubscriptions.academyId, academies.id),
            inArray(academySubscriptions.status, ['trialing', 'active', 'past_due']),
          ),
        )
        .leftJoin(platformPlans, eq(platformPlans.id, academySubscriptions.platformPlanId))
        .where(inArray(academies.status, ['trial', 'active', 'delinquent']));

      const grossRows = await tx
        .select({
          tenantId: payments.tenantId,
          period: sql<string>`to_char(${payments.paidAt} AT TIME ZONE ${TENANT_TIMEZONE}, 'YYYY-MM')`,
          grossCents: sql<string>`COALESCE(SUM(${payments.amountCents}), 0)`,
          studentCount: sql<string>`COUNT(DISTINCT ${charges.studentId})`,
        })
        .from(payments)
        .innerJoin(
          charges,
          and(eq(charges.tenantId, payments.tenantId), eq(charges.id, payments.chargeId)),
        )
        .where(and(eq(payments.status, 'succeeded'), isNotNull(payments.paidAt)))
        // Positional grouping: the period expression is parameterized (the
        // timezone rides as a bind param), so repeating it in GROUP BY would
        // not be recognized as the same expression by the planner.
        .groupBy(sql`1, 2`);

      const grossByAcademy = new Map<string, Array<(typeof grossRows)[number]>>();
      for (const row of grossRows) {
        const list = grossByAcademy.get(row.tenantId) ?? [];
        list.push(row);
        grossByAcademy.set(row.tenantId, list);
      }

      const repasses: RepasseRow[] = [];
      let subscriptionsMonthCents = 0;
      let paymentFeesMonthCents = 0;

      for (const academy of academyRows) {
        if (academy.subscriptionStatus === 'active' || academy.subscriptionStatus === 'past_due') {
          subscriptionsMonthCents += academy.priceCents ?? 0;
        }
        const feeBps = academy.feeBps ?? 0;
        const withheld = academy.status === 'delinquent';
        const periods = grossByAcademy.get(academy.id) ?? [];
        // Every academy shows its current period even before any settlement.
        if (!periods.some((p) => p.period === currentPeriod)) {
          periods.push({
            tenantId: academy.id,
            period: currentPeriod,
            grossCents: '0',
            studentCount: '0',
          });
        }
        periods.sort((a, b) => b.period.localeCompare(a.period));

        for (const period of periods) {
          const grossCents = Number(period.grossCents);
          const feeCents = Math.round((grossCents * feeBps) / 10_000);
          const isCurrent = period.period === currentPeriod;
          const status: RepasseStatus = withheld
            ? 'retido'
            : isCurrent
              ? 'em_transito'
              : 'repassado';
          if (isCurrent) paymentFeesMonthCents += feeCents;
          repasses.push({
            academyId: academy.id,
            academyName: academy.name,
            period: period.period,
            studentCount: Number(period.studentCount),
            grossCents,
            feeBps,
            feeCents,
            netCents: grossCents - feeCents,
            withheld,
            status,
          });
        }
      }

      repasses.sort(
        (a, b) => b.period.localeCompare(a.period) || a.academyName.localeCompare(b.academyName),
      );
      return { totals: { subscriptionsMonthCents, paymentFeesMonthCents }, repasses };
    });
  }
}
