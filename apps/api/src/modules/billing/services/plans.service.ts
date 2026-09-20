import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ne } from 'drizzle-orm';
import {
  academyPlans,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import type { PlanHeaderView } from './wallet.service.js';

export interface PlanInput {
  name: string;
  amountCents: number;
  recurrence: 'monthly' | 'quarterly' | 'semiannual' | 'yearly';
  dueDay: number;
}

const view = (row: typeof academyPlans.$inferSelect): PlanHeaderView => ({
  id: row.id,
  name: row.name,
  amountCents: row.amountCents,
  currency: row.currency,
  recurrence: row.recurrence,
  dueDay: row.dueDay,
  isActive: row.isActive,
});

/**
 * Planos de mensalidade CRUD (spec 006, BIL.10 — admin-15): create/edit +
 * soft archive only (history referencing a plan stays intact, never
 * hard-delete). The UNIQUE (tenant, name) turns duplicate names into a clean
 * 409. Also the plan-assignment validation seam reused by students and
 * invites (closes the Phase-1/3 FK hole with clean 404/409 instead of a
 * constraint 500).
 */
@Injectable()
export class PlansService {
  constructor(@Inject(APP_DB) private readonly appDb: DbHandle) {}

  async list(
    ctx: AuthContext & { tenantId: string },
  ): Promise<PlanHeaderView[]> {
    return withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx) => {
        const rows = await tx
          .select()
          .from(academyPlans)
          .orderBy(asc(academyPlans.name));
        return rows.map(view);
      },
    );
  }

  async create(
    ctx: AuthContext & { tenantId: string },
    input: PlanInput,
  ): Promise<PlanHeaderView> {
    return withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx) => {
        await this.assertNameFree(tx, input.name);
        const [row] = await tx
          .insert(academyPlans)
          .values({
            tenantId: ctx.tenantId,
            name: input.name,
            amountCents: input.amountCents,
            recurrence: input.recurrence,
            dueDay: input.dueDay,
          })
          .returning();
        if (!row)
          throw problem(
            500,
            ErrorCodes.INTERNAL,
            'Plan insert returned no row',
          );
        return view(row);
      },
    );
  }

  async update(
    ctx: AuthContext & { tenantId: string },
    id: string,
    input: Partial<PlanInput>,
  ): Promise<PlanHeaderView> {
    return withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx) => {
        if (input.name) await this.assertNameFree(tx, input.name, id);
        const [row] = await tx
          .update(academyPlans)
          .set({
            ...(input.name !== undefined ? { name: input.name } : {}),
            ...(input.amountCents !== undefined
              ? { amountCents: input.amountCents }
              : {}),
            ...(input.recurrence !== undefined
              ? { recurrence: input.recurrence }
              : {}),
            ...(input.dueDay !== undefined ? { dueDay: input.dueDay } : {}),
            updatedAt: new Date(),
          })
          .where(eq(academyPlans.id, id))
          .returning();
        if (!row)
          throw problem(404, ErrorCodes.PLAN_NOT_FOUND, 'Plan not found');
        return view(row);
      },
    );
  }

  /** Soft archive: refuses new assignment, keeps every reference intact. */
  async archive(
    ctx: AuthContext & { tenantId: string },
    id: string,
  ): Promise<PlanHeaderView> {
    return withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx) => {
        const [row] = await tx
          .update(academyPlans)
          .set({ isActive: false, updatedAt: new Date() })
          .where(eq(academyPlans.id, id))
          .returning();
        if (!row)
          throw problem(404, ErrorCodes.PLAN_NOT_FOUND, 'Plan not found');
        return view(row);
      },
    );
  }

  private async assertNameFree(
    tx: DbTransaction,
    name: string,
    exceptId?: string,
  ): Promise<void> {
    const [existing] = await tx
      .select({ id: academyPlans.id })
      .from(academyPlans)
      .where(
        and(
          eq(academyPlans.name, name),
          exceptId ? ne(academyPlans.id, exceptId) : undefined,
        ),
      );
    if (existing) {
      throw problem(
        409,
        ErrorCodes.PLAN_NAME_TAKEN,
        'A plan with this name already exists',
      );
    }
  }
}
