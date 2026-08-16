import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, inArray, sql } from 'drizzle-orm';
import {
  academies,
  academySubscriptions,
  memberships,
  platformPlans,
  students,
  users,
  withPlatform,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB, PLATFORM_DB } from '../../../infra/db/db.module.js';
import { AcademyStatusService } from '../../identity/services/academy-status.service.js';
import { AuditService } from '../../identity/services/audit.service.js';
import { PasswordResetService } from '../../identity/services/password-reset.service.js';

/** New customers start on Trial (charter) with a two-week window. */
const TRIAL_DAYS = 14;

export interface PlatformAcademyRow {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  status: 'trial' | 'active' | 'delinquent' | 'suspended';
  studentCount: number;
  planName: string | null;
  planPriceCents: number | null;
  subscriptionStatus: string | null;
}

export interface PlatformAcademyDetail extends PlatformAcademyRow {
  /** "desde <mês ano>" on plataforma-04 — the academy's creation instant. */
  createdAt: string;
  professorCount: number;
  contactEmail: string;
  /** Scheduled next-cycle plan change, or null. */
  pendingPlan: { id: string; name: string; priceCents: number } | null;
  currentPeriodEnd: string | null;
}

export interface RegisterAcademyInput {
  name: string;
  city: string | null;
  adminEmail: string;
  adminFullName: string | null;
  platformPlanId: string;
}

export interface RegisterAcademyResult {
  academy: PlatformAcademyDetail;
  adminUserId: string;
  adminUserCreated: boolean;
  /** False when the admin already had a password (a reused account). */
  passwordEmailSent: boolean;
}

/** Slug source: lowercase ASCII words joined by dashes. */
function slugify(name: string): string {
  const base = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return base || 'academia';
}

/**
 * Plataforma Academias (spec 012, PLT.4–PLT.6 — plataforma-03/04/08). Reads
 * run on the platform (BYPASSRLS) pool because the persona is cross-tenant
 * by definition; the one write that lands *inside* a tenant — the new
 * academy's admin membership — goes through `withTenant` so the tenant
 * policies still apply to it.
 */
@Injectable()
export class PlatformAcademiesService {
  constructor(
    @Inject(PLATFORM_DB) private readonly platformDb: DbHandle,
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly audit: AuditService,
    private readonly academyStatus: AcademyStatusService,
    private readonly passwordResets: PasswordResetService,
  ) {}

  private static readonly LIVE_SUBSCRIPTION = ['trialing', 'active', 'past_due'] as const;

  private async rows(tx: DbTransaction, academyId?: string): Promise<PlatformAcademyRow[]> {
    const studentCounts = tx
      .select({
        tenantId: students.tenantId,
        total: count().as('student_total'),
      })
      .from(students)
      .where(eq(students.status, 'active'))
      .groupBy(students.tenantId)
      .as('student_counts');

    const query = tx
      .select({
        id: academies.id,
        name: academies.name,
        slug: academies.slug,
        city: academies.city,
        status: academies.status,
        studentCount: sql<number>`COALESCE(${studentCounts.total}, 0)::int`,
        planName: platformPlans.name,
        planPriceCents: platformPlans.priceCents,
        subscriptionStatus: academySubscriptions.status,
      })
      .from(academies)
      .leftJoin(studentCounts, eq(studentCounts.tenantId, academies.id))
      .leftJoin(
        academySubscriptions,
        and(
          eq(academySubscriptions.academyId, academies.id),
          inArray(academySubscriptions.status, [...PlatformAcademiesService.LIVE_SUBSCRIPTION]),
        ),
      )
      .leftJoin(platformPlans, eq(platformPlans.id, academySubscriptions.platformPlanId))
      .orderBy(asc(academies.name));

    const result = academyId ? await query.where(eq(academies.id, academyId)) : await query;
    return result as PlatformAcademyRow[];
  }

  async list(): Promise<{ academies: PlatformAcademyRow[]; total: number }> {
    return withPlatform(this.platformDb.db, async (tx) => {
      const rows = await this.rows(tx);
      return { academies: rows, total: rows.length };
    });
  }

  async detail(academyId: string): Promise<PlatformAcademyDetail> {
    return withPlatform(this.platformDb.db, (tx) => this.detailIn(tx, academyId));
  }

  private async detailIn(tx: DbTransaction, academyId: string): Promise<PlatformAcademyDetail> {
    const [row] = await this.rows(tx, academyId);
    if (!row) throw problem(404, ErrorCodes.NOT_FOUND, 'Academy not found');

    const [meta] = await tx
      .select({ createdAt: academies.createdAt, contactEmail: academies.contactEmail })
      .from(academies)
      .where(eq(academies.id, academyId));

    const [professors] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(memberships)
      .where(
        and(
          eq(memberships.tenantId, academyId),
          eq(memberships.role, 'professor'),
          eq(memberships.status, 'active'),
        ),
      );

    const [subscription] = await tx
      .select({
        currentPeriodEnd: academySubscriptions.currentPeriodEnd,
        pendingPlatformPlanId: academySubscriptions.pendingPlatformPlanId,
      })
      .from(academySubscriptions)
      .where(
        and(
          eq(academySubscriptions.academyId, academyId),
          inArray(academySubscriptions.status, [...PlatformAcademiesService.LIVE_SUBSCRIPTION]),
        ),
      );

    let pendingPlan: PlatformAcademyDetail['pendingPlan'] = null;
    if (subscription?.pendingPlatformPlanId) {
      const [plan] = await tx
        .select({
          id: platformPlans.id,
          name: platformPlans.name,
          priceCents: platformPlans.priceCents,
        })
        .from(platformPlans)
        .where(eq(platformPlans.id, subscription.pendingPlatformPlanId));
      pendingPlan = plan ?? null;
    }

    return {
      ...row,
      createdAt: (meta?.createdAt ?? new Date()).toISOString(),
      contactEmail: meta?.contactEmail ?? '',
      professorCount: professors?.total ?? 0,
      pendingPlan,
      currentPeriodEnd: subscription?.currentPeriodEnd?.toISOString() ?? null,
    };
  }

  /**
   * The product's first real onboarding path (PLT.5): academy + trialing
   * subscription + the admin's membership in one transaction; the
   * set-password email is dispatched *after* it commits, so a mail failure
   * never rolls back a created customer.
   */
  async register(ctx: AuthContext, input: RegisterAcademyInput): Promise<RegisterAcademyResult> {
    const email = input.adminEmail.trim().toLowerCase();
    const created = await withPlatform(this.platformDb.db, async (tx) => {
      const [plan] = await tx
        .select({ id: platformPlans.id, isActive: platformPlans.isActive })
        .from(platformPlans)
        .where(eq(platformPlans.id, input.platformPlanId));
      if (!plan || !plan.isActive) {
        throw problem(404, ErrorCodes.PLAN_NOT_FOUND, 'Platform plan not found');
      }

      // Slug uniqueness: the invite URLs depend on it, so a collision gets a
      // numeric suffix rather than a failed registration.
      const base = slugify(input.name);
      const taken = new Set(
        (
          await tx
            .select({ slug: academies.slug })
            .from(academies)
            .where(sql`${academies.slug} = ${base} OR ${academies.slug} LIKE ${`${base}-%`}`)
        ).map((row) => row.slug),
      );
      let slug = base;
      for (let n = 2; taken.has(slug); n += 1) slug = `${base}-${n}`;

      const [academy] = await tx
        .insert(academies)
        .values({
          name: input.name,
          slug,
          status: 'trial',
          city: input.city,
          contactEmail: email,
        })
        .returning({ id: academies.id });
      if (!academy) throw problem(500, ErrorCodes.INTERNAL, 'Academy insert returned no row');

      const now = Date.now();
      await tx.insert(academySubscriptions).values({
        academyId: academy.id,
        platformPlanId: plan.id,
        status: 'trialing',
        currentPeriodStart: new Date(now),
        currentPeriodEnd: new Date(now + TRIAL_DAYS * 86_400_000),
      });

      // Find-or-create the admin: one human can run two academies.
      const [existing] = await tx
        .select({ id: users.id })
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`);
      let adminUserId = existing?.id;
      const adminUserCreated = !adminUserId;
      if (!adminUserId) {
        const [inserted] = await tx
          .insert(users)
          .values({ email, fullName: input.adminFullName?.trim() || input.name })
          .returning({ id: users.id });
        if (!inserted) throw problem(500, ErrorCodes.INTERNAL, 'Admin insert returned no row');
        adminUserId = inserted.id;
      }

      return { academyId: academy.id, adminUserId, adminUserCreated };
    });

    // Tenant-scoped write through the RLS-enforced pool (WITH CHECK honest).
    await withTenant(this.appDb.db, created.academyId, (tx) =>
      tx
        .insert(memberships)
        .values({ tenantId: created.academyId, userId: created.adminUserId, role: 'admin' })
        .onConflictDoNothing({
          target: [memberships.tenantId, memberships.userId, memberships.role],
        }),
    );

    await this.audit.append({
      tenantId: created.academyId,
      actorUserId: ctx.userId,
      impersonatorUserId: ctx.impersonatorUserId,
      action: 'academy.registered',
      targetType: 'academy',
      targetId: created.academyId,
      metadata: { adminEmail: email, platformPlanId: input.platformPlanId },
    });

    // Outside the transaction, fire-and-acknowledge (the forgot-password
    // path's contract): unknown/known email is indistinguishable, and the
    // customer exists either way.
    await this.passwordResets.requestReset(email);

    return {
      academy: await this.detail(created.academyId),
      adminUserId: created.adminUserId,
      adminUserCreated: created.adminUserCreated,
      passwordEmailSent: true,
    };
  }

  /**
   * Plan change applies at the next cycle (charter) — this writes
   * `pending_platform_plan_id` and nothing else. `null` clears a scheduled
   * change.
   */
  async schedulePlanChange(
    ctx: AuthContext,
    academyId: string,
    platformPlanId: string | null,
  ): Promise<PlatformAcademyDetail> {
    return withPlatform(this.platformDb.db, async (tx) => {
      const [subscription] = await tx
        .select({
          id: academySubscriptions.id,
          platformPlanId: academySubscriptions.platformPlanId,
        })
        .from(academySubscriptions)
        .where(
          and(
            eq(academySubscriptions.academyId, academyId),
            inArray(academySubscriptions.status, [...PlatformAcademiesService.LIVE_SUBSCRIPTION]),
          ),
        );
      if (!subscription) {
        throw problem(404, ErrorCodes.NOT_FOUND, 'Academy has no live subscription');
      }

      if (platformPlanId) {
        const [plan] = await tx
          .select({ id: platformPlans.id, isActive: platformPlans.isActive })
          .from(platformPlans)
          .where(eq(platformPlans.id, platformPlanId));
        if (!plan || !plan.isActive) {
          throw problem(404, ErrorCodes.PLAN_NOT_FOUND, 'Platform plan not found');
        }
      }

      // Choosing the plan the academy is already on is a cancel, not a
      // no-op schedule — the picker would otherwise strand a pending row.
      const pending = platformPlanId === subscription.platformPlanId ? null : platformPlanId;

      await tx
        .update(academySubscriptions)
        .set({ pendingPlatformPlanId: pending, updatedAt: new Date() })
        .where(eq(academySubscriptions.id, subscription.id));

      await this.audit.append({
        tenantId: academyId,
        actorUserId: ctx.userId,
        impersonatorUserId: ctx.impersonatorUserId,
        action: 'academy.plan_change_scheduled',
        targetType: 'academy',
        targetId: academyId,
        metadata: { pendingPlatformPlanId: pending },
      });

      return this.detailIn(tx, academyId);
    });
  }

  /** Suspension blocks access (charter); reactivation restores the real status. */
  async setSuspended(
    ctx: AuthContext,
    academyId: string,
    suspended: boolean,
  ): Promise<PlatformAcademyDetail> {
    const detail = await withPlatform(this.platformDb.db, async (tx) => {
      const [academy] = await tx
        .select({ id: academies.id, status: academies.status })
        .from(academies)
        .where(eq(academies.id, academyId));
      if (!academy) throw problem(404, ErrorCodes.NOT_FOUND, 'Academy not found');

      let next: 'trial' | 'active' | 'delinquent' | 'suspended';
      if (suspended) {
        next = 'suspended';
      } else {
        // Reactivation restores the status the subscription justifies, not
        // whatever it was before — the subscription may have moved on.
        const [subscription] = await tx
          .select({ status: academySubscriptions.status })
          .from(academySubscriptions)
          .where(
            and(
              eq(academySubscriptions.academyId, academyId),
              inArray(academySubscriptions.status, [...PlatformAcademiesService.LIVE_SUBSCRIPTION]),
            ),
          );
        next =
          subscription?.status === 'past_due'
            ? 'delinquent'
            : subscription?.status === 'trialing'
              ? 'trial'
              : 'active';
      }

      if (academy.status !== next) {
        await tx
          .update(academies)
          .set({ status: next, updatedAt: new Date() })
          .where(eq(academies.id, academyId));
      }
      return this.detailIn(tx, academyId);
    });

    // The status guard caches for 30 s — a suspension that takes half a
    // minute to bite is not a suspension.
    this.academyStatus.invalidate(academyId);

    await this.audit.append({
      tenantId: academyId,
      actorUserId: ctx.userId,
      impersonatorUserId: ctx.impersonatorUserId,
      action: suspended ? 'academy.suspended' : 'academy.reactivated',
      targetType: 'academy',
      targetId: academyId,
      metadata: { status: detail.status },
    });

    return detail;
  }
}
