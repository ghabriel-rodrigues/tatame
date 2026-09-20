import { Inject, Injectable } from '@nestjs/common';
import { and, asc, count, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import {
  charges,
  eventRegistrations,
  events,
  guardians,
  students,
  users,
  withTenant,
  type DbHandle,
  type DbTransaction,
} from '@tatame/db';
import type { AuthContext } from '../../../common/auth-context.js';
import { ErrorCodes, problem } from '../../../common/problem.js';
import { APP_DB } from '../../../infra/db/db.module.js';
import {
  eventTimeParts,
  monthWindow,
  type CalendarEventItemView,
  type EventCardView,
  type EventRegistrationStateView,
} from '../events.types.js';

export interface AlunoUpcomingEventView extends EventCardView {
  registration: EventRegistrationStateView | null;
}

export interface AlunoEventDetailView extends EventCardView {
  description: string | null;
  responsible: { userId: string; fullName: string };
  registration: EventRegistrationStateView | null;
}

export interface ResponsavelEventDependentView {
  studentId: string;
  fullName: string;
  registration: EventRegistrationStateView | null;
}

export interface ResponsavelEventView extends EventCardView {
  description: string | null;
  /** One chip per dependent — per-child state, per the charter. */
  dependents: ResponsavelEventDependentView[];
}

export interface ProfessorUpcomingEventView extends EventCardView {
  /** The "N confirmados" of the dashboard list. */
  confirmedCount: number;
}

const tenantCtx = (ctx: AuthContext) => ({
  tenantId: ctx.tenantId,
  userId: ctx.userId,
});

/**
 * Read models of the events slice (spec 008): the aluno home/detail/agenda
 * surfaces, the responsável per-dependent list, the professor dashboard tile
 * and the AGD month buckets. Published-only for every non-admin persona
 * (story 25); month windows computed in the tenant timezone (story 30).
 * Events are academy-wide — persona differences live only in registration
 * state enrichment.
 */
@Injectable()
export class EventsQueryService {
  constructor(@Inject(APP_DB) private readonly appDb: DbHandle) {}

  // ── tx-scoped building blocks (agenda + calendars run inside their own tx) ─

  /** Published events of a tenant-local month, chronological. */
  async publishedInMonth(
    tx: DbTransaction,
    month: string,
  ): Promise<Array<typeof events.$inferSelect>> {
    const { startUtc, endUtc } = monthWindow(month);
    return tx
      .select()
      .from(events)
      .where(
        and(
          eq(events.status, 'published'),
          gte(events.startsAt, startUtc),
          lt(events.startsAt, endUtc),
        ),
      )
      .orderBy(asc(events.startsAt));
  }

  /**
   * One student's registration states over a set of events, with the open
   * charge id attached to pending rows (the Pix sheet deep link).
   */
  async statesFor(
    tx: DbTransaction,
    studentId: string,
    eventIds: string[],
  ): Promise<Map<string, EventRegistrationStateView>> {
    const map = new Map<string, EventRegistrationStateView>();
    if (eventIds.length === 0) return map;
    const rows = await tx
      .select()
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.studentId, studentId),
          inArray(eventRegistrations.eventId, eventIds),
        ),
      );
    const chargeByRegistration = await this.openChargesFor(
      tx,
      rows.filter((r) => r.status === 'pending_payment').map((r) => r.id),
    );
    for (const row of rows) {
      map.set(row.eventId, {
        id: row.id,
        status: row.status,
        chargeId: chargeByRegistration.get(row.id) ?? null,
      });
    }
    return map;
  }

  /**
   * Month events for the AGD contracts. With a `studentId` the items carry
   * the caller's own registration state (aluno agenda + aluno calendar);
   * without one they are the bare dated items (professor/admin calendars).
   */
  async monthEventItems(
    tx: DbTransaction,
    month: string,
    studentId?: string,
  ): Promise<CalendarEventItemView[]> {
    const rows = await this.publishedInMonth(tx, month);
    const states = studentId
      ? await this.statesFor(
          tx,
          studentId,
          rows.map((r) => r.id),
        )
      : null;
    return rows.map((row) => ({
      ...this.card(row),
      ...(states ? { registration: states.get(row.id) ?? null } : {}),
    }));
  }

  // ── ctx entry points ──────────────────────────────────────────────────────

  /** Aluno home "Próximos eventos" — next `limit` published, own state. */
  async alunoUpcoming(
    ctx: AuthContext & { tenantId: string },
    limit = 2,
  ): Promise<AlunoUpcomingEventView[]> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const student = await this.requireStudent(tx, ctx.userId);
      const rows = await this.upcomingPublished(tx, limit);
      const states = await this.statesFor(
        tx,
        student.id,
        rows.map((r) => r.id),
      );
      return rows.map((row) => ({
        ...this.card(row),
        registration: states.get(row.id) ?? null,
      }));
    });
  }

  /** GET /aluno/events/:id — published-only detail + own state (story 11). */
  async alunoDetail(
    ctx: AuthContext & { tenantId: string },
    eventId: string,
  ): Promise<AlunoEventDetailView> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const student = await this.requireStudent(tx, ctx.userId);
      const [row] = await tx
        .select()
        .from(events)
        .where(eq(events.id, eventId));
      // Drafts and canceled events stay backstage; cross-tenant = RLS-hidden.
      if (!row || row.status !== 'published') {
        throw problem(404, ErrorCodes.NOT_FOUND, 'Event not found');
      }
      const [responsible] = await tx
        .select({ id: users.id, fullName: users.fullName })
        .from(users)
        .where(eq(users.id, row.responsibleUserId));
      const states = await this.statesFor(tx, student.id, [row.id]);
      return {
        ...this.card(row),
        description: row.description,
        responsible: {
          userId: row.responsibleUserId,
          fullName: responsible?.fullName ?? '',
        },
        registration: states.get(row.id) ?? null,
      };
    });
  }

  /** GET /responsavel/events — published upcoming + one chip per dependent. */
  async responsavelEvents(
    ctx: AuthContext & { tenantId: string },
  ): Promise<{ events: ResponsavelEventView[] }> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const [guardian] = await tx
        .select({ id: guardians.id })
        .from(guardians)
        .where(eq(guardians.userId, ctx.userId));
      const dependents = guardian
        ? await tx
            .select({ id: students.id, fullName: students.fullName })
            .from(students)
            .where(
              and(
                eq(students.guardianId, guardian.id),
                eq(students.status, 'active'),
              ),
            )
            .orderBy(asc(students.fullName))
        : [];

      const rows = await this.upcomingPublished(tx);
      const eventIds = rows.map((r) => r.id);
      const registrations = eventIds.length
        ? await tx
            .select()
            .from(eventRegistrations)
            .where(
              and(
                inArray(eventRegistrations.eventId, eventIds),
                dependents.length
                  ? inArray(
                      eventRegistrations.studentId,
                      dependents.map((d) => d.id),
                    )
                  : sql`false`,
              ),
            )
        : [];
      const chargeByRegistration = await this.openChargesFor(
        tx,
        registrations
          .filter((r) => r.status === 'pending_payment')
          .map((r) => r.id),
      );
      const byKey = new Map(
        registrations.map((r) => [
          `${r.eventId}:${r.studentId}`,
          {
            id: r.id,
            status: r.status,
            chargeId: chargeByRegistration.get(r.id) ?? null,
          } satisfies EventRegistrationStateView,
        ]),
      );

      return {
        events: rows.map((row) => ({
          ...this.card(row),
          description: row.description,
          dependents: dependents.map((dependent) => ({
            studentId: dependent.id,
            fullName: dependent.fullName,
            registration: byKey.get(`${row.id}:${dependent.id}`) ?? null,
          })),
        })),
      };
    });
  }

  /** Professor dashboard "Eventos futuros" — read-only count + list. */
  async professorUpcoming(
    ctx: AuthContext & { tenantId: string },
  ): Promise<{ count: number; items: ProfessorUpcomingEventView[] }> {
    return withTenant(this.appDb.db, tenantCtx(ctx), async (tx) => {
      const rows = await this.upcomingPublished(tx);
      const confirmed = rows.length
        ? await tx
            .select({ eventId: eventRegistrations.eventId, total: count() })
            .from(eventRegistrations)
            .where(
              and(
                inArray(
                  eventRegistrations.eventId,
                  rows.map((r) => r.id),
                ),
                eq(eventRegistrations.status, 'confirmed'),
              ),
            )
            .groupBy(eventRegistrations.eventId)
        : [];
      const confirmedByEvent = new Map(
        confirmed.map((c) => [c.eventId, Number(c.total)]),
      );
      return {
        count: rows.length,
        items: rows.map((row) => ({
          ...this.card(row),
          confirmedCount: confirmedByEvent.get(row.id) ?? 0,
        })),
      };
    });
  }

  // ── internals ─────────────────────────────────────────────────────────────

  /** Published events from now on, chronological (the "futuros" window). */
  private async upcomingPublished(
    tx: DbTransaction,
    limit?: number,
  ): Promise<Array<typeof events.$inferSelect>> {
    const query = tx
      .select()
      .from(events)
      .where(
        and(eq(events.status, 'published'), gte(events.startsAt, new Date())),
      )
      .orderBy(asc(events.startsAt));
    return limit ? query.limit(limit) : query;
  }

  private card(row: typeof events.$inferSelect): EventCardView {
    return {
      id: row.id,
      name: row.name,
      bannerPreset: row.bannerPreset,
      location: row.location,
      ...eventTimeParts(row.startsAt),
      priceCents: row.priceCents,
    };
  }

  /** Open/overdue event-origin charge per registration (Pix deep link). */
  private async openChargesFor(
    tx: DbTransaction,
    registrationIds: string[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    if (registrationIds.length === 0) return map;
    const rows = await tx
      .select({
        id: charges.id,
        eventRegistrationId: charges.eventRegistrationId,
      })
      .from(charges)
      .where(
        and(
          eq(charges.origin, 'event'),
          inArray(charges.eventRegistrationId, registrationIds),
          inArray(charges.status, ['open', 'overdue']),
        ),
      );
    for (const row of rows) {
      if (row.eventRegistrationId) map.set(row.eventRegistrationId, row.id);
    }
    return map;
  }

  private async requireStudent(
    tx: DbTransaction,
    userId: string,
  ): Promise<{ id: string }> {
    const [student] = await tx
      .select({ id: students.id })
      .from(students)
      .where(and(eq(students.userId, userId), eq(students.status, 'active')));
    if (!student) {
      throw problem(
        404,
        ErrorCodes.NOT_FOUND,
        'No active student record for this account',
      );
    }
    return student;
  }
}
