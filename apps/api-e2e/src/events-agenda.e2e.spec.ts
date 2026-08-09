import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

const SP = 'America/Sao_Paulo';
const spToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: SP }).format(new Date());
const spMonth = () => spToday().slice(0, 7);

/** Tenant-local month `n` months after the current one, as YYYY-MM. */
function spMonthPlus(n: number): string {
  const [year, month] = spMonth().split('-').map(Number) as [number, number];
  const total = year * 12 + (month - 1) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** Last day (YYYY-MM-DD) of a YYYY-MM month. */
function lastDayOf(month: string): string {
  const [year, monthNum] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(year, monthNum, 0)).getUTCDate();
  return `${month}-${String(last).padStart(2, '0')}`;
}

/**
 * EVT.7/EVT.8 — the filled AGD contracts: "Eventos do mês" on the aluno
 * agenda, dated month events on all three persona calendars, tenant-timezone
 * bucketing across a month boundary, published-only visibility, and the
 * professor dashboard "eventos futuros" tile. Deterministic: the events under
 * test are created here with explicit São Paulo instants, three months out —
 * clear of the floating seeded fixtures.
 */
describe('events: AGD month buckets + professor dashboard tile', () => {
  let t: TestApp;
  let admin: string;
  let aluno: string;
  let professor: string;
  let professorUserId: string;
  const M = spMonthPlus(3); // the controlled month under test
  const prevM = spMonthPlus(2);
  let inMonthId: string; // M-15 12:00 SP
  let boundaryId: string; // last day of prevM, 23:30 SP — 02:30Z ALREADY in M
  let draftId: string;
  let canceledId: string;

  const createEvent = async (body: Record<string, unknown>) => {
    const res = await t
      .http()
      .post('/v1/admin/events')
      .set(bearer(admin))
      .send({ responsibleUserId: professorUserId, location: 'Tatame principal', ...body });
    expect(res.status).toBe(201);
    return res.body.id as string;
  };

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await t.login('admin@tatame.dev')).accessToken;
    aluno = (await t.login('aluno@tatame.dev')).accessToken;
    professor = (await t.login('professor@tatame.dev')).accessToken;

    const professors = await t.http().get('/v1/admin/professors').set(bearer(admin));
    professorUserId = professors.body.professors.find(
      (p: any) => p.email === 'professor@tatame.dev',
    ).userId;

    inMonthId = await createEvent({
      name: 'AGD Dentro do Mes',
      startsAt: `${M}-15T12:00:00-03:00`,
      status: 'published',
      priceCents: 2500,
    });
    // The boundary probe: 23:30 São Paulo on prevM's LAST day is 02:30 UTC of
    // M's first day — naive UTC bucketing would misfile it into M.
    boundaryId = await createEvent({
      name: 'AGD Virada do Mes',
      startsAt: `${lastDayOf(prevM)}T23:30:00-03:00`,
      status: 'published',
    });
    draftId = await createEvent({ name: 'AGD Rascunho', startsAt: `${M}-20T10:00:00-03:00` });
    canceledId = await createEvent({
      name: 'AGD Cancelado',
      startsAt: `${M}-22T10:00:00-03:00`,
      status: 'published',
    });
    await t.http().post(`/v1/admin/events/${canceledId}/cancel`).set(bearer(admin));
  });

  afterAll(async () => {
    await t.close();
  });

  it('aluno calendar: requested-month window, tenant-timezone bucketing, published-only', async () => {
    const res = await t.http().get(`/v1/aluno/calendar?month=${M}`).set(bearer(aluno));
    expect(res.status).toBe(200);
    expect(res.body.month).toBe(M);

    const ids = res.body.events.map((e: any) => e.id);
    expect(ids).toContain(inMonthId);
    expect(ids).not.toContain(boundaryId); // tenant-local prevM, despite UTC
    expect(ids).not.toContain(draftId); // drafts backstage
    expect(ids).not.toContain(canceledId); // cancellations backstage

    const item = res.body.events.find((e: any) => e.id === inMonthId);
    expect(item).toMatchObject({
      name: 'AGD Dentro do Mes',
      date: `${M}-15`,
      time: '12:00',
      location: 'Tatame principal',
      priceCents: 2500,
      registration: null, // aluno items carry own state
    });

    // The boundary event lands on the month the mat experiences (story 30).
    const prev = await t.http().get(`/v1/aluno/calendar?month=${prevM}`).set(bearer(aluno));
    const boundary = prev.body.events.find((e: any) => e.id === boundaryId);
    expect(boundary).toBeTruthy();
    expect(boundary.date).toBe(lastDayOf(prevM));
    expect(boundary.time).toBe('23:30');
  });

  it('aluno month items reflect own registration state after confirming', async () => {
    const confirm = await t
      .http()
      .post(`/v1/aluno/events/${boundaryId}/registration`)
      .set(bearer(aluno));
    expect(confirm.status).toBe(201);

    const res = await t.http().get(`/v1/aluno/calendar?month=${prevM}`).set(bearer(aluno));
    const item = res.body.events.find((e: any) => e.id === boundaryId);
    expect(item.registration.status).toBe('confirmed');
  });

  it('professor and admin calendars carry the dated items without own-state', async () => {
    for (const [token, path] of [
      [professor, '/v1/professor/calendar'],
      [admin, '/v1/admin/calendar'],
    ] as const) {
      const res = await t.http().get(`${path}?month=${M}`).set(bearer(token));
      expect(res.status, path).toBe(200);
      const item = res.body.events.find((e: any) => e.id === inMonthId);
      expect(item, path).toBeTruthy();
      expect(item.date).toBe(`${M}-15`);
      expect(item.registration, path).toBeUndefined(); // no persona state here
      expect(res.body.events.map((e: any) => e.id)).not.toContain(draftId);
    }
  });

  it('aluno agenda "Eventos do mês": current-month events with own state', async () => {
    // An event later today is inside the current tenant-local month by
    // construction, whatever day the suite runs.
    const todayId = await createEvent({
      name: 'AGD Hoje',
      startsAt: `${spToday()}T23:59:00-03:00`,
      status: 'published',
    });
    const res = await t.http().get('/v1/aluno/agenda').set(bearer(aluno));
    expect(res.status).toBe(200);
    const item = res.body.events.find((e: any) => e.id === todayId);
    expect(item).toBeTruthy();
    expect(item.date).toBe(spToday());
    expect(item.registration).toBeNull();
    // Only the current month's events show on the agenda section.
    expect(res.body.events.map((e: any) => e.id)).not.toContain(inMonthId);
    for (const event of res.body.events) {
      expect(event.date.slice(0, 7)).toBe(spMonth());
    }
  });

  it('professor dashboard: eventos-futuros tile count + list with confirmados', async () => {
    const res = await t.http().get('/v1/professor/dashboard').set(bearer(professor));
    expect(res.status).toBe(200);
    expect(res.body.upcomingEventsCount).toBe(res.body.upcomingEvents.length);

    const names = res.body.upcomingEvents.map((e: any) => e.name);
    expect(names).toContain('AGD Dentro do Mes');
    expect(names).not.toContain('AGD Rascunho');
    expect(names).not.toContain('AGD Cancelado');

    // Seeded confirmations feed the "N confirmados · gratuito/R$ X" line.
    const openMat = res.body.upcomingEvents.find((e: any) => e.name === 'Open Mat de Verao');
    expect(openMat).toMatchObject({ confirmedCount: 2, priceCents: null });
    const exame = res.body.upcomingEvents.find((e: any) => e.name === 'Exame de Faixa');
    expect(exame).toMatchObject({ confirmedCount: 1, priceCents: 6000 });

    // Chronological like the handoff's list.
    const starts = res.body.upcomingEvents.map((e: any) => e.startsAt);
    expect([...starts].sort()).toEqual(starts);
  });

  it('month validation still holds on the shared query (422 on a broken month)', async () => {
    const res = await t.http().get('/v1/aluno/calendar?month=2026-13').set(bearer(aluno));
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('validation.failed');
  });
});
