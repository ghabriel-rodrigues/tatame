import { Inject, Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { and, asc, eq, inArray, ne, sql, sum } from 'drizzle-orm';
import {
  charges,
  eventRegistrations,
  events,
  memberships,
  students,
  users,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import { EventChargesService } from '../../billing/services/event-charges.service.js';
import type { BillingActor } from '../../billing/services/provider-events.service.js';
import {
  EVENTS_ANNOUNCEMENT_REQUESTED,
  EVENTS_EVENT_CANCELED,
  EVENTS_EVENT_PUBLISHED,
  type AnnouncementRequestedEvent,
  type EventAudienceEntry,
  type EventCanceledEvent,
  type EventPublishedEvent,
} from '../events.events.js';
import { eventTimeParts, type EventCardView } from '../events.types.js';

export interface CreateEventInput {
  name: string;
  description?: string | null;
  bannerPreset?: string;
  location?: string | null;
  /** ISO instant. */
  startsAt?: string | null;
  priceCents?: number | null;
  responsibleUserId: string;
  /** Creating and publishing are separate gestures — default draft (story 3). */
  status?: 'draft' | 'published';
}

export type UpdateEventInput = Partial<Omit<CreateEventInput, 'status'>>;

export interface EventTotalsView {
  /** Non-canceled registrations (pending + confirmed). */
  inscritos: number;
  confirmados: number;
  /** Settled event-origin money (paid charges; refunds excluded). */
  arrecadadoCents: number;
}

export interface AdminEventView extends EventCardView {
  description: string | null;
  status: 'draft' | 'published' | 'canceled';
  responsible: { userId: string; fullName: string };
  totals: EventTotalsView;
}

export interface AdminRegistrationRowView {
  id: string;
  student: { id: string; fullName: string };
  status: 'pending_payment' | 'confirmed' | 'canceled';
  /** Who confirmed — the aluno themself or the responsável. */
  confirmedBy: { userId: string; fullName: string };
  /** Settled amount for this registration (null while unpaid / free). */
  paidAmountCents: number | null;
}

export interface AdminEventRegistrationsView {
  event: AdminEventView;
  registrations: AdminRegistrationRowView[];
  totals: EventTotalsView;
}

const asActor = (ctx: AuthContext): BillingActor => ({
  userId: ctx.userId,
  impersonatorUserId: ctx.impersonatorUserId,
});

/**
 * Admin Eventos console (spec 008, EVT.4): CRUD + the draft → published →
 * canceled lifecycle (never hard-delete — story 5), the inscritos view with
 * confirmados/inscritos/arrecadado totals, and Comunicar (domain event +
 * audit ONLY — delivery is the notifications phase). Money side effects go
 * through the billing seam; every transition is audited in-transaction with
 * impersonation attribution.
 */
@Injectable()
export class AdminEventsService {
  constructor(
    @Inject(APP_DB) private readonly appDb: DbHandle,
    private readonly eventCharges: EventChargesService,
    private readonly emitter: EventEmitter2,
  ) {}

  /** GET /admin/events — drafts first, then chronological, with totals. */
  async list(
    ctx: AuthContext & { tenantId: string },
  ): Promise<{ events: AdminEventView[] }> {
    return withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
      const rows = await tx.select().from(events);
      rows.sort((a, b) => {
        const draftRank = (e: typeof a) => (e.status === 'draft' ? 0 : 1);
        if (draftRank(a) !== draftRank(b)) return draftRank(a) - draftRank(b);
        const aTime = a.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        const bTime = b.startsAt?.getTime() ?? Number.MAX_SAFE_INTEGER;
        if (aTime !== bTime) return aTime - bTime;
        return a.createdAt.getTime() - b.createdAt.getTime();
      });
      const views = await this.toViews(tx, rows);
      return { events: views };
    });
  }

  /** POST /admin/events — create as Rascunho (or straight to published). */
  async create(
    ctx: AuthContext & { tenantId: string },
    input: CreateEventInput,
  ): Promise<AdminEventView> {
    let published: EventPublishedEvent | null = null;
    const view = await withTenant(
      this.appDb.db,
      this.tenantCtx(ctx),
      async (tx) => {
        await this.requireResponsible(tx, input.responsibleUserId);
        const status = input.status ?? 'draft';
        const startsAt = input.startsAt ? new Date(input.startsAt) : null;
        if (status === 'published')
          this.assertPublishable(startsAt, input.location ?? null);

        const [row] = await tx
          .insert(events)
          .values({
            tenantId: ctx.tenantId,
            name: input.name,
            description: input.description ?? null,
            ...(input.bannerPreset ? { bannerPreset: input.bannerPreset } : {}),
            location: input.location ?? null,
            startsAt,
            priceCents: input.priceCents ?? null,
            responsibleUserId: input.responsibleUserId,
            status,
          })
          .returning();
        if (!row)
          throw problem(
            500,
            ErrorCodes.INTERNAL,
            'Event insert returned no row',
          );

        await this.audit(tx, ctx, 'events.event.created', 'event', row.id, {
          name: row.name,
          status: row.status,
          price_cents: row.priceCents,
        });
        if (status === 'published') {
          await this.audit(tx, ctx, 'events.event.published', 'event', row.id, {
            starts_at: row.startsAt?.toISOString() ?? null,
          });
          published = this.publishedEvent(ctx.tenantId, row);
        }
        const [view] = await this.toViews(tx, [row]);
        return view!;
      },
    );
    if (published) this.emitter.emit(EVENTS_EVENT_PUBLISHED, published);
    return view;
  }

  /** PATCH /admin/events/:id — edit; canceled events are frozen history. */
  async update(
    ctx: AuthContext & { tenantId: string },
    eventId: string,
    input: UpdateEventInput,
  ): Promise<AdminEventView> {
    return withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
      const event = await this.requireEvent(tx, eventId);
      if (event.status === 'canceled') {
        throw problem(
          409,
          ErrorCodes.CONFLICT,
          'A canceled event cannot be edited',
        );
      }
      if (input.responsibleUserId !== undefined) {
        await this.requireResponsible(tx, input.responsibleUserId);
      }

      const nextStartsAt =
        input.startsAt !== undefined
          ? input.startsAt
            ? new Date(input.startsAt)
            : null
          : event.startsAt;
      const nextLocation =
        input.location !== undefined ? input.location : event.location;
      // A published event must keep its date/local — the friendly face of
      // the events_published_ck constraint (story 4).
      if (event.status === 'published')
        this.assertPublishable(nextStartsAt, nextLocation);

      const [row] = await tx
        .update(events)
        .set({
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.description !== undefined
            ? { description: input.description }
            : {}),
          ...(input.bannerPreset !== undefined
            ? { bannerPreset: input.bannerPreset }
            : {}),
          ...(input.location !== undefined ? { location: input.location } : {}),
          ...(input.startsAt !== undefined ? { startsAt: nextStartsAt } : {}),
          ...(input.priceCents !== undefined
            ? { priceCents: input.priceCents }
            : {}),
          ...(input.responsibleUserId !== undefined
            ? { responsibleUserId: input.responsibleUserId }
            : {}),
          updatedAt: new Date(),
        })
        .where(eq(events.id, event.id))
        .returning();
      if (!row)
        throw problem(500, ErrorCodes.INTERNAL, 'Event update returned no row');

      await this.audit(tx, ctx, 'events.event.updated', 'event', row.id, {
        fields: Object.keys(input),
      });
      const [view] = await this.toViews(tx, [row]);
      return view!;
    });
  }

  /** POST /admin/events/:id/publish — requires date + local (story 4). */
  async publish(
    ctx: AuthContext & { tenantId: string },
    eventId: string,
  ): Promise<AdminEventView> {
    let published: EventPublishedEvent | null = null;
    const view = await withTenant(
      this.appDb.db,
      this.tenantCtx(ctx),
      async (tx) => {
        const event = await this.requireEvent(tx, eventId);
        if (event.status !== 'draft') {
          throw problem(
            409,
            ErrorCodes.CONFLICT,
            `Only drafts can be published (event is ${event.status})`,
          );
        }
        this.assertPublishable(event.startsAt, event.location);

        const [row] = await tx
          .update(events)
          .set({ status: 'published', updatedAt: new Date() })
          .where(eq(events.id, event.id))
          .returning();
        if (!row)
          throw problem(
            500,
            ErrorCodes.INTERNAL,
            'Event publish returned no row',
          );

        await this.audit(tx, ctx, 'events.event.published', 'event', row.id, {
          starts_at: row.startsAt?.toISOString() ?? null,
        });
        published = this.publishedEvent(ctx.tenantId, row);
        const [view] = await this.toViews(tx, [row]);
        return view!;
      },
    );
    if (published) this.emitter.emit(EVENTS_EVENT_PUBLISHED, published);
    return view;
  }

  /**
   * POST /admin/events/:id/cancel — never hard-deletes: open event charges
   * are voided, pending registrations flip canceled (confirmed rows keep
   * their history), and the domain event carries the registered audience.
   */
  async cancel(
    ctx: AuthContext & { tenantId: string },
    eventId: string,
  ): Promise<AdminEventView> {
    let canceled: EventCanceledEvent | null = null;
    const view = await withTenant(
      this.appDb.db,
      this.tenantCtx(ctx),
      async (tx) => {
        const event = await this.requireEvent(tx, eventId);
        if (event.status === 'canceled') {
          throw problem(409, ErrorCodes.CONFLICT, 'Event is already canceled');
        }

        const registered = await this.audienceOf(tx, event.id);
        const pending = await tx
          .select({
            id: eventRegistrations.id,
            studentId: eventRegistrations.studentId,
          })
          .from(eventRegistrations)
          .where(
            and(
              eq(eventRegistrations.eventId, event.id),
              eq(eventRegistrations.status, 'pending_payment'),
            ),
          );

        // Nobody is billed for a dead event (story 8): void the open charges,
        // then cancel the still-pending registrations.
        await this.eventCharges.cancelOpenEventCharges(
          tx,
          asActor(ctx),
          ctx.tenantId,
          pending.map((p) => p.id),
        );
        if (pending.length > 0) {
          await tx
            .update(eventRegistrations)
            .set({
              status: 'canceled',
              canceledAt: new Date(),
              updatedAt: new Date(),
            })
            .where(
              inArray(
                eventRegistrations.id,
                pending.map((p) => p.id),
              ),
            );
          for (const registration of pending) {
            await this.audit(
              tx,
              ctx,
              'events.registration.canceled',
              'event_registration',
              registration.id,
              {
                event_id: event.id,
                student_id: registration.studentId,
                via: 'event_canceled',
              },
            );
          }
        }

        const [row] = await tx
          .update(events)
          .set({
            status: 'canceled',
            canceledAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(events.id, event.id))
          .returning();
        if (!row)
          throw problem(
            500,
            ErrorCodes.INTERNAL,
            'Event cancel returned no row',
          );

        await this.audit(tx, ctx, 'events.event.canceled', 'event', row.id, {
          name: row.name,
          canceled_open_charges: pending.length,
        });
        canceled = {
          tenantId: ctx.tenantId,
          eventId: row.id,
          name: row.name,
          audience: registered,
        };
        const [view] = await this.toViews(tx, [row]);
        return view!;
      },
    );
    if (canceled) this.emitter.emit(EVENTS_EVENT_CANCELED, canceled);
    return view;
  }

  /** GET /admin/events/:id/registrations — inscritos + totals (story 6). */
  async registrations(
    ctx: AuthContext & { tenantId: string },
    eventId: string,
  ): Promise<AdminEventRegistrationsView> {
    return withTenant(this.appDb.db, this.tenantCtx(ctx), async (tx) => {
      const event = await this.requireEvent(tx, eventId);

      const rows = await tx
        .select({
          registration: eventRegistrations,
          studentName: students.fullName,
          confirmedByName: users.fullName,
        })
        .from(eventRegistrations)
        .innerJoin(
          students,
          and(
            eq(students.tenantId, eventRegistrations.tenantId),
            eq(students.id, eventRegistrations.studentId),
          ),
        )
        .innerJoin(users, eq(users.id, eventRegistrations.confirmedByUserId))
        .where(eq(eventRegistrations.eventId, event.id))
        .orderBy(asc(students.fullName));

      const paidByRegistration = new Map<string, number>();
      if (rows.length > 0) {
        const paid = await tx
          .select({
            eventRegistrationId: charges.eventRegistrationId,
            amountCents: charges.amountCents,
          })
          .from(charges)
          .where(
            and(
              eq(charges.origin, 'event'),
              inArray(
                charges.eventRegistrationId,
                rows.map((r) => r.registration.id),
              ),
              eq(charges.status, 'paid'),
            ),
          );
        for (const row of paid) {
          if (row.eventRegistrationId) {
            paidByRegistration.set(row.eventRegistrationId, row.amountCents);
          }
        }
      }

      const [view] = await this.toViews(tx, [event]);
      return {
        event: view!,
        registrations: rows.map(
          ({ registration, studentName, confirmedByName }) => ({
            id: registration.id,
            student: { id: registration.studentId, fullName: studentName },
            status: registration.status,
            confirmedBy: {
              userId: registration.confirmedByUserId,
              fullName: confirmedByName,
            },
            paidAmountCents: paidByRegistration.get(registration.id) ?? null,
          }),
        ),
        totals: view!.totals,
      };
    });
  }

  /**
   * POST /admin/events/:id/announce — Comunicar: exactly one domain event +
   * one audit row, nothing else (story 28). Delivery plugs in later.
   */
  async announce(
    ctx: AuthContext & { tenantId: string },
    eventId: string,
  ): Promise<{ recipients: number }> {
    let announcement: AnnouncementRequestedEvent | null = null;
    const result = await withTenant(
      this.appDb.db,
      this.tenantCtx(ctx),
      async (tx) => {
        const event = await this.requireEvent(tx, eventId);
        if (event.status !== 'published') {
          throw problem(
            422,
            ErrorCodes.EVENT_NOT_PUBLISHED,
            'Comunicar is only available on published events',
          );
        }
        const audience = await this.audienceOf(tx, event.id);
        await this.audit(tx, ctx, 'events.event.announced', 'event', event.id, {
          name: event.name,
          recipients: audience.length,
        });
        announcement = {
          tenantId: ctx.tenantId,
          eventId: event.id,
          name: event.name,
          audience,
        };
        return { recipients: audience.length };
      },
    );
    if (announcement)
      this.emitter.emit(EVENTS_ANNOUNCEMENT_REQUESTED, announcement);
    return result;
  }

  // ── internals ─────────────────────────────────────────────────────────────

  private tenantCtx(ctx: AuthContext & { tenantId: string }) {
    return { tenantId: ctx.tenantId, userId: ctx.userId };
  }

  private async requireEvent(
    tx: DbTransaction,
    eventId: string,
  ): Promise<typeof events.$inferSelect> {
    const [event] = await tx
      .select()
      .from(events)
      .where(eq(events.id, eventId));
    if (!event) throw problem(404, ErrorCodes.NOT_FOUND, 'Event not found');
    return event;
  }

  /** Publishing (or staying published) requires date and local (story 4). */
  private assertPublishable(
    startsAt: Date | null,
    location: string | null,
  ): void {
    const missing: Array<{ field: string; messages: string[] }> = [];
    if (!startsAt)
      missing.push({ field: 'startsAt', messages: ['Required to publish'] });
    if (!location)
      missing.push({ field: 'location', messages: ['Required to publish'] });
    if (missing.length > 0) {
      throw problem(
        422,
        ErrorCodes.EVENT_PUBLISH_REQUIREMENTS,
        'Publishing requires a date and a local — students never see an undated event',
        missing,
      );
    }
  }

  /**
   * The "Responsável: Prof. …" line must point at an active professor or
   * admin membership of THIS academy (tenant membership validated in the
   * service, per the schema note).
   */
  private async requireResponsible(
    tx: DbTransaction,
    userId: string,
  ): Promise<void> {
    const [membership] = await tx
      .select({ id: memberships.id })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.status, 'active'),
          inArray(memberships.role, ['professor', 'admin']),
        ),
      );
    if (!membership) {
      throw problem(
        422,
        ErrorCodes.VALIDATION_FAILED,
        'Request validation failed',
        [
          {
            field: 'responsibleUserId',
            messages: ['Must be an active professor or admin of this academy'],
          },
        ],
      );
    }
  }

  /** Registered (non-canceled) audience with the guardian variant resolved. */
  private async audienceOf(
    tx: DbTransaction,
    eventId: string,
  ): Promise<EventAudienceEntry[]> {
    const rows = await tx
      .select({
        studentId: eventRegistrations.studentId,
        guardianId: students.guardianId,
      })
      .from(eventRegistrations)
      .innerJoin(
        students,
        and(
          eq(students.tenantId, eventRegistrations.tenantId),
          eq(students.id, eventRegistrations.studentId),
        ),
      )
      .where(
        and(
          eq(eventRegistrations.eventId, eventId),
          ne(eventRegistrations.status, 'canceled'),
        ),
      );
    return rows.map((row) => ({
      studentId: row.studentId,
      guardianId: row.guardianId,
      audience: row.guardianId ? 'guardian' : 'student',
    }));
  }

  /** Card views with responsible names + totals, preserving input order. */
  private async toViews(
    tx: DbTransaction,
    rows: Array<typeof events.$inferSelect>,
  ): Promise<AdminEventView[]> {
    if (rows.length === 0) return [];
    const eventIds = rows.map((r) => r.id);

    const registrationCounts = await tx
      .select({
        eventId: eventRegistrations.eventId,
        status: eventRegistrations.status,
        total: sql<number>`count(*)`,
      })
      .from(eventRegistrations)
      .where(inArray(eventRegistrations.eventId, eventIds))
      .groupBy(eventRegistrations.eventId, eventRegistrations.status);

    const arrecadado = await tx
      .select({
        eventId: eventRegistrations.eventId,
        total: sum(charges.amountCents),
      })
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
          inArray(eventRegistrations.eventId, eventIds),
          eq(charges.status, 'paid'),
        ),
      )
      .groupBy(eventRegistrations.eventId);
    const arrecadadoByEvent = new Map(
      arrecadado.map((r) => [r.eventId, Number(r.total ?? 0)]),
    );

    const totalsByEvent = new Map<string, EventTotalsView>();
    for (const id of eventIds) {
      totalsByEvent.set(id, {
        inscritos: 0,
        confirmados: 0,
        arrecadadoCents: arrecadadoByEvent.get(id) ?? 0,
      });
    }
    for (const row of registrationCounts) {
      const totals = totalsByEvent.get(row.eventId);
      if (!totals) continue;
      const n = Number(row.total);
      if (row.status !== 'canceled') totals.inscritos += n;
      if (row.status === 'confirmed') totals.confirmados += n;
    }

    const responsibleIds = [...new Set(rows.map((r) => r.responsibleUserId))];
    const names = await tx
      .select({ id: users.id, fullName: users.fullName })
      .from(users)
      .where(inArray(users.id, responsibleIds));
    const nameById = new Map(names.map((n) => [n.id, n.fullName]));

    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      bannerPreset: row.bannerPreset,
      location: row.location,
      ...eventTimeParts(row.startsAt),
      priceCents: row.priceCents,
      description: row.description,
      status: row.status,
      responsible: {
        userId: row.responsibleUserId,
        fullName: nameById.get(row.responsibleUserId) ?? '',
      },
      totals: totalsByEvent.get(row.id) ?? {
        inscritos: 0,
        confirmados: 0,
        arrecadadoCents: 0,
      },
    }));
  }

  private publishedEvent(
    tenantId: string,
    row: typeof events.$inferSelect,
  ): EventPublishedEvent {
    return {
      tenantId,
      eventId: row.id,
      name: row.name,
      startsAt: row.startsAt?.toISOString() ?? '',
      priceCents: row.priceCents,
    };
  }

  private async audit(
    tx: DbTransaction,
    ctx: AuthContext & { tenantId: string },
    action: string,
    targetType: string,
    targetId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await tx.execute(sql`
      SELECT audit_append(
        ${ctx.tenantId}::uuid,
        ${ctx.userId}::uuid,
        ${ctx.impersonatorUserId}::uuid,
        ${action},
        ${targetType},
        ${targetId}::text,
        ${JSON.stringify(metadata)}::jsonb
      )
    `);
  }
}
