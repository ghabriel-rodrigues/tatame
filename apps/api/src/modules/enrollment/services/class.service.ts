import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray } from 'drizzle-orm';
import {
  classSchedules,
  classes,
  enrollments,
  memberships,
  students,
  users,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { ageOn, badgeFor, normalizeTime, type ScheduleSlotView } from '../lib/derive.js';

export interface ClassListItem {
  id: string;
  name: string;
  status: 'active' | 'archived';
  capacity: number;
  occupancy: number;
  lotada: boolean;
  ageMin: number | null;
  ageMax: number | null;
  professor: { userId: string; fullName: string };
  schedules: ScheduleSlotView[];
}

export interface ClassDetail extends ClassListItem {
  roster: Array<{
    studentId: string;
    fullName: string;
    birthDate: string;
    badge: 'ativo' | 'pendente';
  }>;
}

export interface ClassSuggestion {
  id: string;
  name: string;
  ageMin: number | null;
  ageMax: number | null;
  capacity: number;
  occupancy: number;
  schedules: ScheduleSlotView[];
}

export interface CreateClassInput {
  name: string;
  professorUserId: string;
  capacity: number;
  ageMin?: number;
  ageMax?: number;
  schedules: ScheduleSlotView[];
}

/** Ownership filter for the professor surface: a foreign class is a 404. */
export interface ClassScope {
  professorUserId?: string;
}

const tenantCtx = (ctx: AuthContext) => ({ tenantId: ctx.tenantId, userId: ctx.userId });

/**
 * Turmas (ENR.8): recurring weekly classes. Creating with N weekday chips
 * inserts N schedule rows in one transaction; occupancy and "Lotada" are
 * derived server-side and returned by every list/detail endpoint — clients
 * never compute them. Also owns the age-suggestion rule (ENR.11).
 */
@Injectable()
export class ClassService {
  constructor(@Inject(APP_DB) private readonly appDb: DbHandle) {}

  async create(ctx: AuthContext, input: CreateClassInput): Promise<ClassDetail> {
    if (input.ageMin != null && input.ageMax != null && input.ageMin > input.ageMax) {
      throw problem(422, ErrorCodes.VALIDATION_FAILED, 'ageMin cannot exceed ageMax', [
        { field: 'ageMin', messages: ['ageMin cannot exceed ageMax'] },
      ]);
    }
    const seen = new Set<string>();
    for (const slot of input.schedules) {
      const key = `${slot.weekday}@${slot.startTime}`;
      if (seen.has(key)) {
        throw problem(422, ErrorCodes.VALIDATION_FAILED, 'Duplicate schedule slot', [
          { field: 'schedules', messages: [`Duplicate slot ${key}`] },
        ]);
      }
      seen.add(key);
    }

    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const professor = await tx
        .select({ id: memberships.id })
        .from(memberships)
        .where(
          and(
            eq(memberships.userId, input.professorUserId),
            eq(memberships.role, 'professor'),
            eq(memberships.status, 'active'),
          ),
        );
      if (!professor[0]) {
        throw problem(422, ErrorCodes.VALIDATION_FAILED, 'Professor membership not found', [
          {
            field: 'professorUserId',
            messages: ['Must hold an active professor membership in this academy'],
          },
        ]);
      }

      const [row] = await tx
        .insert(classes)
        .values({
          tenantId: ctx.tenantId as string,
          name: input.name,
          professorUserId: input.professorUserId,
          capacity: input.capacity,
          ageMin: input.ageMin ?? null,
          ageMax: input.ageMax ?? null,
        })
        .returning();
      if (!row) throw problem(500, ErrorCodes.INTERNAL, 'Class insert returned no row');

      // Weekday chips → schedule rows, same transaction (story 13).
      await tx.insert(classSchedules).values(
        input.schedules.map((slot) => ({
          tenantId: ctx.tenantId as string,
          classId: row.id,
          weekday: slot.weekday,
          startTime: slot.startTime,
          durationMinutes: slot.durationMinutes,
        })),
      );

      return (await this.assembleDetail(tx, row.id)) as ClassDetail;
    });
  }

  async list(
    ctx: AuthContext,
    filter: 'active' | 'inactive' | 'all' = 'active',
    scope: ClassScope = {},
  ): Promise<ClassListItem[]> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const conditions = [];
      if (filter !== 'all') {
        conditions.push(eq(classes.status, filter === 'active' ? 'active' : 'archived'));
      }
      if (scope.professorUserId) {
        conditions.push(eq(classes.professorUserId, scope.professorUserId));
      }
      const rows = await tx
        .select()
        .from(classes)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(classes.name));
      if (rows.length === 0) return [];

      const ids = rows.map((r) => r.id);
      const [scheduleMap, occupancyMap, professorMap] = await Promise.all([
        this.schedulesByClass(tx, ids),
        this.occupancyByClass(tx, ids),
        this.professorsByUserId(tx, [...new Set(rows.map((r) => r.professorUserId))]),
      ]);
      return rows.map((row) =>
        this.toListItem(row, scheduleMap, occupancyMap, professorMap),
      );
    });
  }

  /** Detail + roster; `scope.professorUserId` turns a foreign class into a 404. */
  async detail(ctx: AuthContext, id: string, scope: ClassScope = {}): Promise<ClassDetail> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const detail = await this.assembleDetail(tx, id, scope);
      if (!detail) throw problem(404, ErrorCodes.NOT_FOUND, 'Class not found');
      return detail;
    });
  }

  async updateName(ctx: AuthContext, id: string, name: string): Promise<ClassDetail> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const [row] = await tx
        .update(classes)
        .set({ name, updatedAt: new Date() })
        .where(eq(classes.id, id))
        .returning({ id: classes.id });
      if (!row) throw problem(404, ErrorCodes.NOT_FOUND, 'Class not found');
      return (await this.assembleDetail(tx, id)) as ClassDetail;
    });
  }

  /**
   * "Excluir" = soft archive: flips to archived AND ends its active
   * enrollments in the same transaction (story 19); hidden from active
   * listings, history survives.
   */
  async archive(ctx: AuthContext, id: string): Promise<void> {
    await withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const [row] = await tx
        .update(classes)
        .set({ status: 'archived', updatedAt: new Date() })
        .where(eq(classes.id, id))
        .returning({ id: classes.id });
      if (!row) throw problem(404, ErrorCodes.NOT_FOUND, 'Class not found');
      await tx
        .update(enrollments)
        .set({ status: 'removed', updatedAt: new Date() })
        .where(and(eq(enrollments.classId, id), eq(enrollments.status, 'active')));
    });
  }

  /**
   * Age-suggestion rule (spec 003): the active class whose age range contains
   * the child's age with at least one free slot, tie-broken by lowest
   * occupancy then name. No age-ranged match ⇒ null (registration proceeds
   * without enrollment).
   */
  async suggest(ctx: AuthContext, birthDate: string): Promise<ClassSuggestion | null> {
    const age = ageOn(birthDate);
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const rows = await tx
        .select()
        .from(classes)
        .where(eq(classes.status, 'active'))
        .orderBy(asc(classes.name));
      const ranged = rows.filter(
        (row) =>
          (row.ageMin != null || row.ageMax != null) &&
          (row.ageMin == null || age >= row.ageMin) &&
          (row.ageMax == null || age <= row.ageMax),
      );
      if (ranged.length === 0) return null;

      const ids = ranged.map((r) => r.id);
      const [occupancyMap, scheduleMap] = await Promise.all([
        this.occupancyByClass(tx, ids),
        this.schedulesByClass(tx, ids),
      ]);
      const open = ranged
        .filter((row) => (occupancyMap.get(row.id) ?? 0) < row.capacity)
        .sort((a, b) => {
          const delta = (occupancyMap.get(a.id) ?? 0) - (occupancyMap.get(b.id) ?? 0);
          return delta !== 0 ? delta : a.name.localeCompare(b.name);
        });
      const best = open[0];
      if (!best) return null;
      return {
        id: best.id,
        name: best.name,
        ageMin: best.ageMin,
        ageMax: best.ageMax,
        capacity: best.capacity,
        occupancy: occupancyMap.get(best.id) ?? 0,
        schedules: scheduleMap.get(best.id) ?? [],
      };
    });
  }

  private async assembleDetail(
    tx: DbTransaction,
    id: string,
    scope: ClassScope = {},
  ): Promise<ClassDetail | null> {
    const rows = await tx.select().from(classes).where(eq(classes.id, id));
    const row = rows[0];
    if (!row) return null;
    // Ownership is service-level filtering: foreign class = 404, never 403.
    if (scope.professorUserId && row.professorUserId !== scope.professorUserId) return null;

    const [scheduleMap, occupancyMap, professorMap, roster] = await Promise.all([
      this.schedulesByClass(tx, [id]),
      this.occupancyByClass(tx, [id]),
      this.professorsByUserId(tx, [row.professorUserId]),
      this.rosterOf(tx, id),
    ]);
    return { ...this.toListItem(row, scheduleMap, occupancyMap, professorMap), roster };
  }

  private toListItem(
    row: typeof classes.$inferSelect,
    scheduleMap: Map<string, ScheduleSlotView[]>,
    occupancyMap: Map<string, number>,
    professorMap: Map<string, string>,
  ): ClassListItem {
    const occupancy = occupancyMap.get(row.id) ?? 0;
    return {
      id: row.id,
      name: row.name,
      status: row.status,
      capacity: row.capacity,
      occupancy,
      lotada: occupancy >= row.capacity,
      ageMin: row.ageMin,
      ageMax: row.ageMax,
      professor: {
        userId: row.professorUserId,
        fullName: professorMap.get(row.professorUserId) ?? '',
      },
      schedules: scheduleMap.get(row.id) ?? [],
    };
  }

  private async schedulesByClass(
    tx: DbTransaction,
    classIds: string[],
  ): Promise<Map<string, ScheduleSlotView[]>> {
    const map = new Map<string, ScheduleSlotView[]>();
    if (classIds.length === 0) return map;
    const rows = await tx
      .select()
      .from(classSchedules)
      .where(inArray(classSchedules.classId, classIds))
      .orderBy(asc(classSchedules.weekday), asc(classSchedules.startTime));
    for (const row of rows) {
      const list = map.get(row.classId) ?? [];
      list.push({
        weekday: row.weekday,
        startTime: normalizeTime(row.startTime),
        durationMinutes: row.durationMinutes,
      });
      map.set(row.classId, list);
    }
    return map;
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
      .where(and(inArray(enrollments.classId, classIds), eq(enrollments.status, 'active')))
      .groupBy(enrollments.classId);
    for (const row of rows) map.set(row.classId, Number(row.total));
    return map;
  }

  private async professorsByUserId(
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

  private async rosterOf(tx: DbTransaction, classId: string): Promise<ClassDetail['roster']> {
    const rows = await tx
      .select({
        studentId: students.id,
        fullName: students.fullName,
        birthDate: students.birthDate,
        userId: students.userId,
      })
      .from(enrollments)
      .innerJoin(
        students,
        and(eq(students.tenantId, enrollments.tenantId), eq(students.id, enrollments.studentId)),
      )
      .where(and(eq(enrollments.classId, classId), eq(enrollments.status, 'active')))
      .orderBy(asc(students.fullName));
    return rows.map((row) => ({
      studentId: row.studentId,
      fullName: row.fullName,
      birthDate: row.birthDate,
      badge: badgeFor(row.userId),
    }));
  }
}
