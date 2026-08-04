import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, desc, eq, isNull, notExists, sql } from 'drizzle-orm';
import {
  attendances,
  classSessions,
  enrollments,
  students,
  withTenant,
  type DbHandle,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { badgeFor } from '../../enrollment/lib/derive.js';
import { SessionService } from './session.service.js';

export interface AdminSessionRow {
  id: string;
  sessionDate: string;
  startsAt: Date | null;
  status: 'scheduled' | 'done' | 'canceled';
  presentCount: number;
}

export interface ProfessorStudentRow {
  id: string;
  fullName: string;
  birthDate: string;
  badge: 'ativo' | 'pendente';
}

const tenantCtx = (ctx: AuthContext) => ({ tenantId: ctx.tenantId, userId: ctx.userId });

/**
 * Read-side listings of the attendance slice: the admin turma session list
 * with counts (ATT.9, feeds web ATT.14) and the professor students listing
 * with the not-enrolled filter (ATT.12 — closes the "Adicionar aluno" picker
 * debt, story 37).
 */
@Injectable()
export class DirectoryService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly sessions: SessionService,
  ) {}

  /** GET /admin/classes/:id/sessions — newest first, active counts only. */
  async adminClassSessions(
    ctx: AuthContext & { tenantId: string },
    classId: string,
  ): Promise<AdminSessionRow[]> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const klass = await this.sessions.ownedClass(tx, classId);
      if (!klass) throw problem(404, ErrorCodes.NOT_FOUND, 'Class not found');

      const rows = await tx
        .select({
          id: classSessions.id,
          sessionDate: classSessions.sessionDate,
          startsAt: classSessions.startsAt,
          status: classSessions.status,
          presentCount: count(attendances.id),
        })
        .from(classSessions)
        .leftJoin(
          attendances,
          and(
            eq(attendances.tenantId, classSessions.tenantId),
            eq(attendances.classSessionId, classSessions.id),
            isNull(attendances.revokedAt),
          ),
        )
        .where(eq(classSessions.classId, classId))
        .groupBy(classSessions.id, classSessions.sessionDate, classSessions.startsAt, classSessions.status)
        .orderBy(desc(classSessions.sessionDate), desc(classSessions.startsAt));
      return rows.map((row) => ({ ...row, presentCount: Number(row.presentCount) }));
    });
  }

  /** GET /professor/students[?notEnrolledInClassId=] — own-class filter is a 404 gate. */
  async professorStudents(
    ctx: AuthContext & { tenantId: string },
    notEnrolledInClassId?: string,
  ): Promise<ProfessorStudentRow[]> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const conditions = [eq(students.status, 'active')];
      if (notEnrolledInClassId) {
        // The filter names one of the professor's own classes — anything else
        // (foreign professor's turma, other tenant, nonsense id) is a 404.
        const klass = await this.sessions.ownedClass(tx, notEnrolledInClassId, ctx.userId);
        if (!klass) throw problem(404, ErrorCodes.NOT_FOUND, 'Class not found');
        conditions.push(
          notExists(
            tx
              .select({ one: sql`1` })
              .from(enrollments)
              .where(
                and(
                  eq(enrollments.tenantId, students.tenantId),
                  eq(enrollments.studentId, students.id),
                  eq(enrollments.classId, notEnrolledInClassId),
                  eq(enrollments.status, 'active'),
                ),
              ),
          ),
        );
      }
      const rows = await tx
        .select({
          id: students.id,
          fullName: students.fullName,
          birthDate: students.birthDate,
          userId: students.userId,
        })
        .from(students)
        .where(and(...conditions))
        .orderBy(asc(students.fullName));
      return rows.map((row) => ({
        id: row.id,
        fullName: row.fullName,
        birthDate: row.birthDate,
        badge: badgeFor(row.userId),
      }));
    });
  }
}
