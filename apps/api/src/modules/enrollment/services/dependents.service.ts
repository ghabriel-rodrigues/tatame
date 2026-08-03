import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  classSchedules,
  classes,
  enrollments,
  guardians,
  students,
  users,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { ageOn, nextSlot, normalizeTime, type ScheduleSlotView } from '../lib/derive.js';
import { EnrollmentService } from './enrollment.service.js';

export interface DependentClassView {
  id: string;
  name: string;
  schedules: ScheduleSlotView[];
  nextSlot: ScheduleSlotView | null;
}

export interface DependentDetail {
  id: string;
  fullName: string;
  birthDate: string;
  status: 'active' | 'inactive';
  class: DependentClassView | null;
}

const tenantCtx = (ctx: AuthContext) => ({ tenantId: ctx.tenantId, userId: ctx.userId });

/**
 * Responsável surface (ENR.11). Ownership is service-level filtering by the
 * caller's guardian record: a dependent that is not theirs behaves as a 404 —
 * even its existence is never leaked (story 35, the 001 debt).
 */
@Injectable()
export class DependentsService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly enrollmentService: EnrollmentService,
  ) {}

  async list(ctx: AuthContext): Promise<DependentDetail[]> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const guardianId = await this.guardianIdOf(tx, ctx.userId);
      if (!guardianId) return [];
      const rows = await tx
        .select()
        .from(students)
        .where(and(eq(students.guardianId, guardianId), eq(students.status, 'active')))
        .orderBy(asc(students.fullName));
      return this.withClasses(tx, rows);
    });
  }

  async get(ctx: AuthContext, dependentId: string): Promise<DependentDetail> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const guardianId = await this.guardianIdOf(tx, ctx.userId);
      const rows = guardianId
        ? await tx
            .select()
            .from(students)
            .where(and(eq(students.id, dependentId), eq(students.guardianId, guardianId)))
        : [];
      const row = rows[0];
      // Foreign dependent (or no guardian record at all) = 404, never 403.
      if (!row) throw problem(404, ErrorCodes.NOT_FOUND, 'Dependent not found');
      const [detail] = await this.withClasses(tx, [row]);
      return detail as DependentDetail;
    });
  }

  /**
   * Cadastrar filho (stories 31–34): creates the student guardian-linked by
   * construction and, when the age-suggested class was accepted, enrolls
   * under the capacity lock. A full class skips the enrollment — the
   * registration itself never fails on capacity.
   */
  async register(
    ctx: AuthContext,
    input: { fullName: string; birthDate: string; classId?: string },
  ): Promise<{ dependent: DependentDetail; enrolled: boolean }> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const guardianId = await this.ensureGuardianRecord(tx, ctx);

      if (input.classId) {
        const target = await tx
          .select()
          .from(classes)
          .where(eq(classes.id, input.classId));
        const found = target[0];
        if (!found || found.status !== 'active') {
          throw problem(404, ErrorCodes.NOT_FOUND, 'Class not found');
        }
        // The accepted class must be a legitimate suggestion target for this
        // child: age-ranged and matching. Anything else is self-service class
        // picking, which is out of scope.
        const age = ageOn(input.birthDate);
        const ranged = found.ageMin != null || found.ageMax != null;
        const matches =
          ranged &&
          (found.ageMin == null || age >= found.ageMin) &&
          (found.ageMax == null || age <= found.ageMax);
        if (!matches) {
          throw problem(422, ErrorCodes.VALIDATION_FAILED, 'Class does not match the child age', [
            { field: 'classId', messages: ['Class age range does not include this birth date'] },
          ]);
        }
      }

      const [row] = await tx
        .insert(students)
        .values({
          tenantId: ctx.tenantId as string,
          fullName: input.fullName,
          birthDate: input.birthDate,
          guardianId,
        })
        .returning();
      if (!row) throw problem(500, ErrorCodes.INTERNAL, 'Student insert returned no row');

      let enrolled = false;
      if (input.classId) {
        enrolled = await this.enrollmentService.tryEnrollInTx(
          tx,
          ctx.tenantId as string,
          input.classId,
          row.id,
        );
      }

      const [detail] = await this.withClasses(tx, [row]);
      return { dependent: detail as DependentDetail, enrolled };
    });
  }

  private async guardianIdOf(tx: DbTransaction, userId: string): Promise<string | null> {
    const rows = await tx
      .select({ id: guardians.id })
      .from(guardians)
      .where(eq(guardians.userId, userId));
    return rows[0]?.id ?? null;
  }

  /**
   * A guardian membership may predate its registry record (Phase-2 invites).
   * Registering a child claims/creates the record from the account profile.
   */
  private async ensureGuardianRecord(tx: DbTransaction, ctx: AuthContext): Promise<string> {
    const existing = await this.guardianIdOf(tx, ctx.userId);
    if (existing) return existing;
    const profile = await tx
      .select({ fullName: users.fullName, email: users.email, phone: users.phone })
      .from(users)
      .where(eq(users.id, ctx.userId));
    const user = profile[0];
    if (!user) throw problem(500, ErrorCodes.INTERNAL, 'Authenticated user profile missing');
    const [row] = await tx
      .insert(guardians)
      .values({
        tenantId: ctx.tenantId as string,
        userId: ctx.userId,
        fullName: user.fullName,
        email: user.email,
        phone: user.phone,
      })
      .returning({ id: guardians.id });
    if (!row) throw problem(500, ErrorCodes.INTERNAL, 'Guardian insert returned no row');
    return row.id;
  }

  private async withClasses(
    tx: DbTransaction,
    rows: Array<typeof students.$inferSelect>,
  ): Promise<DependentDetail[]> {
    if (rows.length === 0) return [];
    const enrollmentRows = await tx
      .select({
        studentId: enrollments.studentId,
        classId: classes.id,
        className: classes.name,
      })
      .from(enrollments)
      .innerJoin(
        classes,
        and(eq(classes.tenantId, enrollments.tenantId), eq(classes.id, enrollments.classId)),
      )
      .where(
        and(
          inArray(
            enrollments.studentId,
            rows.map((r) => r.id),
          ),
          eq(enrollments.status, 'active'),
        ),
      );

    const classIds = [...new Set(enrollmentRows.map((r) => r.classId))];
    const scheduleMap = new Map<string, ScheduleSlotView[]>();
    if (classIds.length > 0) {
      const scheduleRows = await tx
        .select()
        .from(classSchedules)
        .where(inArray(classSchedules.classId, classIds))
        .orderBy(asc(classSchedules.weekday), asc(classSchedules.startTime));
      for (const row of scheduleRows) {
        const list = scheduleMap.get(row.classId) ?? [];
        list.push({
          weekday: row.weekday,
          startTime: normalizeTime(row.startTime),
          durationMinutes: row.durationMinutes,
        });
        scheduleMap.set(row.classId, list);
      }
    }

    const classByStudent = new Map<string, DependentClassView>();
    for (const row of enrollmentRows) {
      if (classByStudent.has(row.studentId)) continue; // one active class shown
      const schedules = scheduleMap.get(row.classId) ?? [];
      classByStudent.set(row.studentId, {
        id: row.classId,
        name: row.className,
        schedules,
        nextSlot: nextSlot(schedules),
      });
    }

    return rows.map((row) => ({
      id: row.id,
      fullName: row.fullName,
      birthDate: row.birthDate,
      status: row.status,
      class: classByStudent.get(row.id) ?? null,
    }));
  }
}
