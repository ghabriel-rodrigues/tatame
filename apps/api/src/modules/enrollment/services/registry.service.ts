import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import {
  classes,
  enrollments,
  guardians,
  students,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { GraduationAwardService } from '../../graduation/services/graduation-award.service.js';
import { GraduationQueryService } from '../../graduation/services/graduation-query.service.js';
import type { BeltView } from '../../graduation/graduation.types.js';
import { assertAssignablePlan } from '../../billing/lib/plan-validation.js';
import { badgeFor, isMinor } from '../lib/derive.js';

export interface StudentListItem {
  id: string;
  fullName: string;
  birthDate: string;
  status: 'active' | 'inactive';
  badge: 'ativo' | 'pendente';
  guardianId: string | null;
  userId: string | null;
  classes: Array<{ id: string; name: string }>;
  /** Derived current belt (GRD.6) — the Phase-3 belt-chip deferral closed. */
  belt: BeltView;
  /** Assigned mensalidade plan (spec 006) — what materialization charges. */
  academyPlanId: string | null;
}

export interface GuardianListItem {
  id: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  badge: 'ativo' | 'pendente';
  userId: string | null;
  dependentCount: number;
}

export type StatusFilter = 'active' | 'inactive' | 'all';

const tenantCtx = (ctx: AuthContext) => ({ tenantId: ctx.tenantId, userId: ctx.userId });

/**
 * Admin registry for the people side of the triangle (ENR.6): students and
 * guardians as records without logins — granting app access remains
 * exclusively the invite flow. All queries run under the RLS tenant context.
 */
@Injectable()
export class RegistryService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly graduationQuery: GraduationQueryService,
    private readonly graduationAwards: GraduationAwardService,
  ) {}

  async listStudents(ctx: AuthContext, filter: StatusFilter = 'active'): Promise<StudentListItem[]> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(students)
        .where(filter === 'all' ? undefined : eq(students.status, filter))
        .orderBy(asc(students.fullName));
      if (rows.length === 0) return [];
      const ids = rows.map((r) => r.id);
      const [classesByStudent, beltByStudent] = await Promise.all([
        this.activeClassesByStudent(tx, ids),
        this.graduationQuery.currentBeltMap(tx, ids),
      ]);
      return rows.map((row) =>
        this.toStudentItem(row, classesByStudent.get(row.id) ?? [], beltByStudent.get(row.id)),
      );
    });
  }

  async createStudent(
    ctx: AuthContext,
    input: {
      fullName: string;
      birthDate: string;
      guardianId?: string;
      initialBeltId?: string;
      academyPlanId?: string;
    },
  ): Promise<StudentListItem> {
    // Minor ⇒ guardian rule, enforced in every creation path (age is
    // time-dependent, so this stays app-level — spec 003 schema decision).
    if (isMinor(input.birthDate) && !input.guardianId) {
      throw problem(
        422,
        ErrorCodes.INVITE_MINOR_REQUIRES_GUARDIAN,
        'Minor students must be linked to a guardian',
      );
    }
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      if (input.guardianId) {
        const guardian = await tx
          .select({ id: guardians.id })
          .from(guardians)
          .where(eq(guardians.id, input.guardianId));
        if (!guardian[0]) {
          throw problem(404, ErrorCodes.NOT_FOUND, 'Guardian not found in this academy');
        }
      }
      // Plan assignment validation (spec 006, BIL.10): clean 404/409 instead
      // of the composite-FK 500 the Phase-3 stub allowed.
      if (input.academyPlanId) await assertAssignablePlan(tx, input.academyPlanId);
      const [row] = await tx
        .insert(students)
        .values({
          tenantId: ctx.tenantId as string,
          fullName: input.fullName,
          birthDate: input.birthDate,
          guardianId: input.guardianId ?? null,
          academyPlanId: input.academyPlanId ?? null,
        })
        .returning();
      if (!row) throw problem(500, ErrorCodes.INTERNAL, 'Student insert returned no row');
      // Optional initial belt (story 32): a transfer student starts at their
      // real belt via one audited kind='belt' award row — left empty, they
      // start white with no synthetic row.
      if (input.initialBeltId) {
        await this.graduationAwards.seedInitialBeltInTx(
          tx,
          ctx as AuthContext & { tenantId: string },
          row.id,
          input.initialBeltId,
        );
      }
      const belt = await this.graduationQuery.currentBelt(tx, row.id);
      return this.toStudentItem(row, [], belt);
    });
  }

  async updateStudent(
    ctx: AuthContext,
    id: string,
    input: { fullName?: string; academyPlanId?: string | null },
  ): Promise<StudentListItem> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      // Archived plans refuse NEW assignment; null unassigns (spec 006).
      if (input.academyPlanId) await assertAssignablePlan(tx, input.academyPlanId);
      const [row] = await tx
        .update(students)
        .set({
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.academyPlanId !== undefined ? { academyPlanId: input.academyPlanId } : {}),
          updatedAt: new Date(),
        })
        .where(eq(students.id, id))
        .returning();
      if (!row) throw problem(404, ErrorCodes.NOT_FOUND, 'Student not found');
      const [classesByStudent, belt] = await Promise.all([
        this.activeClassesByStudent(tx, [row.id]),
        this.graduationQuery.currentBelt(tx, row.id),
      ]);
      return this.toStudentItem(row, classesByStudent.get(row.id) ?? [], belt);
    });
  }

  /**
   * "Excluir" = soft archive: flips to inactive AND ends the student's active
   * enrollments in the same transaction (story 6). No hard deletes anywhere.
   */
  async archiveStudent(ctx: AuthContext, id: string): Promise<void> {
    await withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const [row] = await tx
        .update(students)
        .set({ status: 'inactive', updatedAt: new Date() })
        .where(eq(students.id, id))
        .returning({ id: students.id });
      if (!row) throw problem(404, ErrorCodes.NOT_FOUND, 'Student not found');
      await tx
        .update(enrollments)
        .set({ status: 'removed', updatedAt: new Date() })
        .where(and(eq(enrollments.studentId, id), eq(enrollments.status, 'active')));
    });
  }

  async listGuardians(ctx: AuthContext): Promise<GuardianListItem[]> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const rows = await tx
        .select({
          id: guardians.id,
          fullName: guardians.fullName,
          phone: guardians.phone,
          email: guardians.email,
          userId: guardians.userId,
          dependentCount: count(students.id),
        })
        .from(guardians)
        .leftJoin(
          students,
          and(eq(students.guardianId, guardians.id), eq(students.status, 'active')),
        )
        .groupBy(guardians.id, guardians.fullName, guardians.phone, guardians.email, guardians.userId)
        .orderBy(asc(guardians.fullName));
      return rows.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        phone: row.phone,
        email: row.email,
        badge: badgeFor(row.userId),
        userId: row.userId,
        dependentCount: Number(row.dependentCount),
      }));
    });
  }

  async createGuardian(
    ctx: AuthContext,
    input: { fullName: string; phone?: string; email?: string },
  ): Promise<GuardianListItem> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const [row] = await tx
        .insert(guardians)
        .values({
          tenantId: ctx.tenantId as string,
          fullName: input.fullName,
          phone: input.phone ?? null,
          email: input.email?.toLowerCase() ?? null,
        })
        .returning();
      if (!row) throw problem(500, ErrorCodes.INTERNAL, 'Guardian insert returned no row');
      return {
        id: row.id,
        fullName: row.fullName,
        phone: row.phone,
        email: row.email,
        badge: badgeFor(row.userId),
        userId: row.userId,
        dependentCount: 0,
      };
    });
  }

  async updateGuardianName(ctx: AuthContext, id: string, fullName: string): Promise<GuardianListItem> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const [row] = await tx
        .update(guardians)
        .set({ fullName, updatedAt: new Date() })
        .where(eq(guardians.id, id))
        .returning();
      if (!row) throw problem(404, ErrorCodes.NOT_FOUND, 'Guardian not found');
      const [dependents] = await tx
        .select({ total: count(students.id) })
        .from(students)
        .where(and(eq(students.guardianId, id), eq(students.status, 'active')));
      return {
        id: row.id,
        fullName: row.fullName,
        phone: row.phone,
        email: row.email,
        badge: badgeFor(row.userId),
        userId: row.userId,
        dependentCount: Number(dependents?.total ?? 0),
      };
    });
  }

  private async activeClassesByStudent(
    tx: DbTransaction,
    studentIds: string[],
  ): Promise<Map<string, Array<{ id: string; name: string }>>> {
    const map = new Map<string, Array<{ id: string; name: string }>>();
    if (studentIds.length === 0) return map;
    const rows = await tx
      .select({ studentId: enrollments.studentId, classId: classes.id, className: classes.name })
      .from(enrollments)
      .innerJoin(
        classes,
        and(eq(classes.tenantId, enrollments.tenantId), eq(classes.id, enrollments.classId)),
      )
      .where(and(inArray(enrollments.studentId, studentIds), eq(enrollments.status, 'active')));
    for (const row of rows) {
      const list = map.get(row.studentId) ?? [];
      list.push({ id: row.classId, name: row.className });
      map.set(row.studentId, list);
    }
    return map;
  }

  private toStudentItem(
    row: typeof students.$inferSelect,
    classList: Array<{ id: string; name: string }>,
    belt: BeltView | undefined,
  ): StudentListItem {
    if (!belt) throw problem(500, ErrorCodes.INTERNAL, 'Belt derivation returned no entry');
    return {
      id: row.id,
      fullName: row.fullName,
      birthDate: row.birthDate,
      status: row.status,
      badge: badgeFor(row.userId),
      guardianId: row.guardianId,
      userId: row.userId,
      classes: classList,
      belt,
      academyPlanId: row.academyPlanId,
    };
  }
}
