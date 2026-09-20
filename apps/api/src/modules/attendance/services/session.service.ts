import { Injectable } from '@nestjs/common';
import { and, asc, count, eq, isNull } from 'drizzle-orm';
import {
  attendances,
  classSchedules,
  classSessions,
  classes,
  type DbTransaction,
} from '@tatame/db';
import { normalizeTime } from '../../enrollment/lib/derive.js';
import { addMinutes, instantAt, localDate, localWeekday } from '../lib/time.js';

export interface TodaySlot {
  startTime: string;
  durationMinutes: number;
  /** Slot start as an instant (tenant timezone). */
  startsAt: Date;
  /** Slot end as an instant. */
  endsAt: Date;
}

export interface MaterializedSession {
  id: string;
  classId: string;
  sessionDate: string;
  startsAt: Date | null;
  status: 'scheduled' | 'done' | 'canceled';
  /** Today's schedule slot, when one exists (drives windows and TTLs). */
  slot: TodaySlot | null;
}

/**
 * Lazy session materialization (spec 004, ATT.6): one occurrence per turma
 * per tenant-local day, created on demand by whichever entry point touches it
 * first (open chamada — live or manual — or an aluno manual check-in).
 * Idempotent upsert on `(tenant_id, class_id, session_date)`; under a
 * concurrent race the second insert waits on the unique index and then reads
 * the winner's row — exactly one occurrence either way.
 */
@Injectable()
export class SessionService {
  /** Earliest schedule slot of the class on today's tenant-local weekday. */
  async todaySlot(
    tx: DbTransaction,
    classId: string,
    now: Date = new Date(),
  ): Promise<TodaySlot | null> {
    const weekday = localWeekday(now);
    const rows = await tx
      .select()
      .from(classSchedules)
      .where(
        and(
          eq(classSchedules.classId, classId),
          eq(classSchedules.weekday, weekday),
        ),
      )
      .orderBy(asc(classSchedules.startTime));
    const slot = rows[0];
    if (!slot) return null;
    const startTime = normalizeTime(slot.startTime);
    const startsAt = instantAt(localDate(now), startTime);
    return {
      startTime,
      durationMinutes: slot.durationMinutes,
      startsAt,
      endsAt: addMinutes(startsAt, slot.durationMinutes),
    };
  }

  /** Idempotent materialization of today's session for the class. */
  async materializeToday(
    tx: DbTransaction,
    tenantId: string,
    classId: string,
    now: Date = new Date(),
  ): Promise<MaterializedSession> {
    const sessionDate = localDate(now);
    const slot = await this.todaySlot(tx, classId, now);
    await tx
      .insert(classSessions)
      .values({
        tenantId,
        classId,
        sessionDate,
        startsAt: slot?.startsAt ?? null,
      })
      .onConflictDoNothing({
        target: [
          classSessions.tenantId,
          classSessions.classId,
          classSessions.sessionDate,
        ],
      });
    const [session] = await tx
      .select()
      .from(classSessions)
      .where(
        and(
          eq(classSessions.classId, classId),
          eq(classSessions.sessionDate, sessionDate),
        ),
      );
    if (!session) throw new Error('Session materialization returned no row');
    return {
      id: session.id,
      classId: session.classId,
      sessionDate: session.sessionDate,
      startsAt: session.startsAt,
      status: session.status,
      slot,
    };
  }

  /** Today's session for the class WITHOUT materializing (read paths). */
  async findToday(
    tx: DbTransaction,
    classId: string,
    now: Date = new Date(),
  ): Promise<{ id: string; status: string } | null> {
    const [session] = await tx
      .select({ id: classSessions.id, status: classSessions.status })
      .from(classSessions)
      .where(
        and(
          eq(classSessions.classId, classId),
          eq(classSessions.sessionDate, localDate(now)),
        ),
      );
    return session ?? null;
  }

  /** Active (non-revoked) attendance count of a session. */
  async presentCount(
    tx: DbTransaction,
    classSessionId: string,
  ): Promise<number> {
    const [row] = await tx
      .select({ total: count() })
      .from(attendances)
      .where(
        and(
          eq(attendances.classSessionId, classSessionId),
          isNull(attendances.revokedAt),
        ),
      );
    return Number(row?.total ?? 0);
  }

  /**
   * Class row scoped to the professor when `professorUserId` is given — a
   * foreign class behaves as nonexistent (404 at the caller, never 403).
   */
  async ownedClass(
    tx: DbTransaction,
    classId: string,
    professorUserId?: string,
  ): Promise<typeof classes.$inferSelect | null> {
    const [row] = await tx
      .select()
      .from(classes)
      .where(eq(classes.id, classId));
    if (!row) return null;
    if (professorUserId && row.professorUserId !== professorUserId) return null;
    return row;
  }

  /** Session joined to its class, optionally professor-scoped (404 pattern). */
  async ownedSession(
    tx: DbTransaction,
    sessionId: string,
    professorUserId?: string,
  ): Promise<{
    session: typeof classSessions.$inferSelect;
    class: typeof classes.$inferSelect;
  } | null> {
    const [row] = await tx
      .select({ session: classSessions, class: classes })
      .from(classSessions)
      .innerJoin(
        classes,
        and(
          eq(classes.tenantId, classSessions.tenantId),
          eq(classes.id, classSessions.classId),
        ),
      )
      .where(eq(classSessions.id, sessionId));
    if (!row) return null;
    if (professorUserId && row.class.professorUserId !== professorUserId)
      return null;
    return row;
  }

  /** `true` when the pg error is the active-attendance partial-unique race. */
  static isDuplicateAttendance(error: unknown): boolean {
    const cause = (error as { cause?: unknown })?.cause ?? error;
    const pg = cause as { code?: string; constraint?: string };
    return (
      pg?.code === '23505' &&
      pg?.constraint === 'attendances_active_session_student_uq'
    );
  }

  /** `true` when the pg error is a checkin_codes partial-unique conflict. */
  static isCodeConflict(error: unknown): 'session' | 'digits' | null {
    const cause = (error as { cause?: unknown })?.cause ?? error;
    const pg = cause as { code?: string; constraint?: string };
    if (pg?.code !== '23505') return null;
    if (pg.constraint === 'checkin_codes_one_active_per_session_uq')
      return 'session';
    if (pg.constraint === 'checkin_codes_tenant_code_active_uq')
      return 'digits';
    return null;
  }
}
