import {
  auditLogs,
  charges,
  guardians,
  students,
  withPlatform,
} from '@tatame/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

/**
 * EVT.6/EVT.8 — the responsável Eventos tab: published events with one chip
 * per dependent, the free toggle, the paid flow billed to the guardian over
 * the existing responsável rails, sibling independence (story 21) and the
 * foreign-dependent 404 scoping.
 */
describe('events: responsável per-dependent confirmation', () => {
  let t: TestApp;
  let responsavel: string; // Renata — dependents Kiko Kids + Lara Kids
  let admin: string;
  let openMatId: string;
  let exameId: string;
  let kikoId: string;
  let laraId: string;

  beforeAll(async () => {
    t = await createTestApp();
    responsavel = (await t.login('responsavel@tatame.dev')).accessToken;
    admin = (await t.login('admin@tatame.dev')).accessToken;

    const list = await t.http().get('/v1/admin/events').set(bearer(admin));
    openMatId = list.body.events.find(
      (e: any) => e.name === 'Open Mat de Verao',
    ).id;
    exameId = list.body.events.find((e: any) => e.name === 'Exame de Faixa').id;
  });

  afterAll(async () => {
    await t.close();
  });

  const eventsList = async () => {
    const res = await t
      .http()
      .get('/v1/responsavel/events')
      .set(bearer(responsavel));
    expect(res.status).toBe(200);
    return res.body.events as any[];
  };
  const chipOf = (events: any[], eventId: string, studentId: string) =>
    events
      .find((e) => e.id === eventId)
      .dependents.find((d: any) => d.studentId === studentId);

  it('lists published events with one chip per dependent (seeded states)', async () => {
    const events = await eventsList();
    expect(events.map((e: any) => e.id)).toEqual([openMatId, exameId]);

    const openMat = events.find((e: any) => e.id === openMatId);
    expect(openMat.bannerPreset).toBe('event-purple-pink');
    expect(openMat.priceCents).toBeNull();
    expect(openMat.dependents.map((d: any) => d.fullName)).toEqual([
      'Kiko Kids',
      'Lara Kids',
    ]);
    kikoId = openMat.dependents[0].studentId;
    laraId = openMat.dependents[1].studentId;

    // Free event: Kiko was confirmed by the guardian in the fixtures.
    expect(chipOf(events, openMatId, kikoId).registration.status).toBe(
      'confirmed',
    );
    expect(chipOf(events, openMatId, laraId).registration).toBeNull();

    // Paid event: Lara pending with the guardian-billed open charge attached.
    const laraExame = chipOf(events, exameId, laraId);
    expect(laraExame.registration.status).toBe('pending_payment');
    expect(laraExame.registration.chargeId).toBeTruthy();
    expect(chipOf(events, exameId, kikoId).registration).toBeNull();
  });

  it('free chip toggle: confirm Lara, cancel Lara — Kiko never moves (story 21)', async () => {
    const confirmed = await t
      .http()
      .post(`/v1/responsavel/events/${openMatId}/registrations/${laraId}`)
      .set(bearer(responsavel));
    expect(confirmed.status).toBe(201);
    expect(confirmed.body.registration.status).toBe('confirmed');
    expect(confirmed.body.chargeId).toBeNull();

    let events = await eventsList();
    expect(chipOf(events, openMatId, laraId).registration.status).toBe(
      'confirmed',
    );
    expect(chipOf(events, openMatId, kikoId).registration.status).toBe(
      'confirmed',
    );

    // The acting user recorded is the guardian (audit + row shape).
    const audits = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.action, 'events.registration.confirmed'),
            eq(auditLogs.targetId, confirmed.body.registration.id),
          ),
        ),
    );
    expect(audits).toHaveLength(1);

    // Toggle off: Lara canceled, Kiko untouched — states are independent.
    const canceled = await t
      .http()
      .delete(`/v1/responsavel/events/${openMatId}/registrations/${laraId}`)
      .set(bearer(responsavel));
    expect(canceled.status).toBe(204);
    events = await eventsList();
    expect(chipOf(events, openMatId, laraId).registration.status).toBe(
      'canceled',
    );
    expect(chipOf(events, openMatId, kikoId).registration.status).toBe(
      'confirmed',
    );
  });

  it('pays the seeded pending inscription (guardian bill-to) over the responsável rails', async () => {
    const events = await eventsList();
    const chargeId = chipOf(events, exameId, laraId).registration.chargeId;

    // The seeded charge is billed to Renata, about Lara — like a mensalidade.
    const [guardian] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: guardians.id })
        .from(guardians)
        .innerJoin(students, eq(students.guardianId, guardians.id))
        .where(eq(students.id, laraId)),
    );
    const [charge] = await withPlatform(t.platformDb.db, (tx) =>
      tx.select().from(charges).where(eq(charges.id, chargeId)),
    );
    expect(charge).toMatchObject({
      origin: 'event',
      studentId: laraId,
      guardianId: guardian!.id,
      amountCents: 6000,
    });

    const payment = await t
      .http()
      .post(`/v1/responsavel/payments/charges/${chargeId}/payments`)
      .set(bearer(responsavel))
      .send({ method: 'pix' });
    expect(payment.status).toBe(201);
    const simulated = await t
      .http()
      .post(`/v1/billing/payments/${payment.body.payment.id}/simulate`)
      .set(bearer(responsavel));
    expect(simulated.status).toBe(200);
    expect(simulated.body.charge.status).toBe('paid');

    // The handler confirmed Lara's inscription; the chip gains the check.
    const after = await eventsList();
    expect(chipOf(after, exameId, laraId).registration).toMatchObject({
      status: 'confirmed',
      chargeId: null,
    });

    // A settled dependent registration cannot be self-canceled (spec rule).
    const denied = await t
      .http()
      .delete(`/v1/responsavel/events/${exameId}/registrations/${laraId}`)
      .set(bearer(responsavel));
    expect(denied.status).toBe(409);
    expect(denied.body.code).toBe('event.registration_settled');
  });

  it('starts a paid inscription for Kiko, then cancels it — the charge is voided', async () => {
    const res = await t
      .http()
      .post(`/v1/responsavel/events/${exameId}/registrations/${kikoId}`)
      .set(bearer(responsavel));
    expect(res.status).toBe(201);
    expect(res.body.registration.status).toBe('pending_payment');
    const chargeId = res.body.chargeId;

    const [charge] = await withPlatform(t.platformDb.db, (tx) =>
      tx.select().from(charges).where(eq(charges.id, chargeId)),
    );
    expect(charge!.guardianId).not.toBeNull(); // billed to the responsável

    const canceled = await t
      .http()
      .delete(`/v1/responsavel/events/${exameId}/registrations/${kikoId}`)
      .set(bearer(responsavel));
    expect(canceled.status).toBe(204);
    const [voided] = await withPlatform(t.platformDb.db, (tx) =>
      tx.select().from(charges).where(eq(charges.id, chargeId)),
    );
    expect(voided!.status).toBe('canceled');
  });

  it('scoping: a non-dependent or foreign student behaves as 404, never 403', async () => {
    // Ana is an alpha student but NOT Renata's dependent.
    const [ana] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: students.id })
        .from(students)
        .where(eq(students.fullName, 'Ana Aluna')),
    );
    for (const studentId of [ana!.id, '00000000-0000-0000-0000-000000000009']) {
      const res = await t
        .http()
        .post(`/v1/responsavel/events/${openMatId}/registrations/${studentId}`)
        .set(bearer(responsavel));
      expect(res.status, studentId).toBe(404);
      const cancel = await t
        .http()
        .delete(
          `/v1/responsavel/events/${openMatId}/registrations/${studentId}`,
        )
        .set(bearer(responsavel));
      expect(cancel.status, studentId).toBe(404);
    }
  });

  it('RBAC: aluno and professor cannot use the responsável surface', async () => {
    for (const email of ['aluno@tatame.dev', 'professor@tatame.dev']) {
      const session = await t.login(email);
      const res = await t
        .http()
        .get('/v1/responsavel/events')
        .set(bearer(session.accessToken));
      expect(res.status, email).toBe(403);
      expect(res.body.code).toBe('authz.forbidden_role');
    }
  });
});
