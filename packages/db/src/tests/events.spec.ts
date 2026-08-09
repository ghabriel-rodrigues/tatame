import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createAppDb,
  createPlatformDb,
  withPlatform,
  withTenant,
  type DbHandle,
} from '../lib/client.js';
import {
  academies,
  charges,
  eventRegistrations,
  events,
  guardians,
  payments,
  students,
  users,
} from '../schema/index.js';
import { createFreshDb, testAdminUrl, type FreshDb } from '../testing/test-db.js';

/** Drizzle wraps pg errors; constraint names live on the cause chain. */
async function expectDbError(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  await expect(promise).rejects.toSatisfy((error: unknown) => {
    let current = error as (Error & { cause?: unknown }) | undefined;
    while (current) {
      if (pattern.test(current.message)) return true;
      current = current.cause as (Error & { cause?: unknown }) | undefined;
    }
    return false;
  });
}

describe('events schema (spec 008, EVT.1–EVT.2)', () => {
  let fresh: FreshDb;
  let app: DbHandle;
  let platform: DbHandle;

  let tenantA: string;
  let tenantB: string;
  let professorUserId: string;
  let studentA: string;
  let studentB: string;
  let guardianA: string;

  beforeAll(async () => {
    fresh = await createFreshDb(testAdminUrl());
    app = createAppDb(fresh.url);
    platform = createPlatformDb(fresh.url);

    await withPlatform(platform.db, async (tx) => {
      const [a] = await tx
        .insert(academies)
        .values({ name: 'Evt A', slug: 'evt-a', contactEmail: 'a@e.dev', status: 'active' })
        .returning({ id: academies.id });
      const [b] = await tx
        .insert(academies)
        .values({ name: 'Evt B', slug: 'evt-b', contactEmail: 'b@e.dev', status: 'active' })
        .returning({ id: academies.id });
      tenantA = a!.id;
      tenantB = b!.id;

      const [prof] = await tx
        .insert(users)
        .values({ email: 'prof@e.dev', fullName: 'Prof' })
        .returning({ id: users.id });
      professorUserId = prof!.id;
    });

    await withTenant(app.db, tenantA, async (tx) => {
      const [g] = await tx
        .insert(guardians)
        .values({ tenantId: tenantA, fullName: 'Guardian A' })
        .returning({ id: guardians.id });
      guardianA = g!.id;
      const [s] = await tx
        .insert(students)
        .values({ tenantId: tenantA, fullName: 'Student A', birthDate: '2000-01-01' })
        .returning({ id: students.id });
      studentA = s!.id;
    });

    await withTenant(app.db, tenantB, async (tx) => {
      const [s] = await tx
        .insert(students)
        .values({ tenantId: tenantB, fullName: 'Student B', birthDate: '2000-01-01' })
        .returning({ id: students.id });
      studentB = s!.id;
    });
  });

  afterAll(async () => {
    await app?.close();
    await platform?.close();
    await fresh?.drop();
  });

  const draftEvent = (overrides: Partial<typeof events.$inferInsert> = {}) =>
    ({
      tenantId: tenantA,
      name: `Event ${randomUUID()}`,
      responsibleUserId: professorUserId,
      status: 'draft' as const,
      ...overrides,
    }) as typeof events.$inferInsert;

  const publishedEvent = (overrides: Partial<typeof events.$inferInsert> = {}) =>
    draftEvent({
      status: 'published',
      location: 'Tatame principal',
      startsAt: new Date(Date.now() + 14 * 24 * 3600 * 1000),
      ...overrides,
    });

  describe('events lifecycle constraints (EVT.1)', () => {
    it('accepts a draft without date/local ("Rascunho · Data a definir") and defaults the banner preset', async () => {
      const [row] = await withTenant(app.db, tenantA, (tx) =>
        tx.insert(events).values(draftEvent()).returning(),
      );
      expect(row!.status).toBe('draft');
      expect(row!.startsAt).toBeNull();
      expect(row!.location).toBeNull();
      expect(row!.priceCents).toBeNull(); // NULL = gratuito
      expect(row!.bannerPreset).toBe('event-purple-pink');
    });

    it('rejects publishing without date or local (events_published_ck)', async () => {
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(events).values(publishedEvent({ startsAt: null })),
        ),
        /events_published_ck/,
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(events).values(publishedEvent({ location: null })),
        ),
        /events_published_ck/,
      );
      // The CHECK also guards the draft → published transition.
      const [draft] = await withTenant(app.db, tenantA, (tx) =>
        tx.insert(events).values(draftEvent()).returning({ id: events.id }),
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.update(events).set({ status: 'published' }).where(eq(events.id, draft!.id)),
        ),
        /events_published_ck/,
      );
      // With both filled, publishing the same row works.
      await withTenant(app.db, tenantA, (tx) =>
        tx
          .update(events)
          .set({
            status: 'published',
            location: 'Ginasio central',
            startsAt: new Date(Date.now() + 7 * 24 * 3600 * 1000),
          })
          .where(eq(events.id, draft!.id)),
      );
    });

    it('rejects non-positive prices; NULL stays gratuito, positive is paid (events_price_ck)', async () => {
      await expectDbError(
        withTenant(app.db, tenantA, (tx) => tx.insert(events).values(draftEvent({ priceCents: 0 }))),
        /events_price_ck/,
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(events).values(draftEvent({ priceCents: -6000 })),
        ),
        /events_price_ck/,
      );
      const [paid] = await withTenant(app.db, tenantA, (tx) =>
        tx.insert(events).values(publishedEvent({ priceCents: 6000 })).returning(),
      );
      expect(paid!.priceCents).toBe(6000);
    });

    it('carries the (tenant, status, starts_at) index for the upcoming/month queries', async () => {
      const client = await app.pool.connect();
      try {
        const res = await client.query(
          `SELECT indexdef FROM pg_indexes WHERE indexname = 'events_tenant_status_starts_at_idx'`,
        );
        expect(res.rows).toHaveLength(1);
        expect(res.rows[0].indexdef).toContain('(tenant_id, status, starts_at)');
      } finally {
        client.release();
      }
    });
  });

  describe('event_registrations (EVT.2)', () => {
    it('holds one row per (tenant, event, student); status flips reuse the row', async () => {
      const [event] = await withTenant(app.db, tenantA, (tx) =>
        tx.insert(events).values(publishedEvent()).returning({ id: events.id }),
      );
      const registration = {
        tenantId: tenantA,
        eventId: event!.id,
        studentId: studentA,
        confirmedByUserId: professorUserId,
        status: 'confirmed' as const,
      };
      const [first] = await withTenant(app.db, tenantA, (tx) =>
        tx.insert(eventRegistrations).values(registration).returning({ id: eventRegistrations.id }),
      );
      // Cancel-and-reconfirm never duplicates (story 26).
      await expectDbError(
        withTenant(app.db, tenantA, (tx) => tx.insert(eventRegistrations).values(registration)),
        /event_registrations_tenant_event_student_uq/,
      );
      await withTenant(app.db, tenantA, (tx) =>
        tx
          .update(eventRegistrations)
          .set({ status: 'canceled', canceledAt: new Date() })
          .where(eq(eventRegistrations.id, first!.id)),
      );
      const [flipped] = await withTenant(app.db, tenantA, (tx) =>
        tx
          .update(eventRegistrations)
          .set({ status: 'confirmed', canceledAt: null })
          .where(eq(eventRegistrations.id, first!.id))
          .returning(),
      );
      expect(flipped!.status).toBe('confirmed');
    });

    it('rejects cross-tenant event and student references (composite FKs)', async () => {
      const [foreignEvent] = await withTenant(app.db, tenantB, (tx) =>
        tx
          .insert(events)
          .values(publishedEvent({ tenantId: tenantB }))
          .returning({ id: events.id }),
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(eventRegistrations).values({
            tenantId: tenantA,
            eventId: foreignEvent!.id,
            studentId: studentA,
            confirmedByUserId: professorUserId,
            status: 'confirmed',
          }),
        ),
        /event_registrations_event_fk/,
      );
      const [ownEvent] = await withTenant(app.db, tenantA, (tx) =>
        tx.insert(events).values(publishedEvent()).returning({ id: events.id }),
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(eventRegistrations).values({
            tenantId: tenantA,
            eventId: ownEvent!.id,
            studentId: studentB,
            confirmedByUserId: professorUserId,
            status: 'confirmed',
          }),
        ),
        /event_registrations_student_fk/,
      );
    });
  });

  describe('charges.event_registration_id hardening (EVT.2 closing the BIL.2 stub)', () => {
    const eventCharge = (
      registrationId: string,
      overrides: Partial<typeof charges.$inferInsert> = {},
    ) =>
      ({
        tenantId: tenantA,
        studentId: studentA,
        origin: 'event' as const,
        eventRegistrationId: registrationId,
        amountCents: 6000,
        dueDate: '2026-09-01',
        ...overrides,
      }) as typeof charges.$inferInsert;

    async function createRegistration(tenantId: string, studentId: string): Promise<string> {
      const [event] = await withTenant(app.db, tenantId, (tx) =>
        tx
          .insert(events)
          .values(publishedEvent({ tenantId, priceCents: 6000 }))
          .returning({ id: events.id }),
      );
      const [reg] = await withTenant(app.db, tenantId, (tx) =>
        tx
          .insert(eventRegistrations)
          .values({
            tenantId,
            eventId: event!.id,
            studentId,
            confirmedByUserId: professorUserId,
            status: 'pending_payment',
          })
          .returning({ id: eventRegistrations.id }),
      );
      return reg!.id;
    }

    it('accepts an event charge linked to a real registration, satisfying the per-origin CHECK', async () => {
      const registrationId = await createRegistration(tenantA, studentA);
      const [charge] = await withTenant(app.db, tenantA, (tx) =>
        tx
          .insert(charges)
          .values(eventCharge(registrationId, { guardianId: guardianA }))
          .returning(),
      );
      expect(charge!.origin).toBe('event');
      expect(charge!.eventRegistrationId).toBe(registrationId);
      expect(charge!.academyPlanId).toBeNull();
      expect(charge!.orderId).toBeNull();
      // The settlement attempt rides the same rails as any charge.
      await withTenant(app.db, tenantA, (tx) =>
        tx.insert(payments).values({
          tenantId: tenantA,
          chargeId: charge!.id,
          method: 'pix',
          amountCents: 6000,
          provider: 'simulated',
        }),
      );
    });

    it('rejects the dangling uuids the BIL.2 stub used to admit', async () => {
      await expectDbError(
        withTenant(app.db, tenantA, (tx) => tx.insert(charges).values(eventCharge(randomUUID()))),
        /charges_event_registration_fk/,
      );
    });

    it('rejects an event charge referencing another tenant registration', async () => {
      const foreignRegistrationId = await createRegistration(tenantB, studentB);
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(charges).values(eventCharge(foreignRegistrationId)),
        ),
        /charges_event_registration_fk/,
      );
    });

    it('still enforces exactly-one-origin on event charges (charges_origin_ck)', async () => {
      const registrationId = await createRegistration(tenantA, studentA);
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(charges).values(eventCharge(registrationId, { orderId: randomUUID() })),
        ),
        /charges_origin_ck/,
      );
      await expectDbError(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(charges).values(eventCharge(registrationId, { eventRegistrationId: null })),
        ),
        /charges_origin_ck/,
      );
    });
  });

  describe('RLS on the events tables', () => {
    it('fails closed with no tenant context on both tables', async () => {
      expect(await app.db.select().from(events)).toHaveLength(0);
      expect(await app.db.select().from(eventRegistrations)).toHaveLength(0);
    });

    it('keeps each tenant blind to the other tenant events; WITH CHECK blocks cross-tenant writes', async () => {
      const rowsB = await withTenant(app.db, tenantB, (tx) => tx.select().from(events));
      expect(rowsB.length).toBeGreaterThanOrEqual(1);
      expect(rowsB.every((e) => e.tenantId === tenantB)).toBe(true);

      const regsB = await withTenant(app.db, tenantB, (tx) =>
        tx.select().from(eventRegistrations),
      );
      expect(regsB.every((r) => r.tenantId === tenantB)).toBe(true);

      await expectDbError(
        withTenant(app.db, tenantB, (tx) => tx.insert(events).values(draftEvent())),
        /row-level security/,
      );
      await expectDbError(
        withTenant(app.db, tenantB, (tx) =>
          tx.insert(eventRegistrations).values({
            tenantId: tenantA,
            eventId: randomUUID(),
            studentId: studentA,
            confirmedByUserId: professorUserId,
            status: 'confirmed',
          }),
        ),
        /row-level security/,
      );
    });
  });
});
