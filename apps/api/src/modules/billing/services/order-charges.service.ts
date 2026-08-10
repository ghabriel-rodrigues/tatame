import { Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { charges, type DbTransaction } from '@tatame/db';
import { ErrorCodes, problem } from '../../../common/problem.js';
import type { BillingActor } from './provider-events.service.js';

export interface IssueOrderChargeInput {
  tenantId: string;
  orderId: string;
  /**
   * The buyer's student row when the buyer is a student (Carteira histórico
   * addressing); NULL for professor buyers — the spec 009 STO.2 relaxation.
   */
  studentId: string | null;
  amountCents: number;
  /** Today in the tenant timezone (YYYY-MM-DD) — store orders are due now. */
  dueDate: string;
}

/**
 * The internal service seam the store module uses to issue/cancel order-origin
 * charges (spec 009) — the exact twin of {@link EventChargesService}: money
 * rows stay billing's, whatever their origin, and the store never touches the
 * provider port. Both methods run INSIDE the caller's tenant transaction so an
 * order and its charge commit (or roll back) together, and both audit through
 * the same `audit_append` seam as every other money mutation. `guardian_id`
 * stays NULL on order charges (no responsável store in v1).
 */
@Injectable()
export class OrderChargesService {
  /**
   * Issues (or reuses) the open charge behind a pending order. Order creation
   * is one-shot in v1, but reuse keeps the seam idempotent under retries: an
   * existing open/overdue charge for the order is returned as-is.
   */
  async issueOrderCharge(
    tx: DbTransaction,
    actor: BillingActor,
    input: IssueOrderChargeInput,
  ): Promise<typeof charges.$inferSelect> {
    const existing = await tx
      .select()
      .from(charges)
      .where(
        and(
          eq(charges.origin, 'order'),
          eq(charges.orderId, input.orderId),
          inArray(charges.status, ['open', 'overdue']),
        ),
      );
    if (existing[0]) return existing[0];

    const [inserted] = await tx
      .insert(charges)
      .values({
        tenantId: input.tenantId,
        studentId: input.studentId,
        guardianId: null,
        origin: 'order',
        orderId: input.orderId,
        amountCents: input.amountCents,
        dueDate: input.dueDate,
        status: 'open',
      })
      .returning();
    if (!inserted) throw problem(500, ErrorCodes.INTERNAL, 'Order charge insert returned no row');

    await this.audit(tx, input.tenantId, actor, 'billing.charge.created', inserted.id, {
      origin: 'order',
      order_id: input.orderId,
      amount_cents: input.amountCents,
    });
    return inserted;
  }

  /**
   * Cancels the open/overdue order-origin charge behind one order (the buyer
   * abandoning a still-pending purchase). Settled money is never touched — a
   * paid order is undone only through the audited admin refund path.
   */
  async cancelOpenOrderCharges(
    tx: DbTransaction,
    actor: BillingActor,
    tenantId: string,
    orderId: string,
  ): Promise<Array<typeof charges.$inferSelect>> {
    const canceled = await tx
      .update(charges)
      .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(charges.origin, 'order'),
          eq(charges.orderId, orderId),
          inArray(charges.status, ['open', 'overdue']),
        ),
      )
      .returning();
    for (const row of canceled) {
      await this.audit(tx, tenantId, actor, 'billing.charge.canceled', row.id, {
        origin: 'order',
        order_id: row.orderId,
        amount_cents: row.amountCents,
      });
    }
    return canceled;
  }

  /** In-transaction audit via the append-only SECURITY DEFINER seam. */
  private async audit(
    tx: DbTransaction,
    tenantId: string,
    actor: BillingActor,
    action: string,
    chargeId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await tx.execute(sql`
      SELECT audit_append(
        ${tenantId}::uuid,
        ${actor.userId}::uuid,
        ${actor.impersonatorUserId}::uuid,
        ${action},
        'charge',
        ${chargeId}::text,
        ${JSON.stringify(metadata)}::jsonb
      )
    `);
  }
}
