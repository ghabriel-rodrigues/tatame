import { Inject, Injectable } from '@nestjs/common';
import { and, count, countDistinct, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import {
  attendances,
  classSchedules,
  classSessions,
  classes,
  enrollments,
  students,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { PermissionsService } from '../../identity/services/permissions.service.js';
import { nextSlot, normalizeTime, type ScheduleSlotView } from '../../enrollment/lib/derive.js';
import { localDate, localMonthStart, localWeekday } from '../lib/time.js';
import { SessionService } from './session.service.js';

export interface AlunoStats {
  /** Presença no mês: active attendances ÷ materialized sessions (0-100). */
  monthPresencePct: number;
  monthAttendedSessions: number;
  monthTotalSessions: number;
  /** Aulas seguidas — null when `gamification.streak` is off for the academy. */
  streak: number | null;
  /** Lifetime active-attendance count (graduation progress numerator). */
  totalLessons: number;
}

export interface AlunoHome {
  student: { id: string; fullName: string };
  /** Today's class hero — null when no enrolled class has a slot today. */
  todayClass: {
    classId: string;
    className: string;
    slot: ScheduleSlotView;
    checkedIn: boolean;
  } | null;
  stats: AlunoStats;
}

export interface ProfessorDashboard {
  /** Distinct students with an active check-in today across own classes. */
  alunosHoje: number;
  /** Month attendance rate averaged across own classes (0-100). */
  presencaMediaPct: number;
  nextClass: {
    classId: string;
    className: string;
    slot: ScheduleSlotView;
    /** Today's session check-in count when a session exists, else 0. */
    checkedInCount: number;
  } | null;
  todayClasses: Array<{
    classId: string;
    className: string;
    slot: ScheduleSlotView;
    checkedInCount: number;
    enrolledCount: number;
  }>;
}

const tenantCtx = (ctx: AuthContext) => ({ tenantId: ctx.tenantId, userId: ctx.userId });

/**
 * Derived attendance statistics (spec 004, ATT.11) — computed on read from
 * active attendances against materialized sessions, nothing cached (the
 * honest denominator rule: a day nobody opened never happened).
 */
@Injectable()
export class StatsService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly permissions: PermissionsService,
    private readonly sessions: SessionService,
  ) {}

  /**
   * Aluno stat block. Runs inside an existing tenant transaction so the
   * check-in response carries numbers from the same snapshot as the insert.
   */
  async alunoStats(
    tx: DbTransaction,
    tenantId: string,
    studentId: string,
    now: Date = new Date(),
  ): Promise<AlunoStats> {
    const today = localDate(now);
    const monthStart = localMonthStart(now);

    const enrolled = await tx
      .select({ classId: enrollments.classId })
      .from(enrollments)
      .where(and(eq(enrollments.studentId, studentId), eq(enrollments.status, 'active')));
    const classIds = enrolled.map((r) => r.classId);

    const [totalRow] = await tx
      .select({ total: count() })
      .from(attendances)
      .where(and(eq(attendances.studentId, studentId), isNull(attendances.revokedAt)));
    const totalLessons = Number(totalRow?.total ?? 0);

    if (classIds.length === 0) {
      const streak = await this.streakOf(tx, studentId, classIds, today);
      return {
        monthPresencePct: 0,
        monthAttendedSessions: 0,
        monthTotalSessions: 0,
        streak,
        totalLessons,
      };
    }

    // Denominator: materialized sessions of the enrolled classes this month,
    // up to today. Numerator: the student's active attendances on them.
    const [sessionsRow] = await tx
      .select({ total: count() })
      .from(classSessions)
      .where(
        and(
          inArray(classSessions.classId, classIds),
          gte(classSessions.sessionDate, monthStart),
          lte(classSessions.sessionDate, today),
        ),
      );
    const monthTotalSessions = Number(sessionsRow?.total ?? 0);

    const [attendedRow] = await tx
      .select({ total: count() })
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
          eq(attendances.studentId, studentId),
          isNull(attendances.revokedAt),
          inArray(classSessions.classId, classIds),
          gte(classSessions.sessionDate, monthStart),
          lte(classSessions.sessionDate, today),
        ),
      );
    const monthAttendedSessions = Number(attendedRow?.total ?? 0);

    const streak = await this.streakOf(tx, studentId, classIds, today);
    return {
      monthPresencePct:
        monthTotalSessions === 0
          ? 0
          : Math.round((monthAttendedSessions / monthTotalSessions) * 100),
      monthAttendedSessions,
      monthTotalSessions,
      streak,
      totalLessons,
    };
  }

  /** Omits (nulls) the streak when the academy turned the gamification off. */
  async applyGamificationToggle(tenantId: string, stats: AlunoStats): Promise<AlunoStats> {
    const allowed = await this.permissions.isAllowed(tenantId, 'student', 'gamification.streak');
    return allowed ? stats : { ...stats, streak: null };
  }

  /**
   * Consecutive attended sessions counting back from the most recent
   * materialized session of the enrolled classes; any such session without an
   * active attendance breaks it (spec: revokes retroactively recompute).
   */
  private async streakOf(
    tx: DbTransaction,
    studentId: string,
    classIds: string[],
    today: string,
  ): Promise<number> {
    if (classIds.length === 0) return 0;
    const rows = await tx
      .select({
        sessionId: classSessions.id,
        // `.as()` is required for raw fragments, and the correlated columns
        // must be written fully qualified: drizzle renders interpolated
        // columns of the outer table UNQUALIFIED inside select-list SQL, and
        // an unqualified "id" would resolve to the subquery's own relation.
        attended: sql<boolean>`EXISTS (
          SELECT 1 FROM ${attendances} a
          WHERE a.tenant_id = "class_sessions"."tenant_id"
            AND a.class_session_id = "class_sessions"."id"
            AND a.student_id = ${studentId}
            AND a.revoked_at IS NULL
        )`.as('attended'),
      })
      .from(classSessions)
      .where(and(inArray(classSessions.classId, classIds), lte(classSessions.sessionDate, today)))
      // NULLS LAST: a slot-less occurrence sorts after timed ones on the day.
      .orderBy(desc(classSessions.sessionDate), sql`${classSessions.startsAt} DESC NULLS LAST`)
      .limit(365);
    let streak = 0;
    for (const row of rows) {
      if (!row.attended) break;
      streak += 1;
    }
    return streak;
  }

  /** GET /aluno/home — hero context + stat tiles (story 13-17). */
  async alunoHome(ctx: AuthContext & { tenantId: string }): Promise<AlunoHome> {
    const now = new Date();
    const home = await withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const [student] = await tx
        .select({ id: students.id, fullName: students.fullName })
        .from(students)
        .where(and(eq(students.userId, ctx.userId), eq(students.status, 'active')));
      if (!student) {
        throw problem(404, ErrorCodes.NOT_FOUND, 'No active student record for this account');
      }

      const enrolledClasses = await tx
        .select({ id: classes.id, name: classes.name })
        .from(enrollments)
        .innerJoin(
          classes,
          and(eq(classes.tenantId, enrollments.tenantId), eq(classes.id, enrollments.classId)),
        )
        .where(
          and(
            eq(enrollments.studentId, student.id),
            eq(enrollments.status, 'active'),
            eq(classes.status, 'active'),
          ),
        );

      // Today's class hero: the earliest slot today among enrolled classes.
      let todayClass: AlunoHome['todayClass'] = null;
      for (const klass of enrolledClasses) {
        const slot = await this.sessions.todaySlot(tx, klass.id, now);
        if (!slot) continue;
        if (todayClass && todayClass.slot.startTime <= slot.startTime) continue;
        const session = await this.sessions.findToday(tx, klass.id, now);
        let checkedIn = false;
        if (session) {
          const [active] = await tx
            .select({ id: attendances.id })
            .from(attendances)
            .where(
              and(
                eq(attendances.classSessionId, session.id),
                eq(attendances.studentId, student.id),
                isNull(attendances.revokedAt),
              ),
            );
          checkedIn = Boolean(active);
        }
        todayClass = {
          classId: klass.id,
          className: klass.name,
          slot: {
            weekday: localWeekday(now),
            startTime: slot.startTime,
            durationMinutes: slot.durationMinutes,
          },
          checkedIn,
        };
      }

      const stats = await this.alunoStats(tx, ctx.tenantId, student.id, now);
      return { student, todayClass, stats };
    });
    home.stats = await this.applyGamificationToggle(ctx.tenantId, home.stats);
    return home;
  }

  /** GET /professor/dashboard — alunos hoje, presença média, next-class hero. */
  async professorDashboard(ctx: AuthContext & { tenantId: string }): Promise<ProfessorDashboard> {
    const now = new Date();
    const today = localDate(now);
    const monthStart = localMonthStart(now);

    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const own = await tx
        .select({ id: classes.id, name: classes.name })
        .from(classes)
        .where(and(eq(classes.professorUserId, ctx.userId), eq(classes.status, 'active')));
      const classIds = own.map((c) => c.id);
      if (classIds.length === 0) {
        return { alunosHoje: 0, presencaMediaPct: 0, nextClass: null, todayClasses: [] };
      }

      // alunos hoje — distinct active check-ins on today's sessions.
      const [alunosRow] = await tx
        .select({ total: countDistinct(attendances.studentId) })
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
            inArray(classSessions.classId, classIds),
            eq(classSessions.sessionDate, today),
          ),
        );
      const alunosHoje = Number(alunosRow?.total ?? 0);

      // presença média — month-to-date, per class: active attendances ÷
      // (materialized sessions × active enrollment count), averaged across
      // classes that held at least one session with at least one student.
      const rates: number[] = [];
      for (const classId of classIds) {
        const [sessionsRow] = await tx
          .select({ total: count() })
          .from(classSessions)
          .where(
            and(
              eq(classSessions.classId, classId),
              gte(classSessions.sessionDate, monthStart),
              lte(classSessions.sessionDate, today),
            ),
          );
        const sessionCount = Number(sessionsRow?.total ?? 0);
        if (sessionCount === 0) continue;

        const [enrolledRow] = await tx
          .select({ total: count() })
          .from(enrollments)
          .where(and(eq(enrollments.classId, classId), eq(enrollments.status, 'active')));
        const enrolledCount = Number(enrolledRow?.total ?? 0);
        if (enrolledCount === 0) continue;

        const [attendedRow] = await tx
          .select({ total: count() })
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
              eq(classSessions.classId, classId),
              gte(classSessions.sessionDate, monthStart),
              lte(classSessions.sessionDate, today),
            ),
          );
        rates.push(Number(attendedRow?.total ?? 0) / (sessionCount * enrolledCount));
      }
      const presencaMediaPct =
        rates.length === 0
          ? 0
          : Math.round((rates.reduce((sum, r) => sum + r, 0) / rates.length) * 100);

      // Today's classes with counts + the next-class hero.
      const todayClasses: ProfessorDashboard['todayClasses'] = [];
      const allSlots: Array<{ classId: string; className: string; slot: ScheduleSlotView }> = [];
      for (const klass of own) {
        const schedules = await tx
          .select()
          .from(classSchedules)
          .where(eq(classSchedules.classId, klass.id));
        for (const s of schedules) {
          allSlots.push({
            classId: klass.id,
            className: klass.name,
            slot: {
              weekday: s.weekday,
              startTime: normalizeTime(s.startTime),
              durationMinutes: s.durationMinutes,
            },
          });
        }

        const slot = await this.sessions.todaySlot(tx, klass.id, now);
        if (!slot) continue;
        const session = await this.sessions.findToday(tx, klass.id, now);
        const checkedInCount = session ? await this.sessions.presentCount(tx, session.id) : 0;
        const [enrolledRow] = await tx
          .select({ total: count() })
          .from(enrollments)
          .where(and(eq(enrollments.classId, klass.id), eq(enrollments.status, 'active')));
        todayClasses.push({
          classId: klass.id,
          className: klass.name,
          slot: { weekday: localWeekday(now), startTime: slot.startTime, durationMinutes: slot.durationMinutes },
          checkedInCount,
          enrolledCount: Number(enrolledRow?.total ?? 0),
        });
      }
      todayClasses.sort((a, b) => a.slot.startTime.localeCompare(b.slot.startTime));

      const best = nextSlot(allSlots.map((s) => s.slot), now);
      let nextClass: ProfessorDashboard['nextClass'] = null;
      if (best) {
        const holder = allSlots.find((s) => s.slot === best);
        if (holder) {
          const session = await this.sessions.findToday(tx, holder.classId, now);
          const checkedInCount =
            best.weekday === localWeekday(now) && session
              ? await this.sessions.presentCount(tx, session.id)
              : 0;
          nextClass = {
            classId: holder.classId,
            className: holder.className,
            slot: best,
            checkedInCount,
          };
        }
      }

      return { alunosHoje, presencaMediaPct, nextClass, todayClasses };
    });
  }
}
