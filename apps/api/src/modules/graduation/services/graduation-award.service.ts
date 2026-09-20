import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, eq, sql } from 'drizzle-orm';
import {
  studentGraduations,
  students,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import {
  GRADUATION_AWARDED,
  type GraduationAwardedEvent,
} from '../graduation.events.js';
import type { BeltView, GraduationEntry } from '../graduation.types.js';
import { GraduationQueryService } from './graduation-query.service.js';
import { GraduationRulesService } from './graduation-rules.service.js';

export interface AwardInput {
  kind: 'degree' | 'belt';
  /** Target belt — required for `kind='belt'`, ignored for degrees. */
  beltId?: string;
  notes?: string;
}

export interface AwardResult {
  graduation: GraduationEntry;
  /** Freshly derived current belt after the award. */
  belt: BeltView;
}

export interface RevokeResult {
  status: 'revoked';
  graduationId: string;
  revocationId: string;
  /** Freshly derived current belt after the reversal — the restored state. */
  belt: BeltView;
}

/** Notes text seeded on the optional initial-belt row (spec 005, resolved). */
const INITIAL_BELT_NOTES = 'Início da jornada';

const tenantCtx = (ctx: AuthContext) => ({
  tenantId: ctx.tenantId,
  userId: ctx.userId,
});

/**
 * The one award/revocation write path (GRD.8/GRD.9) shared by the professor
 * and admin endpoints — append-only INSERTs, every mutation audited
 * in-transaction through the `audit_append` seam (`graduation.awarded` /
 * `graduation.revoked`), impersonators carried on the row.
 */
@Injectable()
export class GraduationAwardService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly query: GraduationQueryService,
    private readonly rules: GraduationRulesService,
    private readonly emitter: EventEmitter2,
  ) {}

  /**
   * Add degree / promote belt (stories 10-14, 28). Degrees: `current + 1` on
   * the current belt, rejected at the belt's max. Belt: any ENABLED,
   * non-current catalog belt (transfers and skips are legitimate — revocation
   * is the correction path), degrees reset via the new row's `degree = 0`.
   */
  async award(
    ctx: AuthContext & { tenantId: string },
    studentId: string,
    input: AwardInput,
  ): Promise<AwardResult> {
    let awarded: GraduationAwardedEvent | null = null;
    const result = await withTenant(
      this.appDb.db,
      tenantCtx(ctx),
      async (tx) => {
        const [student] = await tx
          .select({
            id: students.id,
            fullName: students.fullName,
            guardianId: students.guardianId,
          })
          .from(students)
          .where(
            and(eq(students.id, studentId), eq(students.status, 'active')),
          );
        // Cross-tenant ids are invisible under RLS — same 404 as nonexistent.
        if (!student)
          throw problem(404, ErrorCodes.NOT_FOUND, 'Student not found');

        const state = await this.query.currentState(tx, studentId);
        let beltId: string;
        let degree: number;
        if (input.kind === 'degree') {
          if (state.belt.degrees >= state.belt.maxDegrees) {
            throw problem(
              422,
              ErrorCodes.GRADUATION_DEGREE_AT_MAX,
              `${state.belt.name} holds at most ${state.belt.maxDegrees} degrees`,
            );
          }
          beltId = state.belt.beltId;
          degree = state.belt.degrees + 1;
        } else {
          beltId = await this.validateBeltTarget(
            tx,
            input.beltId,
            state.belt.beltId,
          );
          degree = 0;
        }

        const graduationId = await this.insertAward(tx, {
          tenantId: ctx.tenantId,
          studentId,
          beltId,
          kind: input.kind,
          degree,
          awardedByUserId: ctx.userId,
          impersonatorUserId: ctx.impersonatorUserId,
          notes: input.notes ?? null,
        });

        const timeline = await this.query.timeline(tx, studentId);
        const graduation = timeline.find((entry) => entry.id === graduationId);
        if (!graduation)
          throw problem(
            500,
            ErrorCodes.INTERNAL,
            'Award row missing after insert',
          );

        // The announcement payload (spec 010) — emitted post-commit below, so
        // the notifications listener only ever sees committed awards. Never
        // built for the initial-belt seed nor for revocations.
        awarded = {
          tenantId: ctx.tenantId,
          studentId: student.id,
          studentName: student.fullName,
          guardianId: student.guardianId,
          beltName: graduation.belt.name,
          degree: graduation.degree,
          kind: input.kind,
          awardedByName: graduation.awardedBy.fullName,
        };
        return {
          graduation,
          belt: await this.query.currentBelt(tx, studentId),
        };
      },
    );
    if (awarded) this.emitter.emit(GRADUATION_AWARDED, awarded);
    return result;
  }

  /**
   * Optional initial belt at student creation (story 32) — runs inside the
   * caller's creation transaction. Left empty, the student starts white (no
   * synthetic row).
   */
  async seedInitialBeltInTx(
    tx: DbTransaction,
    ctx: AuthContext & { tenantId: string },
    studentId: string,
    beltId: string,
  ): Promise<void> {
    const target = await this.validateBeltTarget(tx, beltId, null);
    await this.insertAward(tx, {
      tenantId: ctx.tenantId,
      studentId,
      beltId: target,
      kind: 'belt',
      degree: 0,
      awardedByUserId: ctx.userId,
      impersonatorUserId: ctx.impersonatorUserId,
      notes: INITIAL_BELT_NOTES,
    });
  }

  /**
   * Admin-only compensation-row revocation, no time window (stories 29-31):
   * INSERT `kind='revocation'` + `reverses_graduation_id` — never an edit.
   * The partial unique makes double revocation impossible; the service turns
   * both the pre-check and the constraint race into the same stable 409.
   */
  async revoke(
    ctx: AuthContext & { tenantId: string },
    graduationId: string,
    reason?: string,
  ): Promise<RevokeResult> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const [target] = await tx
        .select({
          id: studentGraduations.id,
          studentId: studentGraduations.studentId,
          beltId: studentGraduations.beltId,
          kind: studentGraduations.kind,
        })
        .from(studentGraduations)
        .where(eq(studentGraduations.id, graduationId));
      if (!target)
        throw problem(404, ErrorCodes.NOT_FOUND, 'Graduation not found');
      if (target.kind === 'revocation') {
        throw problem(
          422,
          ErrorCodes.VALIDATION_FAILED,
          'A revocation row cannot be revoked',
          [
            {
              field: 'graduationId',
              messages: ['Only award rows (degree/belt) can be revoked'],
            },
          ],
        );
      }

      const [existing] = await tx
        .select({ id: studentGraduations.id })
        .from(studentGraduations)
        .where(eq(studentGraduations.reversesGraduationId, graduationId));
      if (existing) {
        throw problem(
          409,
          ErrorCodes.GRADUATION_ALREADY_REVERSED,
          'This graduation was already revoked',
        );
      }

      let revocationId: string;
      try {
        const [row] = await tx
          .insert(studentGraduations)
          .values({
            tenantId: ctx.tenantId,
            studentId: target.studentId,
            beltId: target.beltId,
            kind: 'revocation',
            degree: 0,
            awardedByUserId: ctx.userId,
            awardedAt: new Date(),
            notes: reason ?? null,
            reversesGraduationId: target.id,
          })
          .returning({ id: studentGraduations.id });
        if (!row)
          throw problem(
            500,
            ErrorCodes.INTERNAL,
            'Revocation insert returned no row',
          );
        revocationId = row.id;
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw problem(
            409,
            ErrorCodes.GRADUATION_ALREADY_REVERSED,
            'This graduation was already revoked',
          );
        }
        throw error;
      }

      // Audited in the same transaction, with who and why (story 31).
      await tx.execute(sql`
        SELECT audit_append(
          ${ctx.tenantId}::uuid,
          ${ctx.userId}::uuid,
          ${ctx.impersonatorUserId}::uuid,
          'graduation.revoked',
          'graduation',
          ${revocationId}::text,
          ${JSON.stringify({
            reverses_graduation_id: target.id,
            student_id: target.studentId,
            reason: reason ?? null,
          })}::jsonb
        )
      `);

      return {
        status: 'revoked' as const,
        graduationId: target.id,
        revocationId,
        belt: await this.query.currentBelt(tx, target.studentId),
      };
    });
  }

  /**
   * Belt-promotion target rule: must exist in the catalog, be enabled for the
   * academy, and (when a current belt is given) differ from it. One stable
   * code covers all three (spec: "belt disabled/invalid target").
   */
  private async validateBeltTarget(
    tx: DbTransaction,
    beltId: string | undefined,
    currentBeltId: string | null,
  ): Promise<string> {
    if (!beltId) {
      throw problem(
        422,
        ErrorCodes.VALIDATION_FAILED,
        'beltId is required for belt promotions',
        [{ field: 'beltId', messages: ['Required when kind is belt'] }],
      );
    }
    const catalog = await this.query.catalogById(tx);
    const target = catalog.get(beltId);
    if (!target) {
      throw problem(
        422,
        ErrorCodes.GRADUATION_BELT_INVALID_TARGET,
        'Unknown target belt',
      );
    }
    if (currentBeltId && beltId === currentBeltId) {
      throw problem(
        422,
        ErrorCodes.GRADUATION_BELT_INVALID_TARGET,
        'Target belt equals the current belt',
      );
    }
    const rule = await this.rules.ruleFor(tx, beltId);
    if (!rule.enabled) {
      throw problem(
        422,
        ErrorCodes.GRADUATION_BELT_INVALID_TARGET,
        'Target belt is disabled for this academy',
      );
    }
    return beltId;
  }

  private async insertAward(
    tx: DbTransaction,
    row: {
      tenantId: string;
      studentId: string;
      beltId: string;
      kind: 'degree' | 'belt';
      degree: number;
      awardedByUserId: string;
      impersonatorUserId: string | null;
      notes: string | null;
    },
  ): Promise<string> {
    const [inserted] = await tx
      .insert(studentGraduations)
      .values({
        tenantId: row.tenantId,
        studentId: row.studentId,
        beltId: row.beltId,
        kind: row.kind,
        degree: row.degree,
        awardedByUserId: row.awardedByUserId,
        awardedAt: new Date(),
        notes: row.notes,
      })
      .returning({ id: studentGraduations.id });
    if (!inserted)
      throw problem(
        500,
        ErrorCodes.INTERNAL,
        'Graduation insert returned no row',
      );

    // `graduation.awarded` rides the same transaction — no exceptions
    // (resolved audit decision); impersonated mutations carry the actor pair.
    await tx.execute(sql`
      SELECT audit_append(
        ${row.tenantId}::uuid,
        ${row.awardedByUserId}::uuid,
        ${row.impersonatorUserId}::uuid,
        'graduation.awarded',
        'graduation',
        ${inserted.id}::text,
        ${JSON.stringify({
          belt_id: row.beltId,
          degree: row.degree,
          kind: row.kind,
          student_id: row.studentId,
        })}::jsonb
      )
    `);
    return inserted.id;
  }
}

/** Postgres unique_violation (the single-reversal partial unique). */
function isUniqueViolation(error: unknown): boolean {
  const cause = (error as { cause?: { code?: string } })?.cause;
  return (
    (error as { code?: string })?.code === '23505' || cause?.code === '23505'
  );
}
