import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, eq, sql } from 'drizzle-orm';
import {
  eventRegistrations,
  events,
  guardians,
  students,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { localDate } from '../../attendance/lib/time.js';
import { EventChargesService } from '../../billing/services/event-charges.service.js';
import type { BillingActor } from '../../billing/services/provider-events.service.js';
import {
  EVENTS_REGISTRATION_CANCELED,
  EVENTS_REGISTRATION_CONFIRMED,
  type RegistrationCanceledEvent,
  type RegistrationConfirmedEvent,
} from '../events.events.js';
import type { EventRegistrationStateView } from '../events.types.js';

/** Who the registration is for: the caller themself or an owned dependent. */
export type RegistrationTarget = { kind: 'self' } | { kind: 'dependent'; studentId: string };

export interface RegisterResult {
  registration: EventRegistrationStateView;
  /**
   * Paid events: the open event-origin charge the client pays through the
   * EXISTING wallet rails (Pix sheet + simulate). Null on free events and on
   * already-confirmed no-ops.
   */
  chargeId: string | null;
}

const asActor = (ctx: AuthContext): BillingActor => ({
  userId: ctx.userId,
  impersonatorUserId: ctx.impersonatorUserId,
});

/**
 * Registration write flows (spec 008): free = confirmar direto, paid =
 * pending_payment + event-origin charge over the billing seam — the aluno
 * confirming themself and the responsável confirming a dependent write the
 * same row shape (`confirmed_by_user_id` records the acting user). One row
 * per (event, student): cancel-and-reconfirm flips status, never duplicates.
 */
@Injectable()
export class EventRegistrationsService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly eventCharges: EventChargesService,
    private readonly emitter: EventEmitter2,
  ) {}

  /** POST registration — free ⇒ confirmed; paid ⇒ pending + charge. */
  async register(
    ctx: AuthContext & { tenantId: string },
    eventId: string,
    target: RegistrationTarget,
  ): Promise<RegisterResult> {
    let confirmed: RegistrationConfirmedEvent | null = null;
    const result = await withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx): Promise<RegisterResult> => {
        const { student, guardianId } = await this.resolveTarget(tx, ctx, target);
        const event = await this.registrableEvent(tx, eventId);
        const existing = await this.registrationOf(tx, eventId, student.id);

        // Idempotent re-tap: an already-confirmed registration is final here
        // (free re-confirm and paid re-pay are both no-ops).
        if (existing?.status === 'confirmed') {
          return {
            registration: { id: existing.id, status: 'confirmed', chargeId: null },
            chargeId: null,
          };
        }

        if (event.priceCents === null) {
          // Gratuito = confirmar direto (story 12/19).
          const row = await this.upsert(tx, ctx, event.id, student.id, 'confirmed');
          await this.audit(tx, ctx, 'events.registration.confirmed', row.id, {
            event_id: event.id,
            student_id: student.id,
            confirmed_by_user_id: ctx.userId,
          });
          confirmed = {
            tenantId: ctx.tenantId,
            eventId: event.id,
            eventName: event.name,
            registrationId: row.id,
            studentId: student.id,
            guardianId,
            audience: guardianId ? 'guardian' : 'student',
            priceCents: null,
          };
          return { registration: { id: row.id, status: 'confirmed', chargeId: null }, chargeId: null };
        }

        // Paid: pending_payment + the event-origin charge on the billing seam
        // (guardian bill-to when the responsável registers a dependent). The
        // client then rides the existing Pix sheet / simulate rails.
        const row = await this.upsert(tx, ctx, event.id, student.id, 'pending_payment');
        const charge = await this.eventCharges.issueEventCharge(tx, asActor(ctx), {
          tenantId: ctx.tenantId,
          studentId: student.id,
          guardianId,
          eventRegistrationId: row.id,
          amountCents: event.priceCents,
          dueDate: event.startsAt ? localDate(event.startsAt) : localDate(),
        });
        return {
          registration: { id: row.id, status: 'pending_payment', chargeId: charge.id },
          chargeId: charge.id,
        };
      },
    );
    // Post-commit emission — only committed confirmations reach listeners.
    if (confirmed) this.emitter.emit(EVENTS_REGISTRATION_CONFIRMED, confirmed);
    return result;
  }

  /**
   * DELETE registration — allowed on free or still-pending rows; a paid,
   * settled registration is undone only by the audited admin refund (409
   * `event.registration_settled`). Canceling a pending row voids its open
   * charge in the same transaction.
   */
  async cancel(
    ctx: AuthContext & { tenantId: string },
    eventId: string,
    target: RegistrationTarget,
  ): Promise<void> {
    let canceled: RegistrationCanceledEvent | null = null;
    await withTenant(
      this.appDb.db,
      { tenantId: ctx.tenantId, userId: ctx.userId },
      async (tx) => {
        const { student, guardianId } = await this.resolveTarget(tx, ctx, target);
        const [event] = await tx.select().from(events).where(eq(events.id, eventId));
        // Drafts stay backstage — same 404 shape as a foreign id.
        if (!event || event.status === 'draft') {
          throw problem(404, ErrorCodes.NOT_FOUND, 'Event not found');
        }
        const existing = await this.registrationOf(tx, eventId, student.id);
        if (!existing || existing.status === 'canceled') {
          throw problem(404, ErrorCodes.NOT_FOUND, 'No active registration for this event');
        }
        if (event.priceCents !== null && existing.status === 'confirmed') {
          throw problem(
            409,
            ErrorCodes.EVENT_REGISTRATION_SETTLED,
            'A paid, confirmed registration is only undone by an admin refund',
          );
        }

        await tx
          .update(eventRegistrations)
          .set({ status: 'canceled', canceledAt: new Date(), updatedAt: new Date() })
          .where(eq(eventRegistrations.id, existing.id));
        if (existing.status === 'pending_payment') {
          await this.eventCharges.cancelOpenEventCharges(tx, asActor(ctx), ctx.tenantId, [
            existing.id,
          ]);
        }
        await this.audit(tx, ctx, 'events.registration.canceled', existing.id, {
          event_id: event.id,
          student_id: student.id,
          via: 'self',
        });
        canceled = {
          tenantId: ctx.tenantId,
          eventId: event.id,
          eventName: event.name,
          registrationId: existing.id,
          studentId: student.id,
          guardianId,
          audience: guardianId ? 'guardian' : 'student',
          priceCents: event.priceCents,
          via: 'self',
        };
      },
    );
    if (canceled) this.emitter.emit(EVENTS_REGISTRATION_CANCELED, canceled);
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /**
   * Self: the caller's active student record. Dependent: an active student
   * linked to the calling guardian — a foreign/unknown student id behaves as
   * 404, never 403 (story 21 + the established scoping pattern).
   */
  private async resolveTarget(
    tx: DbTransaction,
    ctx: AuthContext,
    target: RegistrationTarget,
  ): Promise<{ student: { id: string }; guardianId: string | null }> {
    if (target.kind === 'self') {
      const [student] = await tx
        .select({ id: students.id })
        .from(students)
        .where(and(eq(students.userId, ctx.userId), eq(students.status, 'active')));
      if (!student) {
        throw problem(404, ErrorCodes.NOT_FOUND, 'No active student record for this account');
      }
      return { student, guardianId: null };
    }
    const [guardian] = await tx
      .select({ id: guardians.id })
      .from(guardians)
      .where(eq(guardians.userId, ctx.userId));
    const [dependent] = guardian
      ? await tx
          .select({ id: students.id })
          .from(students)
          .where(
            and(
              eq(students.id, target.studentId),
              eq(students.guardianId, guardian.id),
              eq(students.status, 'active'),
            ),
          )
      : [];
    if (!guardian || !dependent) {
      throw problem(404, ErrorCodes.NOT_FOUND, 'Dependent not found');
    }
    return { student: dependent, guardianId: guardian.id };
  }

  /**
   * The event a registration may land on. Unknown/draft = 404 (backstage);
   * canceled = 422 `event.not_published` (a stale reference to something that
   * WAS public deserves a stable, explainable refusal).
   */
  private async registrableEvent(
    tx: DbTransaction,
    eventId: string,
  ): Promise<typeof events.$inferSelect> {
    const [event] = await tx.select().from(events).where(eq(events.id, eventId));
    if (!event || event.status === 'draft') {
      throw problem(404, ErrorCodes.NOT_FOUND, 'Event not found');
    }
    if (event.status !== 'published') {
      throw problem(
        422,
        ErrorCodes.EVENT_NOT_PUBLISHED,
        'Registrations are only accepted on published events',
      );
    }
    return event;
  }

  private async registrationOf(tx: DbTransaction, eventId: string, studentId: string) {
    const [row] = await tx
      .select()
      .from(eventRegistrations)
      .where(
        and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.studentId, studentId)),
      );
    return row ?? null;
  }

  /** One row per (event, student): insert or flip the existing row's status. */
  private async upsert(
    tx: DbTransaction,
    ctx: AuthContext & { tenantId: string },
    eventId: string,
    studentId: string,
    status: 'pending_payment' | 'confirmed',
  ): Promise<typeof eventRegistrations.$inferSelect> {
    const existing = await this.registrationOf(tx, eventId, studentId);
    if (existing) {
      const [updated] = await tx
        .update(eventRegistrations)
        .set({
          status,
          confirmedByUserId: ctx.userId,
          canceledAt: null,
          updatedAt: new Date(),
        })
        .where(eq(eventRegistrations.id, existing.id))
        .returning();
      if (!updated) throw problem(500, ErrorCodes.INTERNAL, 'Registration update returned no row');
      return updated;
    }
    const [inserted] = await tx
      .insert(eventRegistrations)
      .values({
        tenantId: ctx.tenantId,
        eventId,
        studentId,
        confirmedByUserId: ctx.userId,
        status,
      })
      .returning();
    if (!inserted) throw problem(500, ErrorCodes.INTERNAL, 'Registration insert returned no row');
    return inserted;
  }

  private async audit(
    tx: DbTransaction,
    ctx: AuthContext & { tenantId: string },
    action: string,
    registrationId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await tx.execute(sql`
      SELECT audit_append(
        ${ctx.tenantId}::uuid,
        ${ctx.userId}::uuid,
        ${ctx.impersonatorUserId}::uuid,
        ${action},
        'event_registration',
        ${registrationId}::text,
        ${JSON.stringify(metadata)}::jsonb
      )
    `);
  }
}
