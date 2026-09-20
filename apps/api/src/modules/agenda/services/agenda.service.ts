import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, isNull } from 'drizzle-orm';
import {
  attendances,
  classSchedules,
  classSessions,
  classes,
  enrollments,
  students,
  users,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { localDate, localWeekday } from '../../attendance/lib/time.js';
import { normalizeTime } from '../../enrollment/lib/derive.js';
import type { CalendarEventItemView } from '../../events/events.types.js';
import { EventsQueryService } from '../../events/services/events-query.service.js';
import type { BeltRef } from '../../graduation/graduation.types.js';
import { GraduationQueryService } from '../../graduation/services/graduation-query.service.js';

export interface AgendaOccupancy {
  /** Active enrollments — the "N" of the "N de M" chip. */
  active: number;
  capacity: number;
}

export interface AlunoAgendaClassItem {
  classId: string;
  className: string;
  startTime: string;
  /** Slot start + duration, HH:MM. */
  endTime: string;
  professorName: string;
  ageMin: number | null;
  ageMax: number | null;
  minBelt: BeltRef | null;
  maxBelt: BeltRef | null;
  occupancy: AgendaOccupancy;
  /**
   * Only meaningful when `isToday`: today's session row exists AND the caller
   * has an active (non-revoked) attendance on it. Always false otherwise —
   * clients render the check-in button iff `isToday && !checkedIn`.
   */
  checkedIn: boolean;
}

export interface AlunoAgenda {
  weekday: number;
  isToday: boolean;
  classes: AlunoAgendaClassItem[];
  /**
   * "Eventos do mês" (spec 008 filled the Phase-7 contract): the current
   * tenant-local month's published events with the caller's own state.
   */
  events: CalendarEventItemView[];
}

export interface CalendarClassItem {
  classId: string;
  className: string;
  startTime: string;
  endTime: string;
  professorName: string;
  occupancy: AgendaOccupancy;
}

export interface CalendarView {
  month: string;
  /** Weekly recurrence buckets, 0 = Sunday … 6 = Saturday. Client expands. */
  classesByWeekday: Record<string, CalendarClassItem[]>;
  /**
   * The requested month's published events as dated items (spec 008 filled
   * the Phase-7 contract) — the pink dots. Aluno items carry own state.
   */
  events: CalendarEventItemView[];
}

export type CalendarPersona = 'aluno' | 'professor' | 'admin';

const tenantCtx = (ctx: AuthContext) => ({
  tenantId: ctx.tenantId,
  userId: ctx.userId,
});

/** Slot end as HH:MM (start + duration, wrapping midnight). */
function endTimeOf(startTime: string, durationMinutes: number): string {
  const [hours = 0, minutes = 0] = startTime.split(':').map(Number);
  const total = (hours * 60 + minutes + durationMinutes) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * Agenda & calendar read models (spec 007, AGD.1/AGD.2): pure reads over
 * enrollment/attendance-owned tables — zero migrations, zero writes. Sessions
 * are read on exactly one path (the agenda's today check-in state) and NEVER
 * materialized; calendars derive from schedules alone (the recurring plan).
 */
@Injectable()
export class AgendaService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly graduationQuery: GraduationQueryService,
    private readonly eventsQuery: EventsQueryService,
  ) {}

  /** GET /aluno/agenda — enrolled-class slots of one weekday (default today). */
  async alunoAgenda(
    ctx: AuthContext & { tenantId: string },
    weekdayParam?: number,
  ): Promise<AlunoAgenda> {
    const now = new Date();
    const today = localWeekday(now);
    const weekday = weekdayParam ?? today;
    const isToday = weekday === today;

    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const student = await this.requireStudent(tx, ctx.userId);

      const rows = await tx
        .select({ class: classes, schedule: classSchedules })
        .from(enrollments)
        .innerJoin(
          classes,
          and(
            eq(classes.tenantId, enrollments.tenantId),
            eq(classes.id, enrollments.classId),
          ),
        )
        .innerJoin(
          classSchedules,
          and(
            eq(classSchedules.tenantId, classes.tenantId),
            eq(classSchedules.classId, classes.id),
          ),
        )
        .where(
          and(
            eq(enrollments.studentId, student.id),
            eq(enrollments.status, 'active'),
            eq(classes.status, 'active'),
            eq(classSchedules.weekday, weekday),
          ),
        )
        .orderBy(asc(classSchedules.startTime), asc(classes.name));

      const classIds = [...new Set(rows.map((r) => r.class.id))];
      const [occupancyMap, professorMap, catalog] = await Promise.all([
        this.occupancyByClass(tx, classIds),
        this.professorNames(tx, [
          ...new Set(rows.map((r) => r.class.professorUserId)),
        ]),
        this.graduationQuery.catalogById(tx),
      ]);

      // Today state — a pure read: no session row (or a revoked attendance)
      // simply means `checkedIn: false`; nothing is materialized here.
      const checkedInByClass = new Map<string, boolean>();
      if (isToday && classIds.length > 0) {
        const sessionDate = localDate(now);
        const sessions = await tx
          .select({ id: classSessions.id, classId: classSessions.classId })
          .from(classSessions)
          .where(
            and(
              inArray(classSessions.classId, classIds),
              eq(classSessions.sessionDate, sessionDate),
            ),
          );
        if (sessions.length > 0) {
          const attended = await tx
            .select({ classSessionId: attendances.classSessionId })
            .from(attendances)
            .where(
              and(
                inArray(
                  attendances.classSessionId,
                  sessions.map((s) => s.id),
                ),
                eq(attendances.studentId, student.id),
                isNull(attendances.revokedAt),
              ),
            );
          const attendedSessionIds = new Set(
            attended.map((a) => a.classSessionId),
          );
          for (const session of sessions) {
            checkedInByClass.set(
              session.classId,
              attendedSessionIds.has(session.id),
            );
          }
        }
      }

      const beltRef = (beltId: string | null): BeltRef | null => {
        if (!beltId) return null;
        const belt = catalog.get(beltId);
        if (!belt) return null;
        return {
          beltId: belt.beltId,
          name: belt.name,
          colorSlug: belt.colorSlug,
          tipColorSlug: belt.tipColorSlug,
          maxDegrees: belt.maxDegrees,
        };
      };

      // "Eventos do mês": the current tenant-local month's published events
      // with the caller's own registration state (spec 008 — the Phase-7
      // empty state retires).
      const monthEvents = await this.eventsQuery.monthEventItems(
        tx,
        localDate(now).slice(0, 7),
        student.id,
      );

      return {
        weekday,
        isToday,
        classes: rows.map(({ class: klass, schedule }) => {
          const startTime = normalizeTime(schedule.startTime);
          return {
            classId: klass.id,
            className: klass.name,
            startTime,
            endTime: endTimeOf(startTime, schedule.durationMinutes),
            professorName: professorMap.get(klass.professorUserId) ?? '',
            ageMin: klass.ageMin,
            ageMax: klass.ageMax,
            minBelt: beltRef(klass.minBeltId),
            maxBelt: beltRef(klass.maxBeltId),
            occupancy: {
              active: occupancyMap.get(klass.id) ?? 0,
              capacity: klass.capacity,
            },
            checkedIn: checkedInByClass.get(klass.id) ?? false,
          };
        }),
        events: monthEvents,
      };
    });
  }

  /**
   * GET /{aluno|professor|admin}/calendar — persona-scoped weekly recurrence
   * buckets. Never touches `class_sessions`: the calendar shows the plan.
   */
  async calendar(
    ctx: AuthContext & { tenantId: string },
    persona: CalendarPersona,
    month?: string,
  ): Promise<CalendarView> {
    // The month windows the events (spec 008); recurrence stays month-free.
    const echoedMonth = month ?? localDate(new Date()).slice(0, 7);

    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      let alunoStudentId: string | undefined;
      let classRows: Array<typeof classes.$inferSelect>;
      if (persona === 'aluno') {
        const student = await this.requireStudent(tx, ctx.userId);
        alunoStudentId = student.id;
        classRows = (
          await tx
            .select({ class: classes })
            .from(enrollments)
            .innerJoin(
              classes,
              and(
                eq(classes.tenantId, enrollments.tenantId),
                eq(classes.id, enrollments.classId),
              ),
            )
            .where(
              and(
                eq(enrollments.studentId, student.id),
                eq(enrollments.status, 'active'),
                eq(classes.status, 'active'),
              ),
            )
        ).map((r) => r.class);
      } else {
        const conditions = [eq(classes.status, 'active')];
        if (persona === 'professor')
          conditions.push(eq(classes.professorUserId, ctx.userId));
        classRows = await tx
          .select()
          .from(classes)
          .where(and(...conditions));
      }

      const classById = new Map(classRows.map((row) => [row.id, row]));
      const classIds = [...classById.keys()];
      const [occupancyMap, professorMap] = await Promise.all([
        this.occupancyByClass(tx, classIds),
        this.professorNames(tx, [
          ...new Set(classRows.map((r) => r.professorUserId)),
        ]),
      ]);

      const classesByWeekday: Record<string, CalendarClassItem[]> = {};
      for (let day = 0; day <= 6; day += 1) classesByWeekday[day] = [];

      if (classIds.length > 0) {
        const slots = await tx
          .select()
          .from(classSchedules)
          .where(inArray(classSchedules.classId, classIds))
          .orderBy(asc(classSchedules.weekday), asc(classSchedules.startTime));
        for (const slot of slots) {
          const klass = classById.get(slot.classId);
          if (!klass) continue;
          const startTime = normalizeTime(slot.startTime);
          classesByWeekday[slot.weekday]?.push({
            classId: klass.id,
            className: klass.name,
            startTime,
            endTime: endTimeOf(startTime, slot.durationMinutes),
            professorName: professorMap.get(klass.professorUserId) ?? '',
            occupancy: {
              active: occupancyMap.get(klass.id) ?? 0,
              capacity: klass.capacity,
            },
          });
        }
      }

      // The pink dots: the requested month's published events, bucketed in
      // the tenant timezone. Aluno items carry the caller's own state.
      const monthEvents = await this.eventsQuery.monthEventItems(
        tx,
        echoedMonth,
        alunoStudentId,
      );
      return { month: echoedMonth, classesByWeekday, events: monthEvents };
    });
  }

  /** The caller's active student record — the aluno surfaces' identity seam. */
  private async requireStudent(
    tx: DbTransaction,
    userId: string,
  ): Promise<{ id: string }> {
    const [student] = await tx
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.userId, userId), eq(students.status, 'active')));
    if (!student) {
      throw problem(
        404,
        ErrorCodes.NOT_FOUND,
        'No active student record for this account',
      );
    }
    return student;
  }

  private async occupancyByClass(
    tx: DbTransaction,
    classIds: string[],
  ): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    if (classIds.length === 0) return map;
    const rows = await tx
      .select({ classId: enrollments.classId, total: count() })
      .from(enrollments)
      .where(
        and(
          inArray(enrollments.classId, classIds),
          eq(enrollments.status, 'active'),
        ),
      )
      .groupBy(enrollments.classId);
    for (const row of rows) map.set(row.classId, Number(row.total));
    return map;
  }

  private async professorNames(
    tx: DbTransaction,
    userIds: string[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (userIds.length === 0) return map;
    const rows = await tx
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, userIds));
    for (const row of rows) map.set(row.id, row.fullName);
    return map;
  }
}
