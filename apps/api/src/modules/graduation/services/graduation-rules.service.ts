import { Inject, Injectable } from '@nestjs/common';
import {
  graduationRules,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import {
  DEFAULT_LESSONS_PER_DEGREE,
  MIN_LESSONS_PER_DEGREE,
  type GraduationRuleRow,
} from '../graduation.types.js';
import { GraduationQueryService } from './graduation-query.service.js';

export interface EffectiveRule {
  lessonsPerDegree: number;
  enabled: boolean;
}

export interface RuleUpdateEntry {
  beltId: string;
  lessonsPerDegree: number;
  enabled: boolean;
}

const tenantCtx = (ctx: AuthContext) => ({
  tenantId: ctx.tenantId,
  userId: ctx.userId,
});

/**
 * Regras de graduação (GRD.9): per-academy lessons-per-degree + kids-belt
 * toggles. Rows are lazily upserted — an untouched academy has no rows and
 * reads the code defaults (40 lessons, everything enabled); reads always
 * merge the shared catalog with the overrides.
 */
@Injectable()
export class GraduationRulesService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly query: GraduationQueryService,
  ) {}

  /** Effective rule per belt id (override row or the code default). */
  async effectiveRules(tx: DbTransaction): Promise<Map<string, EffectiveRule>> {
    const overrides = await tx
      .select({
        beltId: graduationRules.beltId,
        lessonsPerDegree: graduationRules.lessonsPerDegree,
        enabled: graduationRules.enabled,
      })
      .from(graduationRules);
    return new Map(
      overrides.map((row) => [
        row.beltId,
        { lessonsPerDegree: row.lessonsPerDegree, enabled: row.enabled },
      ]),
    );
  }

  /** Effective rule for one belt — the progress-engine read. */
  async ruleFor(tx: DbTransaction, beltId: string): Promise<EffectiveRule> {
    const rules = await this.effectiveRules(tx);
    return (
      rules.get(beltId) ?? {
        lessonsPerDegree: DEFAULT_LESSONS_PER_DEGREE,
        enabled: true,
      }
    );
  }

  /** Merged régua rows in the handoff ladder display order (in-tx form). */
  async mergedRulesInTx(tx: DbTransaction): Promise<GraduationRuleRow[]> {
    const [catalog, overrides] = [
      await this.query.mergedCatalog(tx),
      await this.effectiveRules(tx),
    ];
    return catalog.map((belt) => {
      const rule = overrides.get(belt.beltId);
      return {
        beltId: belt.beltId,
        name: belt.name,
        colorSlug: belt.colorSlug,
        tipColorSlug: belt.tipColorSlug,
        maxDegrees: belt.maxDegrees,
        ladderKind: belt.ladderKind,
        lessonsPerDegree: rule?.lessonsPerDegree ?? DEFAULT_LESSONS_PER_DEGREE,
        enabled: rule?.enabled ?? true,
        toggleable: belt.ladderKind === 'kids',
      };
    });
  }

  /** GET /admin/graduation-rules — merged defaults + overrides. */
  async adminView(
    ctx: AuthContext & { tenantId: string },
  ): Promise<GraduationRuleRow[]> {
    return withTenant(this.appDb.db, tenantCtx(ctx), (tx) =>
      this.mergedRulesInTx(tx),
    );
  }

  /**
   * PUT /admin/graduation-rules — bulk save (story 26). Validations carry
   * stable codes: below-minimum lessons and disabling a non-kids belt are
   * their own problems, unknown belt ids are plain validation failures. Only
   * rows that differ from the current effective value are upserted, keeping
   * the lazy-row doctrine (untouched defaults stay absent).
   */
  async update(
    ctx: AuthContext & { tenantId: string },
    entries: RuleUpdateEntry[],
  ): Promise<GraduationRuleRow[]> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const catalog = await this.query.catalogById(tx);
      for (const entry of entries) {
        const belt = catalog.get(entry.beltId);
        if (!belt) {
          throw problem(
            422,
            ErrorCodes.VALIDATION_FAILED,
            'Unknown belt in rules payload',
            [
              {
                field: 'rules',
                messages: [`Belt ${entry.beltId} is not in the catalog`],
              },
            ],
          );
        }
        if (entry.lessonsPerDegree < MIN_LESSONS_PER_DEGREE) {
          throw problem(
            422,
            ErrorCodes.GRADUATION_LESSONS_BELOW_MINIMUM,
            `Lessons per degree cannot be below ${MIN_LESSONS_PER_DEGREE}`,
          );
        }
        if (!entry.enabled && belt.ladderKind !== 'kids') {
          throw problem(
            422,
            ErrorCodes.GRADUATION_CANNOT_DISABLE_NON_KIDS_BELT,
            'Only kids-ladder belts can be disabled',
          );
        }
      }

      const effective = await this.effectiveRules(tx);
      for (const entry of entries) {
        const current = effective.get(entry.beltId) ?? {
          lessonsPerDegree: DEFAULT_LESSONS_PER_DEGREE,
          enabled: true,
        };
        const unchanged =
          current.lessonsPerDegree === entry.lessonsPerDegree &&
          current.enabled === entry.enabled;
        // Lazy rows: a value identical to the effective one writes nothing.
        if (unchanged) continue;
        await tx
          .insert(graduationRules)
          .values({
            tenantId: ctx.tenantId,
            beltId: entry.beltId,
            lessonsPerDegree: entry.lessonsPerDegree,
            enabled: entry.enabled,
          })
          .onConflictDoUpdate({
            target: [graduationRules.tenantId, graduationRules.beltId],
            set: {
              lessonsPerDegree: entry.lessonsPerDegree,
              enabled: entry.enabled,
              updatedAt: new Date(),
            },
          });
      }
      return this.mergedRulesInTx(tx);
    });
  }
}
