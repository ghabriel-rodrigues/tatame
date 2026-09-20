import { Inject, Injectable } from '@nestjs/common';
import { asc, eq, inArray, sql } from 'drizzle-orm';
import {
  academySubscriptions,
  platformPlans,
  withPlatform,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { PLATFORM_DB } from '../../../infra/db/db.module.js';
import { AuditService } from '../../identity/services/audit.service.js';
import {
  isPlanFeatureSlug,
  PLAN_FEATURES,
  planFeatureLabel,
  sortFeatureSlugs,
  type PlanFeature,
} from '../lib/plan-features.js';

export interface PlanFeatureChip {
  slug: string;
  label: string;
}

export interface PlatformPlanRow {
  id: string;
  name: string;
  priceCents: number;
  /** NULL = unlimited students. */
  studentLimit: number | null;
  features: PlanFeatureChip[];
  /** Academies on a live subscription to this plan. */
  academyCount: number;
  /** Most-subscribed plan — derived, never stored. */
  isMostSubscribed: boolean;
  /**
   * Name of the cheaper plan this one fully contains, or null. Drives the
   * plataforma-05 "Tudo do X" chip; `features` above already excludes the
   * inherited ones when this is set.
   */
  inheritsFrom: string | null;
  isActive: boolean;
  sortOrder: number;
}

export interface PlatformPlanCatalog {
  plans: PlatformPlanRow[];
  /** The toggle rows of plataforma-06 — the registry, in display order. */
  featureRegistry: PlanFeature[];
}

export interface PlanWriteInput {
  name: string;
  priceCents: number;
  studentLimit: number | null;
  features: string[];
}

/** Live subscription statuses — what "N academias" on a plan card counts. */
const LIVE = ['trialing', 'active', 'past_due'] as const;

/**
 * Platform plan catalog (spec 012, PLT.7 — plataforma-05/06/07). Reads
 * derive the two badges the prototype draws as stored flags:
 *
 * - **"Mais assinado"** is the plan with the most live subscriptions (ties
 *   resolve to the lower `sort_order`), so the flagship badge can never
 *   disagree with the subscriptions it summarizes;
 * - **"Tudo do X"** is emitted when a plan's feature set strictly contains
 *   the next-cheaper plan's, and the contained chips are then dropped from
 *   the card so it reads like the pricing page instead of repeating itself.
 */
@Injectable()
export class PlatformPlansService {
  constructor(
    @Inject(PLATFORM_DB) private readonly platformDb: DbHandle,
    private readonly audit: AuditService,
  ) {}

  async catalog(): Promise<PlatformPlanCatalog> {
    return withPlatform(this.platformDb.db, async (tx) => ({
      plans: await PlatformPlansService.rows(tx),
      featureRegistry: PLAN_FEATURES,
    }));
  }

  private static async rows(tx: DbTransaction): Promise<PlatformPlanRow[]> {
    const plans = await tx
      .select({
        id: platformPlans.id,
        name: platformPlans.name,
        priceCents: platformPlans.priceCents,
        studentLimit: platformPlans.studentLimit,
        features: platformPlans.features,
        isActive: platformPlans.isActive,
        sortOrder: platformPlans.sortOrder,
      })
      .from(platformPlans)
      .orderBy(asc(platformPlans.sortOrder), asc(platformPlans.name));

    const counts = await tx
      .select({
        planId: academySubscriptions.platformPlanId,
        total: sql<number>`count(*)::int`,
      })
      .from(academySubscriptions)
      .where(inArray(academySubscriptions.status, [...LIVE]))
      .groupBy(academySubscriptions.platformPlanId);
    const countByPlan = new Map(counts.map((row) => [row.planId, row.total]));

    let leaderId: string | null = null;
    let leaderCount = 0;
    for (const plan of plans) {
      const total = countByPlan.get(plan.id) ?? 0;
      if (total > leaderCount) {
        leaderCount = total;
        leaderId = plan.id;
      }
    }

    return plans.map((plan, index) => {
      const own = new Set(sortFeatureSlugs(plan.features));
      const previous = plans[index - 1];
      const previousFeatures = previous
        ? sortFeatureSlugs(previous.features)
        : [];
      const contains =
        previous !== undefined &&
        previousFeatures.length > 0 &&
        previousFeatures.every((slug) => own.has(slug)) &&
        own.size > previousFeatures.length;

      const shown = contains
        ? sortFeatureSlugs(plan.features).filter(
            (slug) => !previousFeatures.includes(slug),
          )
        : sortFeatureSlugs(plan.features);

      return {
        id: plan.id,
        name: plan.name,
        priceCents: plan.priceCents,
        studentLimit: plan.studentLimit,
        features: shown.map((slug) => ({
          slug,
          label: planFeatureLabel(slug),
        })),
        academyCount: countByPlan.get(plan.id) ?? 0,
        // Zero subscriptions everywhere = no flagship to badge.
        isMostSubscribed: leaderCount > 0 && plan.id === leaderId,
        inheritsFrom: contains ? (previous?.name ?? null) : null,
        isActive: plan.isActive,
        sortOrder: plan.sortOrder,
      };
    });
  }

  private static validate(input: PlanWriteInput): string[] {
    const unknown = input.features.filter((slug) => !isPlanFeatureSlug(slug));
    if (unknown.length > 0) {
      throw problem(
        400,
        ErrorCodes.VALIDATION_FAILED,
        `Unknown plan feature: ${unknown.join(', ')}`,
      );
    }
    return sortFeatureSlugs(input.features);
  }

  async create(
    ctx: AuthContext,
    input: PlanWriteInput,
  ): Promise<PlatformPlanRow> {
    const features = PlatformPlansService.validate(input);
    return withPlatform(this.platformDb.db, async (tx) => {
      await PlatformPlansService.assertNameFree(tx, input.name, null);
      const [maxOrder] = await tx
        .select({
          value: sql<number>`COALESCE(MAX(${platformPlans.sortOrder}), 0)::int`,
        })
        .from(platformPlans);

      const [inserted] = await tx
        .insert(platformPlans)
        .values({
          name: input.name,
          priceCents: input.priceCents,
          studentLimit: input.studentLimit,
          features,
          sortOrder: (maxOrder?.value ?? 0) + 1,
          isActive: true,
          // fee_bps stays contractual (spec 012) — the editor never sets it;
          // a new plan starts on no platform take until priced.
          feeBps: null,
        })
        .returning({ id: platformPlans.id });
      if (!inserted)
        throw problem(500, ErrorCodes.INTERNAL, 'Plan insert returned no row');

      await this.audit.append({
        tenantId: null,
        actorUserId: ctx.userId,
        impersonatorUserId: ctx.impersonatorUserId,
        action: 'platform_plan.created',
        targetType: 'platform_plan',
        targetId: inserted.id,
        metadata: { name: input.name, priceCents: input.priceCents },
      });

      return PlatformPlansService.requireRow(
        await PlatformPlansService.rows(tx),
        inserted.id,
      );
    });
  }

  async update(
    ctx: AuthContext,
    planId: string,
    input: PlanWriteInput,
  ): Promise<PlatformPlanRow> {
    const features = PlatformPlansService.validate(input);
    return withPlatform(this.platformDb.db, async (tx) => {
      const [existing] = await tx
        .select({ id: platformPlans.id })
        .from(platformPlans)
        .where(eq(platformPlans.id, planId));
      if (!existing)
        throw problem(
          404,
          ErrorCodes.PLAN_NOT_FOUND,
          'Platform plan not found',
        );
      await PlatformPlansService.assertNameFree(tx, input.name, planId);

      await tx
        .update(platformPlans)
        .set({
          name: input.name,
          priceCents: input.priceCents,
          studentLimit: input.studentLimit,
          features,
          updatedAt: new Date(),
        })
        .where(eq(platformPlans.id, planId));

      await this.audit.append({
        tenantId: null,
        actorUserId: ctx.userId,
        impersonatorUserId: ctx.impersonatorUserId,
        action: 'platform_plan.updated',
        targetType: 'platform_plan',
        targetId: planId,
        metadata: { name: input.name, priceCents: input.priceCents },
      });

      return PlatformPlansService.requireRow(
        await PlatformPlansService.rows(tx),
        planId,
      );
    });
  }

  private static async assertNameFree(
    tx: DbTransaction,
    name: string,
    exceptId: string | null,
  ): Promise<void> {
    const clash = await tx
      .select({ id: platformPlans.id })
      .from(platformPlans)
      .where(sql`lower(${platformPlans.name}) = ${name.toLowerCase()}`);
    if (clash.some((row) => row.id !== exceptId)) {
      throw problem(
        409,
        ErrorCodes.PLAN_NAME_TAKEN,
        'A platform plan with this name exists',
      );
    }
  }

  private static requireRow(
    rows: PlatformPlanRow[],
    planId: string,
  ): PlatformPlanRow {
    const row = rows.find((candidate) => candidate.id === planId);
    if (!row)
      throw problem(
        500,
        ErrorCodes.INTERNAL,
        'Plan disappeared mid-transaction',
      );
    return row;
  }
}
