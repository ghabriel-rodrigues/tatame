import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  belts,
  memberships,
  students,
  users,
  withTenant,
  type DbHandle,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { badgeFor } from '../../enrollment/lib/derive.js';
import { StatsService, type AlunoStats } from '../../attendance/services/stats.service.js';
import type {
  BeltView,
  GraduationEntry,
  GraduationRuleRow,
  ProgressView,
  StudentNoteView,
} from '../graduation.types.js';
import { GraduationProgressService } from './graduation-progress.service.js';
import { GraduationQueryService } from './graduation-query.service.js';
import { GraduationRulesService } from './graduation-rules.service.js';
import { StudentNotesService } from './student-notes.service.js';

export interface AlunoGraduationView {
  belt: BeltView;
  progress: ProgressView;
  timeline: GraduationEntry[];
}

export interface StudentProfileView {
  student: {
    id: string;
    fullName: string;
    birthDate: string;
    status: 'active' | 'inactive';
    badge: 'ativo' | 'pendente';
  };
  belt: BeltView;
  progress: ProgressView;
  /** Phase-4 attendance stat tiles (frequência %, aulas no mês, total). */
  stats: AlunoStats;
  notes: StudentNoteView[];
}

export interface ProfessorProfileView {
  professor: { userId: string; fullName: string };
  /** Display-only membership rank ("Faixa preta · 2º dan") — null when unset. */
  belt: BeltView | null;
  /** Graduações válidas: the merged admin-defined régua (disabled = dimmed). */
  validGraduations: Array<
    Pick<
      GraduationRuleRow,
      'beltId' | 'name' | 'colorSlug' | 'tipColorSlug' | 'maxDegrees' | 'ladderKind' | 'enabled'
    >
  >;
}

const tenantCtx = (ctx: AuthContext) => ({ tenantId: ctx.tenantId, userId: ctx.userId });

/**
 * Read-side screen assemblies (GRD.7/GRD.10): the aluno Graduação screen, the
 * professor perfil do aluno (professor-11 — belt, progress, Phase-4 stat
 * tiles, observações) and the professor's own profile (professor-12 — belt
 * chip + Graduações válidas).
 */
@Injectable()
export class GraduationProfileService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly query: GraduationQueryService,
    private readonly progress: GraduationProgressService,
    private readonly rules: GraduationRulesService,
    private readonly notes: StudentNotesService,
    private readonly stats: StatsService,
  ) {}

  /** GET /aluno/graduation — hero, progress bar, evolution timeline. */
  async alunoGraduation(ctx: AuthContext & { tenantId: string }): Promise<AlunoGraduationView> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const [student] = await tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.userId, ctx.userId), eq(students.status, 'active')));
      if (!student) {
        throw problem(404, ErrorCodes.NOT_FOUND, 'No active student record for this account');
      }
      const state = await this.query.currentState(tx, student.id);
      return {
        belt: state.belt,
        progress: await this.progress.progressFor(tx, student.id, state),
        timeline: await this.query.timeline(tx, student.id),
      };
    });
  }

  /**
   * GET /professor/students/:id/profile — any student of the academy, not
   * only the caller's rosters (grading-day reality, story 17). Also the admin
   * drawer's data source.
   */
  async studentProfile(
    ctx: AuthContext & { tenantId: string },
    studentId: string,
  ): Promise<StudentProfileView> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const [student] = await tx
        .select({
          id: students.id,
          fullName: students.fullName,
          birthDate: students.birthDate,
          status: students.status,
          userId: students.userId,
        })
        .from(students)
        .where(eq(students.id, studentId));
      if (!student) throw problem(404, ErrorCodes.NOT_FOUND, 'Student not found');

      const state = await this.query.currentState(tx, student.id);
      return {
        student: {
          id: student.id,
          fullName: student.fullName,
          birthDate: student.birthDate,
          status: student.status,
          badge: badgeFor(student.userId),
        },
        belt: state.belt,
        progress: await this.progress.progressFor(tx, student.id, state),
        stats: await this.stats.alunoStats(tx, ctx.tenantId, student.id),
        notes: await this.notes.listInTx(tx, student.id),
      };
    });
  }

  /** GET /professor/profile — own belt chip + Graduações válidas card. */
  async professorProfile(ctx: AuthContext & { tenantId: string }): Promise<ProfessorProfileView> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const [row] = await tx
        .select({
          userId: memberships.userId,
          fullName: users.fullName,
          beltId: memberships.beltId,
          beltDegree: memberships.beltDegree,
          beltName: belts.name,
          colorSlug: belts.colorSlug,
          tipColorSlug: belts.tipColorSlug,
          maxDegrees: belts.maxDegrees,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .leftJoin(belts, eq(belts.id, memberships.beltId))
        .where(
          and(
            eq(memberships.userId, ctx.userId),
            eq(memberships.role, 'professor'),
            eq(memberships.status, 'active'),
          ),
        );
      if (!row) throw problem(404, ErrorCodes.NOT_FOUND, 'Professor membership not found');

      const belt: BeltView | null =
        row.beltId && row.beltName && row.colorSlug
          ? {
              beltId: row.beltId,
              name: row.beltName,
              colorSlug: row.colorSlug,
              tipColorSlug: row.tipColorSlug,
              degrees: row.beltDegree ?? 0,
              maxDegrees: row.maxDegrees ?? 0,
            }
          : null;

      const merged = await this.rules.mergedRulesInTx(tx);
      return {
        professor: { userId: row.userId, fullName: row.fullName },
        belt,
        validGraduations: merged.map((r) => ({
          beltId: r.beltId,
          name: r.name,
          colorSlug: r.colorSlug,
          tipColorSlug: r.tipColorSlug,
          maxDegrees: r.maxDegrees,
          ladderKind: r.ladderKind,
          enabled: r.enabled,
        })),
      };
    });
  }
}
