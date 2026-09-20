import { Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import {
  academies,
  academySubscriptions,
  platformPlans,
  students,
  withPlatform,
  type DbHandle,
} from '@tatame/db';
import { PLATFORM_DB } from '../../../infra/db/db.module.js';

/** A trial inside this window is already worth a phone call (plataforma-02). */
export const TRIAL_ATTENTION_DAYS = 14;

/** Bars on the plataforma-02 chart, current month last. */
const SERIES_MONTHS = 6;

export type AttentionKind = 'trial_ending' | 'subscription_overdue';

export interface AttentionRow {
  academyId: string;
  academyName: string;
  kind: AttentionKind;
  /** PT-BR reason line, e.g. "Trial termina em 9 dias". */
  reason: string;
}

export interface MrrPoint {
  /** YYYY-MM. */
  month: string;
  cents: number;
}

export interface PlatformOverview {
  /** Live subscription revenue this month (active + past_due). */
  mrrCents: number;
  /** Change against the previous month, whole percent; null with no base. */
  mrrDeltaPct: number | null;
  academyCount: number;
  studentCount: number;
  /** Delinquent share of non-suspended academies, one decimal. */
  delinquencyPct: number;
  series: MrrPoint[];
  attention: AttentionRow[];
}

/** Live subscription statuses — a trial is not revenue. */
const BILLABLE = ['active', 'past_due'] as const;

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthStart(offsetFromCurrent: number): Date {
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offsetFromCurrent, 1),
  );
}

function daysUntil(date: Date): number {
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

function pluralDays(days: number): string {
  const value = Math.max(days, 0);
  return value === 1 ? '1 dia' : `${value} dias`;
}

/**
 * Plataforma Visão geral read model (spec 012, PLT.3 — plataforma-02). Pure
 * query on the platform (BYPASSRLS) pool; every number comes from rows that
 * already exist, so there is no aggregate table to keep in sync and nothing
 * to backfill.
 *
 * The 6-month series is reconstructed from subscription lifetimes against
 * today's plan prices: a subscription counts in month M when it was created
 * on or before the end of M and was not canceled before M began. That
 * describes a historical month with the current price — a real limitation
 * recorded in the spec, and the reason no snapshot table exists yet.
 */
@Injectable()
export class PlatformOverviewService {
  constructor(@Inject(PLATFORM_DB) private readonly platformDb: DbHandle) {}

  async overview(): Promise<PlatformOverview> {
    return withPlatform(this.platformDb.db, async (tx) => {
      const subscriptions = await tx
        .select({
          academyId: academySubscriptions.academyId,
          academyName: academies.name,
          academyStatus: academies.status,
          status: academySubscriptions.status,
          createdAt: academySubscriptions.createdAt,
          canceledAt: academySubscriptions.canceledAt,
          currentPeriodEnd: academySubscriptions.currentPeriodEnd,
          priceCents: platformPlans.priceCents,
        })
        .from(academySubscriptions)
        .innerJoin(academies, eq(academies.id, academySubscriptions.academyId))
        .innerJoin(
          platformPlans,
          eq(platformPlans.id, academySubscriptions.platformPlanId),
        );

      const [academyCounts] = await tx
        .select({
          total: sql<number>`count(*) FILTER (WHERE ${academies.status} <> 'suspended')::int`,
          delinquent: sql<number>`count(*) FILTER (WHERE ${academies.status} = 'delinquent')::int`,
        })
        .from(academies);

      const [studentCounts] = await tx
        .select({ total: sql<number>`count(*)::int` })
        .from(students)
        .innerJoin(academies, eq(academies.id, students.tenantId))
        .where(
          and(
            eq(students.status, 'active'),
            inArray(academies.status, ['trial', 'active', 'delinquent']),
          ),
        );

      // Series: month buckets from oldest to current.
      const series: MrrPoint[] = [];
      for (let offset = SERIES_MONTHS - 1; offset >= 0; offset -= 1) {
        const start = monthStart(-offset);
        const end = monthStart(-offset + 1);
        let cents = 0;
        for (const row of subscriptions) {
          if (!row.priceCents) continue;
          // A canceled subscription still earned the months it was live.
          if (row.status === 'canceled' && !row.canceledAt) continue;
          if (
            row.status !== 'canceled' &&
            !BILLABLE.includes(row.status as 'active' | 'past_due')
          ) {
            continue;
          }
          if (row.createdAt.getTime() >= end.getTime()) continue;
          if (row.canceledAt && row.canceledAt.getTime() < start.getTime())
            continue;
          cents += row.priceCents;
        }
        series.push({ month: monthKey(start), cents });
      }

      const current = series[series.length - 1]?.cents ?? 0;
      const previous = series[series.length - 2]?.cents ?? 0;
      const mrrDeltaPct =
        previous === 0
          ? null
          : Math.round(((current - previous) / previous) * 100);

      const attention: AttentionRow[] = [];
      for (const row of subscriptions) {
        if (row.academyStatus === 'suspended') continue;
        if (row.status === 'trialing' && row.currentPeriodEnd) {
          const days = daysUntil(row.currentPeriodEnd);
          if (days <= TRIAL_ATTENTION_DAYS) {
            attention.push({
              academyId: row.academyId,
              academyName: row.academyName,
              kind: 'trial_ending',
              reason:
                days <= 0
                  ? 'Trial encerrado'
                  : `Trial termina em ${pluralDays(days)}`,
            });
          }
          continue;
        }
        if (row.status === 'past_due') {
          const overdueDays = row.currentPeriodEnd
            ? -daysUntil(row.currentPeriodEnd)
            : 0;
          attention.push({
            academyId: row.academyId,
            academyName: row.academyName,
            kind: 'subscription_overdue',
            reason:
              overdueDays > 0
                ? `Assinatura vencida há ${pluralDays(overdueDays)}`
                : 'Assinatura vencida',
          });
        }
      }
      attention.sort((a, b) =>
        a.academyName.localeCompare(b.academyName, 'pt-BR'),
      );

      const total = academyCounts?.total ?? 0;
      const delinquent = academyCounts?.delinquent ?? 0;

      return {
        mrrCents: current,
        mrrDeltaPct,
        academyCount: total,
        studentCount: studentCounts?.total ?? 0,
        delinquencyPct:
          total === 0 ? 0 : Math.round((delinquent / total) * 1000) / 10,
        series,
        attention,
      };
    });
  }
}

/** Kept next to the read model that defines it — reused by the academies list. */
export const isBillableSubscription = (status: string): boolean =>
  BILLABLE.includes(status as 'active' | 'past_due');
