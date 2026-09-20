import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import {
  studentNotes,
  students,
  users,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import type { StudentNoteView } from '../graduation.types.js';

const tenantCtx = (ctx: AuthContext) => ({
  tenantId: ctx.tenantId,
  userId: ctx.userId,
});

/**
 * Persistent staff observações (GRD.10, stories 18-19): create + list only in
 * v1, newest first, shared by professors and the admin — never exposed on any
 * aluno/responsável surface (enforced by the controllers that exist).
 */
@Injectable()
export class StudentNotesService {
  constructor(@Inject(APP_DB) private readonly appDb: DbHandle) {}

  async list(
    ctx: AuthContext & { tenantId: string },
    studentId: string,
  ): Promise<StudentNoteView[]> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      await this.requireStudent(tx, studentId);
      return this.listInTx(tx, studentId);
    });
  }

  async create(
    ctx: AuthContext & { tenantId: string },
    studentId: string,
    body: string,
  ): Promise<StudentNoteView> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      await this.requireStudent(tx, studentId);
      const [row] = await tx
        .insert(studentNotes)
        .values({
          tenantId: ctx.tenantId,
          studentId,
          authorUserId: ctx.userId,
          body,
        })
        .returning();
      if (!row)
        throw problem(500, ErrorCodes.INTERNAL, 'Note insert returned no row');
      const [author] = await tx
        .select({ fullName: users.fullName })
        .from(users)
        .where(eq(users.id, ctx.userId));
      return {
        id: row.id,
        body: row.body,
        createdAt: row.createdAt,
        author: { userId: ctx.userId, fullName: author?.fullName ?? '' },
      };
    });
  }

  /** Newest-first note history with author — reused by the student profile. */
  async listInTx(
    tx: DbTransaction,
    studentId: string,
  ): Promise<StudentNoteView[]> {
    const rows = await tx
      .select({
        id: studentNotes.id,
        body: studentNotes.body,
        createdAt: studentNotes.createdAt,
        authorUserId: studentNotes.authorUserId,
        authorName: users.fullName,
      })
      .from(studentNotes)
      .innerJoin(users, eq(users.id, studentNotes.authorUserId))
      .where(eq(studentNotes.studentId, studentId))
      .orderBy(desc(studentNotes.createdAt), desc(studentNotes.id));
    return rows.map((row) => ({
      id: row.id,
      body: row.body,
      createdAt: row.createdAt,
      author: { userId: row.authorUserId, fullName: row.authorName },
    }));
  }

  private async requireStudent(
    tx: DbTransaction,
    studentId: string,
  ): Promise<void> {
    const [student] = await tx
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.id, studentId)));
    if (!student) throw problem(404, ErrorCodes.NOT_FOUND, 'Student not found');
  }
}
