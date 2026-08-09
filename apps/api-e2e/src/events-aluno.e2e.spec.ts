import { EventEmitter2 } from '@nestjs/event-emitter';
import { EVENTS_REGISTRATION_CANCELED, EVENTS_REGISTRATION_CONFIRMED } from '@org/api';
import { auditLogs, charges, withPlatform } from '@tatame/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

/**
 * EVT.5/EVT.8 — the aluno surface: home "Próximos eventos", detail
 * visibility, free confirm/cancel/re-confirm on one reused row, and the paid
 * flow end-to-end over the EXISTING wallet rails (register → event-origin
 * charge → Pix → simulate → charge paid AND registration confirmed through
 * the normalized handler), plus refund → canceled and the settled-cancel 409.
 */
describe('events: aluno home/detail + free and paid registration flows', () => {
  let t: TestApp;
  let aluno: string; // Ana Aluna — seeded confirmed on both published events
  let admin: string;
  let openMatId: string;
  let exameId: string;
  const confirmedEvents: any[] = [];
  const canceledEvents: any[] = [];

  beforeAll(async () => {
    t = await createTestApp();
    aluno = (await t.login('aluno@tatame.dev')).accessToken;
    admin = (await t.login('admin@tatame.dev')).accessToken;

    const list = await t.http().get('/v1/admin/events').set(bearer(admin));
    openMatId = list.body.events.find((e: any) => e.name === 'Open Mat de Verao').id;
    exameId = list.body.events.find((e: any) => e.name === 'Exame de Faixa').id;

    const emitter = t.app.get(EventEmitter2);
    emitter.on(EVENTS_REGISTRATION_CONFIRMED, (e) => confirmedEvents.push(e));
    emitter.on(EVENTS_REGISTRATION_CANCELED, (e) => canceledEvents.push(e));
  });

  afterAll(async () => {
    await t.setAcademyStatus('alpha-jj', 'active');
    await t.close();
  });

  const auditRows = (action: string, targetId: string) =>
    withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.action, action), eq(auditLogs.targetId, targetId))),
    );

  it('home gains upcomingEvents: the next 2 published with own state (additive)', async () => {
    const res = await t.http().get('/v1/aluno/home').set(bearer(aluno));
    expect(res.status).toBe(200);
    // The rest of the payload is untouched (additive extension).
    expect(res.body.student.fullName).toBe('Ana Aluna');
    expect(res.body.stats).toBeTruthy();

    expect(res.body.upcomingEvents.map((e: any) => e.id)).toEqual([openMatId, exameId]);
    const [openMat, exame] = res.body.upcomingEvents;
    expect(openMat).toMatchObject({
      name: 'Open Mat de Verao',
      bannerPreset: 'event-purple-pink',
      priceCents: null, // Gratuito chip
    });
    expect(openMat.registration.status).toBe('confirmed'); // Confirmado state
    expect(openMat.date).toBeTruthy();
    expect(exame).toMatchObject({ priceCents: 6000 });
    expect(exame.registration.status).toBe('confirmed'); // seeded settled
  });

  it('detail answers everything on one screen; drafts and foreign events are 404', async () => {
    const res = await t.http().get(`/v1/aluno/events/${openMatId}`).set(bearer(aluno));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      name: 'Open Mat de Verao',
      bannerPreset: 'event-purple-pink',
      location: 'Tatame principal',
      time: '10:00',
      priceCents: null,
      description: 'Treino livre aberto a todas as faixas. Traga um convidado!',
    });
    expect(res.body.responsible.fullName).toBe('Paulo Professor');
    expect(res.body.registration.status).toBe('confirmed');

    // Drafts stay backstage (story 25).
    const list = await t.http().get('/v1/admin/events').set(bearer(admin));
    const draftId = list.body.events.find((e: any) => e.status === 'draft').id;
    const draft = await t.http().get(`/v1/aluno/events/${draftId}`).set(bearer(aluno));
    expect(draft.status).toBe(404);

    // RLS backstop: a bravo event id behaves as 404 for an alpha aluno.
    const bravoAdmin = await t.login('admin.bravo@tatame.dev');
    const bravoList = await t.http().get('/v1/admin/events').set(bearer(bravoAdmin.accessToken));
    const bravoEventId = bravoList.body.events.find((e: any) => e.status === 'published').id;
    const foreign = await t.http().get(`/v1/aluno/events/${bravoEventId}`).set(bearer(aluno));
    expect(foreign.status).toBe(404);
  });

  let openMatRegistrationId: string;

  it('free cancel flips the row; re-confirm reuses the SAME row (unique holds)', async () => {
    const detail = await t.http().get(`/v1/aluno/events/${openMatId}`).set(bearer(aluno));
    openMatRegistrationId = detail.body.registration.id;

    const canceled = await t
      .http()
      .delete(`/v1/aluno/events/${openMatId}/registration`)
      .set(bearer(aluno));
    expect(canceled.status).toBe(204);
    const after = await t.http().get(`/v1/aluno/events/${openMatId}`).set(bearer(aluno));
    expect(after.body.registration).toMatchObject({
      id: openMatRegistrationId,
      status: 'canceled',
    });
    expect(canceledEvents.find((e) => e.registrationId === openMatRegistrationId)).toMatchObject({
      via: 'self',
      audience: 'student',
    });

    // Nothing active left → a second cancel is 404, not a silent no-op.
    const again = await t
      .http()
      .delete(`/v1/aluno/events/${openMatId}/registration`)
      .set(bearer(aluno));
    expect(again.status).toBe(404);

    // Re-confirm: same row id, back to confirmed, audited + emitted.
    const reconfirmed = await t
      .http()
      .post(`/v1/aluno/events/${openMatId}/registration`)
      .set(bearer(aluno));
    expect(reconfirmed.status).toBe(201);
    expect(reconfirmed.body).toMatchObject({
      registration: { id: openMatRegistrationId, status: 'confirmed', chargeId: null },
      chargeId: null,
    });
    expect(
      confirmedEvents.find((e) => e.registrationId === openMatRegistrationId),
    ).toBeTruthy();
    expect(await auditRows('events.registration.canceled', openMatRegistrationId)).toHaveLength(1);

    // Counts stay honest: still 2 inscritos on the admin card, never 3 rows.
    const list = await t.http().get('/v1/admin/events').set(bearer(admin));
    const openMat = list.body.events.find((e: any) => e.id === openMatId);
    expect(openMat.totals).toMatchObject({ inscritos: 2, confirmados: 2 });
  });

  // ── the paid flow, end to end, with a fresh (planless) aluno ─────────────

  let fresh: string;
  let registrationId: string;
  let chargeId: string;
  let paymentId: string;

  it('paid register → pending_payment + event-origin charge (idempotent re-tap)', async () => {
    const invite = await t
      .http()
      .post('/v1/invites')
      .set(bearer(admin))
      .send({ kind: 'student' });
    const accept = await t
      .http()
      .post(`/v1/public/invites/${invite.body.token}/accept`)
      .send({
        email: 'pagante@tatame.dev',
        password: 'pagante-pass-123',
        fullName: 'Pedro Pagante',
        birthDate: '1998-05-05',
      });
    expect(accept.status).toBe(201);
    fresh = (await t.login('pagante@tatame.dev', 'pagante-pass-123')).accessToken;

    const res = await t
      .http()
      .post(`/v1/aluno/events/${exameId}/registration`)
      .set(bearer(fresh));
    expect(res.status).toBe(201);
    expect(res.body.registration.status).toBe('pending_payment');
    expect(res.body.chargeId).toBeTruthy();
    registrationId = res.body.registration.id;
    chargeId = res.body.chargeId;

    // Reopening the sheet reuses the registration AND the open charge.
    const again = await t
      .http()
      .post(`/v1/aluno/events/${exameId}/registration`)
      .set(bearer(fresh));
    expect(again.status).toBe(201);
    expect(again.body.registration.id).toBe(registrationId);
    expect(again.body.chargeId).toBe(chargeId);

    // The charge is billing's: event origin, hardened linkage, self bill-to,
    // due on the event's tenant-local date.
    const [charge] = await withPlatform(t.platformDb.db, (tx) =>
      tx.select().from(charges).where(eq(charges.id, chargeId)),
    );
    expect(charge).toMatchObject({
      origin: 'event',
      eventRegistrationId: registrationId,
      amountCents: 6000,
      guardianId: null,
      status: 'open',
    });

    // Home reflects the pending state with the deep-linkable chargeId.
    const home = await t.http().get('/v1/aluno/home').set(bearer(fresh));
    const exame = home.body.upcomingEvents.find((e: any) => e.id === exameId);
    expect(exame.registration).toMatchObject({ status: 'pending_payment', chargeId });
  });

  it('pays over the EXISTING wallet rails while read-only; simulate confirms through the handler', async () => {
    // Registration mutations are blocked in read-only mode…
    await t.setAcademyStatus('alpha-jj', 'delinquent');
    const blocked = await t
      .http()
      .post(`/v1/aluno/events/${openMatId}/registration`)
      .set(bearer(fresh));
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('tenant.read_only');
    // …but paying an EXISTING event charge rides the @BypassReadOnly rails.
    const payment = await t
      .http()
      .post(`/v1/aluno/wallet/charges/${chargeId}/payments`)
      .set(bearer(fresh))
      .send({ method: 'pix' });
    expect(payment.status).toBe(201);
    expect(payment.body.payment.providerData.copiaECola).toBe(`TATAME-SIM-PIX-${chargeId}`);
    paymentId = payment.body.payment.id;

    const simulated = await t
      .http()
      .post(`/v1/billing/payments/${paymentId}/simulate`)
      .set(bearer(fresh));
    expect(simulated.status).toBe(200);
    expect(simulated.body.charge.status).toBe('paid');
    await t.setAcademyStatus('alpha-jj', 'active');

    // The normalized handler settled the charge AND confirmed the inscription.
    const detail = await t.http().get(`/v1/aluno/events/${exameId}`).set(bearer(fresh));
    expect(detail.body.registration).toMatchObject({
      id: registrationId,
      status: 'confirmed',
      chargeId: null, // nothing left to pay
    });
    expect(confirmedEvents.find((e) => e.registrationId === registrationId)).toBeTruthy();
    expect(await auditRows('events.registration.confirmed', registrationId)).toHaveLength(1);

    // Event money lands in the Carteira histórico with a comprovante.
    const wallet = await t.http().get('/v1/aluno/wallet').set(bearer(fresh));
    expect(wallet.body.history).toHaveLength(1);
    expect(wallet.body.history[0]).toMatchObject({ method: 'pix', amountCents: 6000 });
    expect(wallet.body.history[0].receiptUrl).toContain('/receipt');

    // The admin card's arrecadado grows by the settled inscription.
    const list = await t.http().get('/v1/admin/events').set(bearer(admin));
    const exame = list.body.events.find((e: any) => e.id === exameId);
    expect(exame.totals).toMatchObject({ inscritos: 3, confirmados: 2, arrecadadoCents: 12000 });
  });

  it('self-cancel of the paid, settled registration → 409 event.registration_settled', async () => {
    const res = await t
      .http()
      .delete(`/v1/aluno/events/${exameId}/registration`)
      .set(bearer(fresh));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('event.registration_settled');
  });

  it('admin refund cancels the registration through the handler (recorded, never silent)', async () => {
    const res = await t
      .http()
      .post(`/v1/admin/billing/payments/${paymentId}/refund`)
      .set(bearer(admin))
      .send({ reason: 'evento remarcado' });
    expect(res.status).toBe(200);
    expect(res.body.charge.status).toBe('refunded');

    const detail = await t.http().get(`/v1/aluno/events/${exameId}`).set(bearer(fresh));
    expect(detail.body.registration).toMatchObject({ id: registrationId, status: 'canceled' });
    expect(canceledEvents.find((e) => e.registrationId === registrationId)).toMatchObject({
      via: 'refund',
    });
    expect(await auditRows('events.registration.canceled', registrationId)).toHaveLength(1);
  });

  it('re-register after refund issues a NEW charge; canceling pending voids it', async () => {
    const res = await t
      .http()
      .post(`/v1/aluno/events/${exameId}/registration`)
      .set(bearer(fresh));
    expect(res.status).toBe(201);
    expect(res.body.registration.id).toBe(registrationId); // same row, status flipped
    expect(res.body.registration.status).toBe('pending_payment');
    expect(res.body.chargeId).not.toBe(chargeId); // the refunded charge is history

    const cancel = await t
      .http()
      .delete(`/v1/aluno/events/${exameId}/registration`)
      .set(bearer(fresh));
    expect(cancel.status).toBe(204);

    const [voided] = await withPlatform(t.platformDb.db, (tx) =>
      tx.select().from(charges).where(eq(charges.id, res.body.chargeId)),
    );
    expect(voided!.status).toBe('canceled'); // nobody pays for an opted-out spot
  });

  it('registration on a canceled event → 422 event.not_published (stable code)', async () => {
    const professors = await t.http().get('/v1/admin/professors').set(bearer(admin));
    const professorUserId = professors.body.professors[0].userId;
    const created = await t
      .http()
      .post('/v1/admin/events')
      .set(bearer(admin))
      .send({
        name: 'Evento Cancelado',
        responsibleUserId: professorUserId,
        location: 'Tatame',
        startsAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        status: 'published',
      });
    expect(created.status).toBe(201);
    await t.http().post(`/v1/admin/events/${created.body.id}/cancel`).set(bearer(admin));

    const res = await t
      .http()
      .post(`/v1/aluno/events/${created.body.id}/registration`)
      .set(bearer(aluno));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('event.not_published');

    // And it disappeared from every published-only read.
    const detail = await t.http().get(`/v1/aluno/events/${created.body.id}`).set(bearer(aluno));
    expect(detail.status).toBe(404);
  });
});
