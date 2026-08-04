import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, eq, gt, isNull } from 'drizzle-orm';
import {
  attendances,
  checkinCodes,
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
import {
  ATTENDANCE_CHECKIN_RECORDED,
  type CheckinRecordedEvent,
} from '../attendance.events.js';
import {
  addMinutes,
  CHECKIN_EARLY_MINUTES,
  CODE_GRACE_MINUTES,
  localDate,
} from '../lib/time.js';
import { SessionService } from './session.service.js';
import { StatsService, type AlunoStats } from './stats.service.js';

export type CheckinMethod = 'qr' | 'code' | 'manual';

export interface CheckinInput {
  method: CheckinMethod;
  qrToken?: string;
  code?: string;
  classId?: string;
}

export interface CheckinResult {
  /** Stable duplicate state — clients render "Presença registrada", never an error. */
  status: 'checked_in' | 'already_checked_in';
  attendance: {
    id: string;
    classSessionId: string;
    method: CheckinMethod;
    checkedInAt: Date;
  };
  session: { id: string; classId: string; className: string; sessionDate: string };
  stats: AlunoStats;
}

const tenantCtx = (ctx: AuthContext) => ({ tenantId: ctx.tenantId, userId: ctx.userId });

/**
 * Aluno check-in (spec 004, ATT.7): three methods, one validated INSERT.
 * Validation order: active student record → resolution (code window for
 * qr/code, today's slot window for manual) → active enrollment → session is
 * today. Duplicates land on the already-checked-in state; a true race is
 * settled by the partial unique index and the loser converted to the same
 * response. The success payload carries fresh stats so the pop and the home
 * tiles update from one round trip.
 */
@Injectable()
export class CheckinService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly sessions: SessionService,
    private readonly stats: StatsService,
    private readonly events: EventEmitter2,
  ) {}

  async checkIn(ctx: AuthContext & { tenantId: string }, input: CheckinInput): Promise<CheckinResult> {
    const now = new Date();
    let event: CheckinRecordedEvent | null = null;

    const result = await withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const [student] = await tx
        .select({ id: students.id, fullName: students.fullName })
        .from(students)
        .where(and(eq(students.userId, ctx.userId), eq(students.status, 'active')));
      if (!student) {
        throw problem(404, ErrorCodes.NOT_FOUND, 'No active student record for this account');
      }

      const resolved = await this.resolveSession(tx, ctx, input, now);

      // Enrollment gate — required for every method (story 11).
      const [enrollment] = await tx
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.classId, resolved.classId),
            eq(enrollments.studentId, student.id),
            eq(enrollments.status, 'active'),
          ),
        );
      if (!enrollment) {
        throw problem(403, ErrorCodes.CHECKIN_NOT_ENROLLED, 'Not enrolled in this class');
      }

      if (resolved.sessionDate !== localDate(now)) {
        throw problem(
          422,
          ErrorCodes.CHECKIN_NO_SESSION_TODAY,
          'Check-in is only accepted on the day of the session',
        );
      }

      // Duplicate pre-check (story 9) — the fast path of the duplicate state.
      const existing = await this.activeAttendance(tx, resolved.sessionId, student.id);
      if (existing) {
        return this.result('already_checked_in', existing, resolved, await this.freshStats(tx, ctx, student.id, now));
      }

      let inserted: typeof attendances.$inferSelect | undefined;
      try {
        // SAVEPOINT so the unique-violation loser keeps the outer tx usable.
        inserted = await tx.transaction(async (stx) => {
          const [row] = await stx
            .insert(attendances)
            .values({
              tenantId: ctx.tenantId,
              classSessionId: resolved.sessionId,
              studentId: student.id,
              method: input.method,
              checkedInAt: now,
              recordedByUserId: null, // self check-in — the row is the record
            })
            .returning();
          return row;
        });
      } catch (error) {
        if (!SessionService.isDuplicateAttendance(error)) throw error;
        const winner = await this.activeAttendance(tx, resolved.sessionId, student.id);
        if (!winner) throw error;
        return this.result('already_checked_in', winner, resolved, await this.freshStats(tx, ctx, student.id, now));
      }
      if (!inserted) throw problem(500, ErrorCodes.INTERNAL, 'Attendance insert returned no row');

      const presentCount = await this.sessions.presentCount(tx, resolved.sessionId);
      event = {
        tenantId: ctx.tenantId,
        classSessionId: resolved.sessionId,
        attendanceId: inserted.id,
        studentId: student.id,
        studentName: student.fullName,
        method: input.method,
        checkedInAt: inserted.checkedInAt.toISOString(),
        presentCount,
      };

      return this.result('checked_in', inserted, resolved, await this.freshStats(tx, ctx, student.id, now));
    });

    // Post-commit bridge (be-09): only committed check-ins reach a stream.
    if (event) this.events.emit(ATTENDANCE_CHECKIN_RECORDED, event);
    return result;
  }

  /** Per-method resolution to a (session, class) pair. */
  private async resolveSession(
    tx: DbTransaction,
    ctx: AuthContext & { tenantId: string },
    input: CheckinInput,
    now: Date,
  ): Promise<{ sessionId: string; classId: string; className: string; sessionDate: string }> {
    if (input.method === 'qr' || input.method === 'code') {
      const secret = input.method === 'qr' ? input.qrToken : input.code;
      if (!secret) {
        throw problem(422, ErrorCodes.VALIDATION_FAILED, 'Missing code for the chosen method', [
          {
            field: input.method === 'qr' ? 'qrToken' : 'code',
            messages: ['Required for this method'],
          },
        ]);
      }
      // Active (not revoked, not expired) code — a wrong, expired, closed or
      // foreign-academy code all behave as nonexistent (stories 7/46; RLS
      // guarantees the foreign case).
      const [row] = await tx
        .select({
          sessionId: classSessions.id,
          classId: classSessions.classId,
          className: classes.name,
          sessionDate: classSessions.sessionDate,
        })
        .from(checkinCodes)
        .innerJoin(
          classSessions,
          and(
            eq(classSessions.tenantId, checkinCodes.tenantId),
            eq(classSessions.id, checkinCodes.classSessionId),
          ),
        )
        .innerJoin(
          classes,
          and(eq(classes.tenantId, classSessions.tenantId), eq(classes.id, classSessions.classId)),
        )
        .where(
          and(
            input.method === 'qr' ? eq(checkinCodes.qrToken, secret) : eq(checkinCodes.code, secret),
            isNull(checkinCodes.revokedAt),
            gt(checkinCodes.expiresAt, now),
          ),
        );
      if (!row) {
        throw problem(404, ErrorCodes.CHECKIN_CODE_INVALID, 'Invalid or expired check-in code');
      }
      return row;
    }

    // manual — today's session for the given class, materialized on demand,
    // accepted only inside the window: slot start − 30 min → slot end + grace.
    if (!input.classId) {
      throw problem(422, ErrorCodes.VALIDATION_FAILED, 'Missing classId for manual check-in', [
        { field: 'classId', messages: ['Required for the manual method'] },
      ]);
    }
    const klass = await this.sessions.ownedClass(tx, input.classId);
    if (!klass || klass.status !== 'active') {
      throw problem(404, ErrorCodes.NOT_FOUND, 'Class not found');
    }
    const slot = await this.sessions.todaySlot(tx, input.classId, now);
    if (!slot) {
      throw problem(
        422,
        ErrorCodes.CHECKIN_NO_SESSION_TODAY,
        'This class has no session scheduled for today',
      );
    }
    const opensAt = addMinutes(slot.startsAt, -CHECKIN_EARLY_MINUTES);
    const closesAt = addMinutes(slot.endsAt, CODE_GRACE_MINUTES);
    if (now < opensAt || now > closesAt) {
      throw problem(
        422,
        ErrorCodes.CHECKIN_OUTSIDE_WINDOW,
        'Manual check-in is outside the class window',
      );
    }
    const session = await this.sessions.materializeToday(tx, ctx.tenantId, input.classId, now);
    return {
      sessionId: session.id,
      classId: klass.id,
      className: klass.name,
      sessionDate: session.sessionDate,
    };
  }

  private async activeAttendance(tx: DbTransaction, sessionId: string, studentId: string) {
    const [row] = await tx
      .select()
      .from(attendances)
      .where(
        and(
          eq(attendances.classSessionId, sessionId),
          eq(attendances.studentId, studentId),
          isNull(attendances.revokedAt),
        ),
      );
    return row ?? null;
  }

  private async freshStats(
    tx: DbTransaction,
    ctx: AuthContext & { tenantId: string },
    studentId: string,
    now: Date,
  ): Promise<AlunoStats> {
    const stats = await this.stats.alunoStats(tx, ctx.tenantId, studentId, now);
    // Toggle read uses its own cached lookup outside this tx — display-only.
    return this.stats.applyGamificationToggle(ctx.tenantId, stats);
  }

  private result(
    status: CheckinResult['status'],
    row: typeof attendances.$inferSelect,
    resolved: { sessionId: string; classId: string; className: string; sessionDate: string },
    stats: AlunoStats,
  ): CheckinResult {
    return {
      status,
      attendance: {
        id: row.id,
        classSessionId: row.classSessionId,
        method: row.method,
        checkedInAt: row.checkedInAt,
      },
      session: {
        id: resolved.sessionId,
        classId: resolved.classId,
        className: resolved.className,
        sessionDate: resolved.sessionDate,
      },
      stats,
    };
  }
}
