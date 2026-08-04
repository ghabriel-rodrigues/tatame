import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import {
  attendances,
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
import { GraduationQueryService } from '../../graduation/services/graduation-query.service.js';
import type { BeltView } from '../../graduation/graduation.types.js';
import {
  ATTENDANCE_CHECKIN_RECORDED,
  ATTENDANCE_REVOKED,
  type AttendanceRevokedEvent,
  type CheckinRecordedEvent,
} from '../attendance.events.js';
import { SessionService } from './session.service.js';

export interface RosterRow {
  studentId: string;
  fullName: string;
  /** Derived current belt (GRD.6) — roll-call rows carry the belt chip. */
  belt: BeltView;
  attendance: {
    id: string;
    method: 'qr' | 'code' | 'manual';
    checkedInAt: Date;
    /** NULL = self check-in; set = professor-recorded manual row. */
    recordedByUserId: string | null;
  } | null;
}

export interface RollCallView {
  session: {
    id: string;
    classId: string;
    className: string;
    sessionDate: string;
    startsAt: Date | null;
    status: string;
  };
  presentCount: number;
  roster: RosterRow[];
}

export interface MarkResult {
  status: 'checked_in' | 'already_checked_in';
  attendance: { id: string; classSessionId: string; studentId: string; checkedInAt: Date };
  presentCount: number;
}

export interface RevokeResult {
  status: 'revoked' | 'already_revoked';
  attendanceId: string;
  presentCount: number;
}

const tenantCtx = (ctx: AuthContext) => ({ tenantId: ctx.tenantId, userId: ctx.userId });

/**
 * Professor manual roll call (spec 004, ATT.8) + the audited revoke paths
 * (professor same-day, admin any-time — ATT.9). Every revoke goes exclusively
 * through the `attendance_revoke` SECURITY DEFINER seam, which validates the
 * tenant, enforces the window rule and writes the audit row in-transaction.
 * Per-tap semantics: every toggle is one immediate request; "Salvar chamada"
 * is pure client navigation.
 */
@Injectable()
export class RollCallService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly sessions: SessionService,
    private readonly events: EventEmitter2,
    private readonly graduationQuery: GraduationQueryService,
  ) {}

  /** POST /professor/classes/:id/roll-call — materialize + roster (stories 27/30). */
  async open(ctx: AuthContext & { tenantId: string }, classId: string): Promise<RollCallView> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const klass = await this.sessions.ownedClass(tx, classId, ctx.userId);
      if (!klass || klass.status !== 'active') {
        throw problem(404, ErrorCodes.NOT_FOUND, 'Class not found');
      }
      const session = await this.sessions.materializeToday(tx, ctx.tenantId, classId);
      return this.assemble(tx, {
        id: session.id,
        classId,
        className: klass.name,
        sessionDate: session.sessionDate,
        startsAt: session.startsAt,
        status: session.status,
      });
    });
  }

  /** POST /professor/sessions/:id/attendances — toggle on (stories 28/32). */
  async mark(
    ctx: AuthContext & { tenantId: string },
    sessionId: string,
    studentId: string,
  ): Promise<MarkResult> {
    let event: CheckinRecordedEvent | null = null;
    const result = await withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const owned = await this.sessions.ownedSession(tx, sessionId, ctx.userId);
      if (!owned) throw problem(404, ErrorCodes.NOT_FOUND, 'Session not found');

      const [student] = await tx
        .select({ id: students.id, fullName: students.fullName })
        .from(students)
        .where(and(eq(students.id, studentId), eq(students.status, 'active')));
      if (!student) throw problem(404, ErrorCodes.NOT_FOUND, 'Student not found');

      const [enrollment] = await tx
        .select({ id: enrollments.id })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.classId, owned.session.classId),
            eq(enrollments.studentId, studentId),
            eq(enrollments.status, 'active'),
          ),
        );
      if (!enrollment) {
        throw problem(403, ErrorCodes.CHECKIN_NOT_ENROLLED, 'Student is not enrolled in this class');
      }

      const [existing] = await tx
        .select()
        .from(attendances)
        .where(
          and(
            eq(attendances.classSessionId, sessionId),
            eq(attendances.studentId, studentId),
            isNull(attendances.revokedAt),
          ),
        );
      if (existing) {
        return {
          status: 'already_checked_in' as const,
          attendance: {
            id: existing.id,
            classSessionId: existing.classSessionId,
            studentId: existing.studentId,
            checkedInAt: existing.checkedInAt,
          },
          presentCount: await this.sessions.presentCount(tx, sessionId),
        };
      }

      const now = new Date();
      let inserted: typeof attendances.$inferSelect | undefined;
      try {
        inserted = await tx.transaction(async (stx) => {
          const [row] = await stx
            .insert(attendances)
            .values({
              tenantId: ctx.tenantId,
              classSessionId: sessionId,
              studentId,
              method: 'manual',
              checkedInAt: now,
              recordedByUserId: ctx.userId,
            })
            .returning();
          return row;
        });
      } catch (error) {
        if (!SessionService.isDuplicateAttendance(error)) throw error;
        const [winner] = await tx
          .select()
          .from(attendances)
          .where(
            and(
              eq(attendances.classSessionId, sessionId),
              eq(attendances.studentId, studentId),
              isNull(attendances.revokedAt),
            ),
          );
        if (!winner) throw error;
        return {
          status: 'already_checked_in' as const,
          attendance: {
            id: winner.id,
            classSessionId: winner.classSessionId,
            studentId: winner.studentId,
            checkedInAt: winner.checkedInAt,
          },
          presentCount: await this.sessions.presentCount(tx, sessionId),
        };
      }
      if (!inserted) throw problem(500, ErrorCodes.INTERNAL, 'Attendance insert returned no row');

      // Professor-recorded manual rows ARE audited (resolved audit policy),
      // in the same transaction, through the append-only seam.
      await tx.execute(sql`
        SELECT audit_append(
          ${ctx.tenantId}::uuid,
          ${ctx.userId}::uuid,
          ${ctx.impersonatorUserId}::uuid,
          'attendance.recorded_manual',
          'attendance',
          ${inserted.id}::text,
          ${JSON.stringify({
            attendance_id: inserted.id,
            class_session_id: sessionId,
            student_id: studentId,
          })}::jsonb
        )
      `);

      const presentCount = await this.sessions.presentCount(tx, sessionId);
      event = {
        tenantId: ctx.tenantId,
        classSessionId: sessionId,
        attendanceId: inserted.id,
        studentId,
        studentName: student.fullName,
        method: 'manual',
        checkedInAt: inserted.checkedInAt.toISOString(),
        presentCount,
      };
      return {
        status: 'checked_in' as const,
        attendance: {
          id: inserted.id,
          classSessionId: inserted.classSessionId,
          studentId: inserted.studentId,
          checkedInAt: inserted.checkedInAt,
        },
        presentCount,
      };
    });
    if (event) this.events.emit(ATTENDANCE_CHECKIN_RECORDED, event);
    return result;
  }

  /**
   * Revoke through the seam. `scope: 'professor'` additionally requires the
   * attendance's class to be taught by the caller (foreign → 404) and is
   * bound by the seam's same-day window; `scope: 'admin'` is any-time.
   */
  async revoke(
    ctx: AuthContext & { tenantId: string },
    attendanceId: string,
    scope: 'professor' | 'admin',
    reason?: string,
  ): Promise<RevokeResult> {
    let event: AttendanceRevokedEvent | null = null;
    const result = await withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const [target] = await tx
        .select({
          id: attendances.id,
          classSessionId: attendances.classSessionId,
          professorUserId: classes.professorUserId,
        })
        .from(attendances)
        .innerJoin(
          classSessions,
          and(
            eq(classSessions.tenantId, attendances.tenantId),
            eq(classSessions.id, attendances.classSessionId),
          ),
        )
        .innerJoin(
          classes,
          and(eq(classes.tenantId, classSessions.tenantId), eq(classes.id, classSessions.classId)),
        )
        .where(eq(attendances.id, attendanceId));
      // Cross-tenant ids are invisible under RLS — same 404 as nonexistent.
      if (!target) throw problem(404, ErrorCodes.NOT_FOUND, 'Attendance not found');
      if (scope === 'professor' && target.professorUserId !== ctx.userId) {
        throw problem(404, ErrorCodes.NOT_FOUND, 'Attendance not found');
      }

      const revoked = await tx.execute(sql`
        SELECT status, attendance_id, revoke_window
        FROM attendance_revoke(
          ${ctx.tenantId}::uuid,
          ${attendanceId}::uuid,
          ${ctx.userId}::uuid,
          ${reason ?? null},
          ${ctx.impersonatorUserId}::uuid
        )
      `);
      const status = String(revoked.rows[0]?.['status']);
      const presentCount = await this.sessions.presentCount(tx, target.classSessionId);

      switch (status) {
        case 'revoked':
          event = {
            tenantId: ctx.tenantId,
            classSessionId: target.classSessionId,
            attendanceId,
            presentCount,
          };
          return { status: 'revoked' as const, attendanceId, presentCount };
        case 'already_revoked':
          // Per-tap semantics: a second toggle-off is benign.
          return { status: 'already_revoked' as const, attendanceId, presentCount };
        case 'window_closed':
          throw problem(
            403,
            ErrorCodes.ATTENDANCE_REVOKE_WINDOW_CLOSED,
            'Past-day presences can only be revoked by an admin',
          );
        case 'not_allowed':
          throw problem(403, ErrorCodes.AUTHZ_FORBIDDEN_ROLE, 'Not allowed to revoke attendances');
        default:
          throw problem(404, ErrorCodes.NOT_FOUND, 'Attendance not found');
      }
    });
    if (event) this.events.emit(ATTENDANCE_REVOKED, event);
    return result;
  }

  private async assemble(
    tx: DbTransaction,
    session: RollCallView['session'],
  ): Promise<RollCallView> {
    const rows = await tx
      .select({
        studentId: students.id,
        fullName: students.fullName,
        attendanceId: attendances.id,
        method: attendances.method,
        checkedInAt: attendances.checkedInAt,
        recordedByUserId: attendances.recordedByUserId,
      })
      .from(enrollments)
      .innerJoin(
        students,
        and(eq(students.tenantId, enrollments.tenantId), eq(students.id, enrollments.studentId)),
      )
      .leftJoin(
        attendances,
        and(
          eq(attendances.tenantId, enrollments.tenantId),
          eq(attendances.classSessionId, session.id),
          eq(attendances.studentId, enrollments.studentId),
          isNull(attendances.revokedAt),
        ),
      )
      .where(and(eq(enrollments.classId, session.classId), eq(enrollments.status, 'active')))
      .orderBy(asc(students.fullName));

    const beltByStudent = await this.graduationQuery.currentBeltMap(
      tx,
      rows.map((r) => r.studentId),
    );
    const roster: RosterRow[] = rows.map((row) => ({
      studentId: row.studentId,
      fullName: row.fullName,
      belt: beltByStudent.get(row.studentId) as BeltView,
      attendance:
        row.attendanceId && row.method && row.checkedInAt
          ? {
              id: row.attendanceId,
              method: row.method,
              checkedInAt: row.checkedInAt,
              recordedByUserId: row.recordedByUserId,
            }
          : null,
    }));
    return {
      session,
      presentCount: roster.filter((r) => r.attendance).length,
      roster,
    };
  }
}
