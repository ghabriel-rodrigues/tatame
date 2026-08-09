import { Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { charges, eventRegistrations, type DbTransaction } from '@tatame/db';
import { ErrorCodes, problem } from '../../../common/problem.js';
import type { BillingActor } from './provider-events.service.js';

export interface IssueEventChargeInput {
  tenantId: string;
  studentId: string;
  /** Bill-to when a guardian registers a dependent (like a mensalidade). */
  guardianId: string | null;
  eventRegistrationId: string;
  amountCents: number;
  /** The event date in the tenant timezone (YYYY-MM-DD). */
  dueDate: string;
}

/**
 * The internal service seam the events module uses to issue/cancel
 * event-origin charges (spec 008): money rows stay billing's, whatever their
 * origin — events never touches the provider port. Both methods run INSIDE
 * the caller's tenant transaction so a registration and its charge commit (or
 * roll back) together, and both audit through the same `audit_append` seam as
 * every other money mutation.
 */
@Injectable()
export class EventChargesService {
  /**
   * Issues (or reuses) the open charge behind a `pending_payment`
   * registration. Reopening the Pix sheet must not double-bill: an existing
   * open/overdue charge for the registration is returned as-is; a new charge
   * is inserted only when none is payable (first registration, or
   * re-registering after a cancel voided the previous charge).
   */
  async issueEventCharge(
    tx: DbTransaction,
    actor: BillingActor,
    input: IssueEventChargeInput,
  ): Promise<typeof charges.$inferSelect> {
    const existing = await tx
      .select()
      .from(charges)
      .where(
        and(
          eq(charges.origin, 'event'),
          eq(charges.eventRegistrationId, input.eventRegistrationId),
          inArray(charges.status, ['open', 'overdue']),
        ),
      );
    if (existing[0]) return existing[0];

    const [inserted] = await tx
      .insert(charges)
      .values({
        tenantId: input.tenantId,
        studentId: input.studentId,
        guardianId: input.guardianId,
        origin: 'event',
        eventRegistrationId: input.eventRegistrationId,
        amountCents: input.amountCents,
        dueDate: input.dueDate,
        status: 'open',
      })
      .returning();
    if (!inserted) throw problem(500, ErrorCodes.INTERNAL, 'Event charge insert returned no row');

    await this.audit(tx, input.tenantId, actor, 'billing.charge.created', inserted.id, {
      origin: 'event',
      event_registration_id: input.eventRegistrationId,
      amount_cents: input.amountCents,
    });
    return inserted;
  }

  /**
   * Cancels the open/overdue event-origin charges behind the given
   * registrations (registration self-cancel: one id; admin event cancel: all
   * of the event's). Settled money is never touched — a paid charge is undone
   * only through the audited refund path.
   */
  async cancelOpenEventCharges(
    tx: DbTransaction,
    actor: BillingActor,
    tenantId: string,
    eventRegistrationIds: string[],
  ): Promise<Array<typeof charges.$inferSelect>> {
    if (eventRegistrationIds.length === 0) return [];
    const canceled = await tx
      .update(charges)
      .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
      .where(
        and(
          eq(charges.origin, 'event'),
          inArray(charges.eventRegistrationId, eventRegistrationIds),
          inArray(charges.status, ['open', 'overdue']),
        ),
      )
      .returning();
    for (const row of canceled) {
      await this.audit(tx, tenantId, actor, 'billing.charge.canceled', row.id, {
        origin: 'event',
        event_registration_id: row.eventRegistrationId,
        amount_cents: row.amountCents,
      });
    }
    return canceled;
  }

  /** Every open/overdue event-origin charge of one event (cancel cascade scope). */
  async openChargesOfEvent(
    tx: DbTransaction,
    eventId: string,
  ): Promise<Array<typeof charges.$inferSelect>> {
    return tx
      .select({ charge: charges })
      .from(charges)
      .innerJoin(
        eventRegistrations,
        and(
          eq(eventRegistrations.tenantId, charges.tenantId),
          eq(eventRegistrations.id, charges.eventRegistrationId),
        ),
      )
      .where(
        and(
          eq(charges.origin, 'event'),
          eq(eventRegistrations.eventId, eventId),
          inArray(charges.status, ['open', 'overdue']),
        ),
      )
      .then((rows) => rows.map((r) => r.charge));
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
