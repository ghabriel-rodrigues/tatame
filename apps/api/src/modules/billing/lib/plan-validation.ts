import { eq } from 'drizzle-orm';
import { academyPlans, type DbTransaction } from '@tatame/db';
import { ErrorCodes, problem } from '../../../common/problem.js';

/**
 * Plan-assignment validation shared by admin student create/update and
 * invite create (spec 006, BIL.10 — closes the Phase-1/3 stub): a dangling
 * plan id becomes a clean 404 (`plan.not_found`) and an archived plan
 * refuses NEW assignment with 409 (`plan.archived`) — instead of the
 * composite-FK constraint 500 the plain-uuid stub used to allow. Runs inside
 * the caller's tenant transaction (RLS hides foreign plans, so cross-tenant
 * ids are 404 by construction).
 */
export async function assertAssignablePlan(
  tx: DbTransaction,
  academyPlanId: string,
): Promise<void> {
  const [plan] = await tx
    .select({ id: academyPlans.id, isActive: academyPlans.isActive })
    .from(academyPlans)
    .where(eq(academyPlans.id, academyPlanId));
  if (!plan) throw problem(404, ErrorCodes.PLAN_NOT_FOUND, 'Plan not found in this academy');
  if (!plan.isActive) {
    throw problem(409, ErrorCodes.PLAN_ARCHIVED, 'Cannot assign an archived plan');
  }
}
