import { Injectable } from '@nestjs/common';
import { and, count, eq, gt, isNull } from 'drizzle-orm';
import { attendances, type DbTransaction } from '@tatame/db';
import type { BeltView, ProgressView } from '../graduation.types.js';
import { GraduationRulesService } from './graduation-rules.service.js';

/**
 * Progress engine (GRD.7) — the Phase-4 lesson-counting pattern with a new
 * anchor: active attendances (`revoked_at IS NULL`) checked in AFTER the
 * latest non-reversed award (lifetime count when no award exists), measured
 * against the academy's `lessons_per_degree` for the CURRENT belt. Derived on
 * read, no caching, no jobs — a rules change re-aims every bar immediately
 * (story 27).
 */
@Injectable()
export class GraduationProgressService {
  constructor(private readonly rules: GraduationRulesService) {}

  async progressFor(
    tx: DbTransaction,
    studentId: string,
    state: { belt: BeltView; anchor: Date | null },
  ): Promise<ProgressView> {
    const conditions = [eq(attendances.studentId, studentId), isNull(attendances.revokedAt)];
    if (state.anchor) conditions.push(gt(attendances.checkedInAt, state.anchor));
    const [row] = await tx
      .select({ total: count() })
      .from(attendances)
      .where(and(...conditions));
    const current = Number(row?.total ?? 0);

    const rule = await this.rules.ruleFor(tx, state.belt.beltId);
    const atMax = state.belt.degrees >= state.belt.maxDegrees;
    const nextDegree = atMax ? null : state.belt.degrees + 1;
    return {
      current,
      target: rule.lessonsPerDegree,
      // "Próximo Nº grau" below max degrees, "Próxima faixa" at max (the bar
      // never dead-ends — story 3). PT-BR label is a convenience; clients may
      // also branch on `nextMilestone`.
      label: nextDegree === null ? 'Próxima faixa' : `Próximo ${nextDegree}º grau`,
      nextMilestone: { kind: nextDegree === null ? 'belt' : 'degree', degree: nextDegree },
    };
  }
}
