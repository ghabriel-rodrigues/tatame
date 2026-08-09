import 'reflect-metadata';
import { ModulesContainer } from '@nestjs/core';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  EVENTS_ANNOUNCEMENT_REQUESTED,
  EVENTS_EVENT_CANCELED,
  EVENTS_EVENT_PUBLISHED,
} from '@org/api';
import { auditLogs, charges, withPlatform } from '@tatame/db';
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

/**
 * EVT.4/EVT.8 — the admin Eventos console: list totals against the seeded
 * fixtures, the draft → published → canceled lifecycle with its friendly
 * validation, the cancel cascade over open charges + pending registrations,
 * Comunicar (one domain event + one audit row, no delivery), RBAC/read-only
 * and the professor-has-no-event-write-route CI assertion.
 */
describe('events: admin console + lifecycle', () => {
  let t: TestApp;
  let admin: string;
  let professorUserId: string;
  let seminarioId: string; // seeded draft ("Data a definir")
  let openMatId: string; // seeded published free
  let exameId: string; // seeded published paid (R$ 60)
  const emitted: Record<string, any[]> = { published: [], canceled: [], announced: [] };

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await t.login('admin@tatame.dev')).accessToken;

    const professors = await t.http().get('/v1/admin/professors').set(bearer(admin));
    professorUserId = professors.body.professors.find(
      (p: any) => p.email === 'professor@tatame.dev',
    ).userId;

    const list = await t.http().get('/v1/admin/events').set(bearer(admin));
    const byName = (name: string) => list.body.events.find((e: any) => e.name === name).id;
    seminarioId = byName('Seminario de Guarda');
    openMatId = byName('Open Mat de Verao');
    exameId = byName('Exame de Faixa');

    const emitter = t.app.get(EventEmitter2);
    emitter.on(EVENTS_EVENT_PUBLISHED, (e) => emitted['published']!.push(e));
    emitter.on(EVENTS_EVENT_CANCELED, (e) => emitted['canceled']!.push(e));
    emitter.on(EVENTS_ANNOUNCEMENT_REQUESTED, (e) => emitted['announced']!.push(e));
  });

  afterAll(async () => {
    await t.close();
  });

  const auditRows = (action: string, targetId: string) =>
    withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.action, action), eq(auditLogs.targetId, targetId))),
    );

  it('lists drafts first with card data + confirmados/inscritos/arrecadado totals', async () => {
    const res = await t.http().get('/v1/admin/events').set(bearer(admin));
    expect(res.status).toBe(200);

    // Drafts first ("Rascunho · Data a definir"), then chronological.
    expect(res.body.events[0]).toMatchObject({
      id: seminarioId,
      status: 'draft',
      startsAt: null,
      date: null,
      time: null,
      location: null,
    });
    const rest = res.body.events.slice(1).map((e: any) => e.id);
    expect(rest).toEqual([openMatId, exameId]); // +14d before +30d

    const openMat = res.body.events.find((e: any) => e.id === openMatId);
    expect(openMat).toMatchObject({
      name: 'Open Mat de Verao',
      bannerPreset: 'event-purple-pink',
      status: 'published',
      priceCents: null, // Gratuito chip
      location: 'Tatame principal',
      totals: { inscritos: 2, confirmados: 2, arrecadadoCents: 0 },
    });
    expect(openMat.responsible.fullName).toBe('Paulo Professor');
    expect(openMat.date).toBeTruthy();
    expect(openMat.time).toBe('10:00');

    const exame = res.body.events.find((e: any) => e.id === exameId);
    expect(exame).toMatchObject({
      bannerPreset: 'event-blue-teal',
      priceCents: 6000,
      totals: { inscritos: 2, confirmados: 1, arrecadadoCents: 6000 },
    });
  });

  it('inscritos view: who registered, status, who confirmed, paid amount + totals', async () => {
    const res = await t.http().get(`/v1/admin/events/${exameId}/registrations`).set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.totals).toEqual({ inscritos: 2, confirmados: 1, arrecadadoCents: 6000 });

    const ana = res.body.registrations.find((r: any) => r.student.fullName === 'Ana Aluna');
    expect(ana).toMatchObject({ status: 'confirmed', paidAmountCents: 6000 });
    expect(ana.confirmedBy.fullName).toBe('Ana Aluna'); // self-confirmed

    const lara = res.body.registrations.find((r: any) => r.student.fullName === 'Lara Kids');
    expect(lara).toMatchObject({ status: 'pending_payment', paidAmountCents: null });
    expect(lara.confirmedBy.fullName).toBe('Renata Responsavel'); // guardian acted
  });

  it('publish requires date AND local — the friendly 422 of events_published_ck', async () => {
    const res = await t.http().post(`/v1/admin/events/${seminarioId}/publish`).set(bearer(admin));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('event.publish_requirements');
    expect(res.body.errors.map((e: any) => e.field).sort()).toEqual(['location', 'startsAt']);
  });

  it('edit fills the draft; publish then succeeds, emits + audits', async () => {
    const startsAt = new Date(Date.now() + 21 * 86_400_000).toISOString();
    const patched = await t
      .http()
      .patch(`/v1/admin/events/${seminarioId}`)
      .set(bearer(admin))
      .send({ location: 'Dojo anexo', startsAt });
    expect(patched.status).toBe(200);
    expect(patched.body.status).toBe('draft'); // editing never publishes

    const published = await t
      .http()
      .post(`/v1/admin/events/${seminarioId}/publish`)
      .set(bearer(admin));
    expect(published.status).toBe(200);
    expect(published.body.status).toBe('published');
    expect(published.body.date).toBeTruthy();

    expect(emitted['published']!.find((e) => e.eventId === seminarioId)).toBeTruthy();
    expect(await auditRows('events.event.published', seminarioId)).toHaveLength(1);
    expect(await auditRows('events.event.updated', seminarioId)).toHaveLength(1);

    // Re-publishing a published event is a conflict, not an idempotent no-op.
    const again = await t.http().post(`/v1/admin/events/${seminarioId}/publish`).set(bearer(admin));
    expect(again.status).toBe(409);
  });

  it('a published event must keep its date/local (422 on nulling them)', async () => {
    const res = await t
      .http()
      .patch(`/v1/admin/events/${seminarioId}`)
      .set(bearer(admin))
      .send({ location: null });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('event.publish_requirements');
  });

  it('create validates the responsável (active professor/admin of THIS academy)', async () => {
    const res = await t
      .http()
      .post('/v1/admin/events')
      .set(bearer(admin))
      .send({ name: 'Evento Orfao', responsibleUserId: '00000000-0000-0000-0000-000000000001' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('validation.failed');
    expect(res.body.errors[0].field).toBe('responsibleUserId');
  });

  it('quick-create sits as Rascunho; price must be positive cents (never 0)', async () => {
    const res = await t
      .http()
      .post('/v1/admin/events')
      .set(bearer(admin))
      .send({ name: 'Treino Beneficente', responsibleUserId: professorUserId });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ status: 'draft', startsAt: null, priceCents: null });
    expect(await auditRows('events.event.created', res.body.id)).toHaveLength(1);

    const zero = await t
      .http()
      .post('/v1/admin/events')
      .set(bearer(admin))
      .send({ name: 'Gratis Errado', responsibleUserId: professorUserId, priceCents: 0 });
    expect(zero.status).toBe(422);
    expect(zero.body.code).toBe('validation.failed');
  });

  it('announce: published-only gate, one domain event + one audit row, nothing delivered', async () => {
    const draft = await t
      .http()
      .post('/v1/admin/events')
      .set(bearer(admin))
      .send({ name: 'Rascunho Mudo', responsibleUserId: professorUserId });
    const gated = await t
      .http()
      .post(`/v1/admin/events/${draft.body.id}/announce`)
      .set(bearer(admin));
    expect(gated.status).toBe(422);
    expect(gated.body.code).toBe('event.not_published');

    const res = await t.http().post(`/v1/admin/events/${openMatId}/announce`).set(bearer(admin));
    expect(res.status).toBe(202);
    expect(res.body.recipients).toBe(2); // Ana + Kiko (non-canceled inscritos)

    const events = emitted['announced']!.filter((e) => e.eventId === openMatId);
    expect(events).toHaveLength(1); // exactly one emission
    expect(events[0].audience).toHaveLength(2);
    const kiko = events[0].audience.find((a: any) => a.guardianId !== null);
    expect(kiko.audience).toBe('guardian'); // dependent addressed via responsável
    expect(await auditRows('events.event.announced', openMatId)).toHaveLength(1);
  });

  it('cancel cascades: open event charges void, pending rows cancel, confirmed keep history', async () => {
    const before = await withPlatform(t.platformDb.db, (tx) =>
      tx.select().from(charges).where(and(eq(charges.origin, 'event'), eq(charges.status, 'open'))),
    );
    expect(before.length).toBeGreaterThanOrEqual(1); // Lara's seeded open charge

    const res = await t.http().post(`/v1/admin/events/${exameId}/cancel`).set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('canceled');

    // The canceled event carries its registered audience (pre-cascade).
    const event = emitted['canceled']!.find((e) => e.eventId === exameId);
    expect(event.audience).toHaveLength(2);

    // Inscritos after: Ana's settled registration keeps its history; Lara's
    // pending one is canceled and her open charge is voided (story 8).
    const detail = await t
      .http()
      .get(`/v1/admin/events/${exameId}/registrations`)
      .set(bearer(admin));
    const ana = detail.body.registrations.find((r: any) => r.student.fullName === 'Ana Aluna');
    expect(ana.status).toBe('confirmed');
    const lara = detail.body.registrations.find((r: any) => r.student.fullName === 'Lara Kids');
    expect(lara.status).toBe('canceled');
    expect(await auditRows('events.registration.canceled', lara.id)).toHaveLength(1);

    const laraCharge = await withPlatform(t.platformDb.db, (tx) =>
      tx.select().from(charges).where(eq(charges.eventRegistrationId, lara.id)),
    );
    expect(laraCharge[0]!.status).toBe('canceled');
    expect(await auditRows('billing.charge.canceled', laraCharge[0]!.id)).toHaveLength(1);
    expect(await auditRows('events.event.canceled', exameId)).toHaveLength(1);

    // Never hard-deleted, but frozen: edit and re-cancel are conflicts.
    const edit = await t
      .http()
      .patch(`/v1/admin/events/${exameId}`)
      .set(bearer(admin))
      .send({ name: 'Zumbi' });
    expect(edit.status).toBe(409);
    const again = await t.http().post(`/v1/admin/events/${exameId}/cancel`).set(bearer(admin));
    expect(again.status).toBe(409);
  });

  it('RBAC: professor and aluno cannot reach the admin console; cross-tenant ids are 404', async () => {
    const professor = await t.login('professor@tatame.dev');
    for (const [method, path] of [
      ['get', '/v1/admin/events'],
      ['post', '/v1/admin/events'],
    ] as const) {
      const res = await (t.http() as any)
        [method](path)
        .set(bearer(professor.accessToken))
        .send({});
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.code).toBe('authz.forbidden_role');
    }
    const aluno = await t.login('aluno@tatame.dev');
    const denied = await t.http().get('/v1/admin/events').set(bearer(aluno.accessToken));
    expect(denied.status).toBe(403);

    // RLS backstop: a bravo admin sees an alpha event id as 404, never 403.
    const bravoAdmin = await t.login('admin.bravo@tatame.dev');
    const foreign = await t
      .http()
      .get(`/v1/admin/events/${openMatId}/registrations`)
      .set(bearer(bravoAdmin.accessToken));
    expect(foreign.status).toBe(404);
  });

  it('read-only academy: event CRUD blocked, GETs still served', async () => {
    await t.setAcademyStatus('alpha-jj', 'delinquent');
    const blocked = await t
      .http()
      .post('/v1/admin/events')
      .set(bearer(admin))
      .send({ name: 'Bloqueado', responsibleUserId: professorUserId });
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe('tenant.read_only');

    const reads = await t.http().get('/v1/admin/events').set(bearer(admin));
    expect(reads.status).toBe(200);
    await t.setAcademyStatus('alpha-jj', 'active');
  });

  it('META: the professor has no event route at all — read-only by construction', () => {
    const modulesContainer = t.app.get(ModulesContainer, { strict: false });
    const eventRoutes: Array<{ controller: string; path: string }> = [];

    for (const module of modulesContainer.values()) {
      for (const wrapper of module.controllers.values()) {
        const metatype = wrapper.metatype as (new () => unknown) | undefined;
        if (!metatype) continue;
        const controllerPath: string = Reflect.getMetadata('path', metatype) ?? '';
        const prototype = metatype.prototype as Record<string, unknown>;
        for (const name of Object.getOwnPropertyNames(prototype)) {
          if (name === 'constructor') continue;
          const handler = prototype[name];
          if (typeof handler !== 'function') continue;
          const path = Reflect.getMetadata('path', handler);
          const method = Reflect.getMetadata('method', handler);
          if (path === undefined || method === undefined) continue;
          const full = `${controllerPath}/${path}`.replaceAll('//', '/');
          if (full.includes('event')) eventRoutes.push({ controller: metatype.name, path: full });
        }
      }
    }

    expect(eventRoutes.length).toBeGreaterThanOrEqual(11); // the spec surface
    for (const route of eventRoutes) {
      // Every event route lives on an admin/aluno/responsavel surface; no
      // /professor/... event route exists (the "Criar eventos" toggle stays
      // render-only in v1).
      expect(
        /^\/?(admin|aluno|responsavel)\//.test(route.path),
        `${route.controller} ${route.path}`,
      ).toBe(true);
      expect(route.path.includes('professor'), route.path).toBe(false);
    }
  });
});
