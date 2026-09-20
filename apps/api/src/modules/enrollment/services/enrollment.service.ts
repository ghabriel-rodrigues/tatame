import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, inArray, notInArray } from 'drizzle-orm';
import {
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

export interface EnrollmentResult {
  classId: string;
  studentId: string;
  status: 'active' | 'removed';
}

/** Ownership filter for the professor surface: a foreign class is a 404. */
export interface RosterScope {
  professorUserId?: string;
}

const tenantCtx = (ctx: AuthContext) => ({
  tenantId: ctx.tenantId,
  userId: ctx.userId,
});

/**
 * Enrollment mutations (ENR.9). Capacity is enforced inside the tenant
 * transaction under a `SELECT … FOR UPDATE` on the class row — single adds,
 * bulk moves and the invite-accept seam all serialize through the same lock,
 * so a race can never overfill a class. No DB trigger.
 */
@Injectable()
export class EnrollmentService {
  constructor(@Inject(APP_DB) private readonly appDb: DbHandle) {}

  async addStudent(
    ctx: AuthContext,
    classId: string,
    studentId: string,
    scope: RosterScope = {},
  ): Promise<EnrollmentResult> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const target = await this.lockClass(tx, classId, scope);

      const studentRows = await tx
        .select({ id: students.id, status: students.status })
        .from(students)
        .where(eq(students.id, studentId));
      const student = studentRows[0];
      if (!student)
        throw problem(404, ErrorCodes.NOT_FOUND, 'Student not found');
      if (student.status !== 'active') {
        throw problem(
          422,
          ErrorCodes.VALIDATION_FAILED,
          'Archived students cannot be enrolled',
          [{ field: 'studentId', messages: ['Student is archived'] }],
        );
      }

      const existing = await tx
        .select({ id: enrollments.id, status: enrollments.status })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.classId, classId),
            eq(enrollments.studentId, studentId),
          ),
        );
      if (existing[0]?.status === 'active') {
        throw problem(
          409,
          ErrorCodes.ENROLLMENT_ALREADY_ENROLLED,
          'Student is already enrolled in this class',
        );
      }

      const occupancy = await this.activeCount(tx, classId);
      if (occupancy >= target.capacity) {
        throw problem(409, ErrorCodes.CLASS_FULL, 'Class is at capacity');
      }

      // Reactivation upsert: one row per (tenant, class, student) — re-adding
      // flips the removed row back to active, never inserts a second row.
      await tx
        .insert(enrollments)
        .values({ tenantId: ctx.tenantId as string, classId, studentId })
        .onConflictDoUpdate({
          target: [
            enrollments.tenantId,
            enrollments.classId,
            enrollments.studentId,
          ],
          set: { status: 'active', updatedAt: new Date() },
        });

      return { classId, studentId, status: 'active' as const };
    });
  }

  async removeStudent(
    ctx: AuthContext,
    classId: string,
    studentId: string,
    scope: RosterScope = {},
  ): Promise<EnrollmentResult> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      await this.lockClass(tx, classId, scope, { allowArchived: true });
      const [row] = await tx
        .update(enrollments)
        .set({ status: 'removed', updatedAt: new Date() })
        .where(
          and(
            eq(enrollments.classId, classId),
            eq(enrollments.studentId, studentId),
            eq(enrollments.status, 'active'),
          ),
        )
        .returning({ id: enrollments.id });
      if (!row)
        throw problem(404, ErrorCodes.NOT_FOUND, 'Active enrollment not found');
      return { classId, studentId, status: 'removed' as const };
    });
  }

  /**
   * Atomic bulk move (stories 20–23): every selected student leaves their
   * current classes and enters the destination, or nothing changes. The
   * whole-selection capacity check runs under the destination lock.
   */
  async moveStudents(
    ctx: AuthContext,
    studentIds: string[],
    destinationClassId: string,
  ): Promise<{ destinationClassId: string; movedStudentIds: string[] }> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const destination = await this.lockClass(tx, destinationClassId, {});

      const found = await tx
        .select({ id: students.id, status: students.status })
        .from(students)
        .where(inArray(students.id, studentIds));
      const foundIds = new Set(found.map((row) => row.id));
      const missing = studentIds.filter((id) => !foundIds.has(id));
      if (missing.length > 0) {
        throw problem(
          404,
          ErrorCodes.NOT_FOUND,
          'Some selected students were not found',
          missing.map((id) => ({ field: id, messages: ['Student not found'] })),
        );
      }
      const archived = found.filter((row) => row.status !== 'active');
      if (archived.length > 0) {
        throw problem(
          422,
          ErrorCodes.VALIDATION_FAILED,
          'Archived students cannot be moved',
          archived.map((row) => ({
            field: row.id,
            messages: ['Student is archived'],
          })),
        );
      }

      // Seats already held by students OUTSIDE the selection stay occupied;
      // selected students' own destination seats are being re-granted.
      const [others] = await tx
        .select({ total: count() })
        .from(enrollments)
        .where(
          and(
            eq(enrollments.classId, destinationClassId),
            eq(enrollments.status, 'active'),
            notInArray(enrollments.studentId, studentIds),
          ),
        );
      const free = destination.capacity - Number(others?.total ?? 0);
      if (free < studentIds.length) {
        throw problem(
          409,
          ErrorCodes.CLASS_CAPACITY_EXCEEDED,
          `Destination has ${Math.max(free, 0)} free slot(s) for ${studentIds.length} student(s)`,
          studentIds.slice(Math.max(free, 0)).map((id) => ({
            field: id,
            messages: ['No seat available in the destination class'],
          })),
        );
      }

      // End ALL current active enrollments of the selection (the student's
      // schedule follows the destination class), then enroll everyone.
      await tx
        .update(enrollments)
        .set({ status: 'removed', updatedAt: new Date() })
        .where(
          and(
            inArray(enrollments.studentId, studentIds),
            eq(enrollments.status, 'active'),
          ),
        );

      for (const studentId of studentIds) {
        await tx
          .insert(enrollments)
          .values({
            tenantId: ctx.tenantId as string,
            classId: destinationClassId,
            studentId,
          })
          .onConflictDoUpdate({
            target: [
              enrollments.tenantId,
              enrollments.classId,
              enrollments.studentId,
            ],
            set: { status: 'active', updatedAt: new Date() },
          });
      }

      return { destinationClassId, movedStudentIds: studentIds };
    });
  }

  /**
   * Enrolls into a class under the capacity lock WITHOUT throwing on a full
   * class — returns false instead (responsável story 34: a full grid delays
   * enrollment, not the registration). Caller owns the transaction.
   */
  async tryEnrollInTx(
    tx: DbTransaction,
    tenantId: string,
    classId: string,
    studentId: string,
  ): Promise<boolean> {
    const rows = await tx
      .select()
      .from(classes)
      .where(eq(classes.id, classId))
      .for('update');
    const target = rows[0];
    if (!target || target.status !== 'active') return false;
    const occupancy = await this.activeCount(tx, classId);
    if (occupancy >= target.capacity) return false;
    await tx
      .insert(enrollments)
      .values({ tenantId, classId, studentId })
      .onConflictDoUpdate({
        target: [
          enrollments.tenantId,
          enrollments.classId,
          enrollments.studentId,
        ],
        set: { status: 'active', updatedAt: new Date() },
      });
    return true;
  }

  /**
   * Locks the class row (the capacity serialization point). Ownership scope
   * turns a foreign class into a 404 — never a 403, no existence leak.
   */
  private async lockClass(
    tx: DbTransaction,
    classId: string,
    scope: RosterScope,
    options: { allowArchived?: boolean } = {},
  ): Promise<typeof classes.$inferSelect> {
    const rows = await tx
      .select()
      .from(classes)
      .where(eq(classes.id, classId))
      .for('update');
    const target = rows[0];
    if (!target) throw problem(404, ErrorCodes.NOT_FOUND, 'Class not found');
    if (
      scope.professorUserId &&
      target.professorUserId !== scope.professorUserId
    ) {
      throw problem(404, ErrorCodes.NOT_FOUND, 'Class not found');
    }
    if (!options.allowArchived && target.status !== 'active') {
      throw problem(409, ErrorCodes.CLASS_ARCHIVED, 'Class is archived');
    }
    return target;
  }

  private async activeCount(
    tx: DbTransaction,
    classId: string,
  ): Promise<number> {
    const [row] = await tx
      .select({ total: count() })
      .from(enrollments)
      .where(
        and(eq(enrollments.classId, classId), eq(enrollments.status, 'active')),
      );
    return Number(row?.total ?? 0);
  }
}
