import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import {
  attendances,
  classSessions,
  eventRegistrations,
  events,
  students,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { TENANT_TIMEZONE } from '../../attendance/lib/time.js';
import {
  monthWindow,
  requireMonth,
  semesterWindow,
  type DateWindow,
} from '../lib/windows.js';

export type RankingBy = 'lessons' | 'events';

export interface RankingRow {
  position: number;
  name: string;
  count: number;
  /** "você" highlight — true on the requesting student's own row. */
  isMe: boolean;
}

export interface RankingView {
  by: RankingBy;
  window: DateWindow;
  top: RankingRow[];
  /**
   * The requesting student's own position/count (aluno home card + the
   * below-the-cut row). Always null for professors — they are not ranked.
   */
  me: { position: number; count: number } | null;
  /** Active students ranked (zero counts included — story 16). */
  totalRanked: number;
}

const TOP_CUT = 10;

/**
 * Academy-wide rankings (spec 013, REP.5) — `lessons` counts active
 * (non-revoked) attendances in the calendar month; `events` counts confirmed
 * registrations to non-canceled events whose start falls in the current
 * semester. All ACTIVE students are ranked (a zero count never hides anyone),
 * sorted count-desc then name-asc (deterministic ties), positions assigned
 * after the sort. Visible to students and professors regardless of the
 * `gamification.streak` toggle (spec 004 scoped that switch to the streak
 * tile only — decision recorded in spec 013).
 */
@Injectable()
export class RankingsService {
  constructor(@Inject(APP_DB) private readonly appDb: DbHandle) {}

  async ranking(
    ctx: AuthContext & { tenantId: string },
    by: RankingBy,
    month?: string,
  ): Promise<RankingView> {
    const base = requireMonth(month);
    const window = by === 'lessons' ? monthWindow(base) : semesterWindow(base);

    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const active = await tx
        .select({
          id: students.id,
          name: students.fullName,
          userId: students.userId,
        })
        .from(students)
        .where(eq(students.status, 'active'));

      const counts =
        by === 'lessons'
          ? await this.lessonCounts(tx, window)
          : await this.eventCounts(tx, window);

      const ranked = active
        .map((s) => ({
          studentId: s.id,
          name: s.name,
          userId: s.userId,
          count: counts.get(s.id) ?? 0,
        }))
        .sort(
          (a, b) =>
            b.count - a.count ||
            (a.name < b.name ? -1 : a.name > b.name ? 1 : 0),
        )
        .map((row, index) => ({ ...row, position: index + 1 }));

      const mine =
        ctx.role === 'student'
          ? ranked.find((r) => r.userId === ctx.userId)
          : undefined;

      return {
        by,
        window,
        top: ranked.slice(0, TOP_CUT).map((r) => ({
          position: r.position,
          name: r.name,
          count: r.count,
          isMe: r.studentId === mine?.studentId,
        })),
        me: mine ? { position: mine.position, count: mine.count } : null,
        totalRanked: ranked.length,
      };
    });
  }

  /** Active attendances on the month's materialized sessions, per student. */
  private async lessonCounts(
    tx: DbTransaction,
    window: DateWindow,
  ): Promise<Map<string, number>> {
    const rows = await tx
      .select({
        studentId: attendances.studentId,
        total: sql<string>`COUNT(*)`,
      })
      .from(attendances)
      .innerJoin(
        classSessions,
        and(
          eq(classSessions.tenantId, attendances.tenantId),
          eq(classSessions.id, attendances.classSessionId),
        ),
      )
      .where(
        and(
          isNull(attendances.revokedAt),
          gte(classSessions.sessionDate, window.start),
          lt(classSessions.sessionDate, window.endExclusive),
        ),
      )
      .groupBy(attendances.studentId);
    return new Map(rows.map((r) => [r.studentId, Number(r.total)]));
  }

  /** Confirmed registrations to non-canceled semester events, per student. */
  private async eventCounts(
    tx: DbTransaction,
    window: DateWindow,
  ): Promise<Map<string, number>> {
    const rows = await tx
      .select({
        studentId: eventRegistrations.studentId,
        total: sql<string>`COUNT(*)`,
      })
      .from(eventRegistrations)
      .innerJoin(
        events,
        and(
          eq(events.tenantId, eventRegistrations.tenantId),
          eq(events.id, eventRegistrations.eventId),
        ),
      )
      .where(
        and(
          eq(eventRegistrations.status, 'confirmed'),
          sql`${events.status} <> 'canceled'`,
          sql`(${events.startsAt} AT TIME ZONE ${TENANT_TIMEZONE})::date >= ${window.start}::date`,
          sql`(${events.startsAt} AT TIME ZONE ${TENANT_TIMEZONE})::date < ${window.endExclusive}::date`,
        ),
      )
      .groupBy(eventRegistrations.studentId);
    return new Map(rows.map((r) => [r.studentId, Number(r.total)]));
  }
}

const tenantCtx = (ctx: AuthContext) => ({
  tenantId: ctx.tenantId,
  userId: ctx.userId,
});
