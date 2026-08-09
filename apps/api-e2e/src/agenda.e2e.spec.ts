import { count, eq } from 'drizzle-orm';
import { classSessions, classes, withPlatform } from '@tatame/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

/** Test-side tenant-timezone helpers — mirror the API's America/Sao_Paulo rule. */
const TZ = 'America/Sao_Paulo';
const spMonth = (at: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(at).slice(0, 7);
const spWeekday = (at: Date = new Date()) =>
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(at),
  );
const spMinutes = (at: Date = new Date()) => {
  const [h, m] = new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
    .format(at)
    .split(':')
    .map(Number);
  return ((h ?? 0) % 24) * 60 + (m ?? 0);
};
const hhmm = (mins: number) =>
  `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;

/** All class ids across the seven weekday buckets of a calendar payload. */
const bucketClassIds = (body: any): string[] =>
  Object.values(body.classesByWeekday as Record<string, Array<{ classId: string }>>).flatMap(
    (items) => items.map((i) => i.classId),
  );

describe('agenda: aluno weekday view, persona calendars, read purity (AGD.1-3)', () => {
  let t: TestApp;
  let admin: string;
  let professor: string;
  let aluno: string;
  let responsavel: string;
  let bravoId: string;
  let professorUserId: string;
  let multiUserId: string;
  let anaStudentId: string;
  let adultoGiId: string;
  let kidsId: string;

  /** Class with a slot open right now (start 10 min ago, 60 min long). */
  const nowSlot = () => ({
    weekday: spWeekday(),
    startTime: hhmm(Math.max(0, spMinutes() - 10)),
    durationMinutes: 60,
  });

  async function createClass(
    name: string,
    schedules: Array<{ weekday: number; startTime: string; durationMinutes: number }>,
    opts: { capacity?: number; professorUserId?: string } = {},
  ): Promise<string> {
    const res = await t
      .http()
      .post('/v1/admin/classes')
      .set(bearer(admin))
      .send({
        name,
        professorUserId: opts.professorUserId ?? professorUserId,
        capacity: opts.capacity ?? 20,
        schedules,
      });
    expect(res.status).toBe(201);
    return res.body.class.id;
  }

  async function enroll(classId: string, studentId = anaStudentId) {
    const res = await t
      .http()
      .post(`/v1/admin/classes/${classId}/students`)
      .set(bearer(admin))
      .send({ studentId });
    expect(res.status).toBe(201);
  }

  async function agenda(weekday?: number) {
    const res = await t
      .http()
      .get(`/v1/aluno/agenda${weekday === undefined ? '' : `?weekday=${weekday}`}`)
      .set(bearer(aluno));
    expect(res.status).toBe(200);
    return res.body;
  }

  async function sessionCountOf(classId?: string): Promise<number> {
    const rows = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ total: count() })
        .from(classSessions)
        .where(classId ? eq(classSessions.classId, classId) : undefined),
    );
    return Number(rows[0]?.total ?? 0);
  }

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await t.login('admin@tatame.dev')).accessToken;
    professor = (await t.login('professor@tatame.dev')).accessToken;
    aluno = (await t.login('aluno@tatame.dev')).accessToken;
    responsavel = (await t.login('responsavel@tatame.dev')).accessToken;
    bravoId = await t.academyIdBySlug('bravo-bjj');

    const professors = await t.http().get('/v1/admin/professors').set(bearer(admin));
    professorUserId = professors.body.professors.find(
      (p: any) => p.email === 'professor@tatame.dev',
    ).userId;
    multiUserId = professors.body.professors.find(
      (p: any) => p.email === 'multi@tatame.dev',
    ).userId;

    const students = await t.http().get('/v1/admin/students').set(bearer(admin));
    anaStudentId = students.body.students.find((s: any) => s.fullName === 'Ana Aluna').id;

    const classList = await t.http().get('/v1/admin/classes').set(bearer(admin));
    adultoGiId = classList.body.classes.find((c: any) => c.name === 'Adulto Gi').id;
    kidsId = classList.body.classes.find((c: any) => c.name === 'Kids').id;
  });

  afterAll(async () => {
    await t.close();
  });

  // ── aluno agenda (AGD.1) ───────────────────────────────────────────────

  it('defaults to today (tenant timezone); events carries the month buckets (spec 008)', async () => {
    const body = await agenda();
    expect(body.weekday).toBe(spWeekday());
    expect(body.isToday).toBe(true);
    // Filled contract: published events of the CURRENT month only (the seeded
    // fixtures float on "now", so membership is date-dependent — the precise
    // month-window behavior is pinned in events-agenda.e2e.spec.ts).
    expect(Array.isArray(body.events)).toBe(true);
    for (const event of body.events) {
      expect(event.date.slice(0, 7)).toBe(spMonth());
    }
  });

  it('weekday filter returns only that day; a multi-slot weekday yields one item per slot, sorted', async () => {
    const w = (spWeekday() + 2) % 7;
    const other = (spWeekday() + 3) % 7;
    const classId = await createClass('AGD Multi', [
      { weekday: w, startTime: '09:00', durationMinutes: 60 },
      { weekday: w, startTime: '07:30', durationMinutes: 60 },
      { weekday: other, startTime: '19:00', durationMinutes: 45 },
    ]);
    await enroll(classId);

    const body = await agenda(w);
    expect(body.weekday).toBe(w);
    expect(body.isToday).toBe(false);
    const items = body.classes.filter((c: any) => c.classId === classId);
    expect(items).toHaveLength(2);
    expect(items.map((i: any) => i.startTime)).toEqual(['07:30', '09:00']);
    expect(items[0].endTime).toBe('08:30');
    expect(items.every((i: any) => i.checkedIn === false)).toBe(true);
    const starts = body.classes.map((c: any) => c.startTime);
    expect([...starts].sort()).toEqual(starts);

    const otherDay = await agenda(other);
    expect(otherDay.classes.filter((c: any) => c.classId === classId)).toHaveLength(1);
  });

  it('lists only actively enrolled classes with level fields and "N de M" occupancy', async () => {
    // Adulto Gi recurs Mon/Wed/Fri (seed) with the Branca-Azul range chips.
    const body = await agenda(1);
    const item = body.classes.find((c: any) => c.classId === adultoGiId);
    expect(item).toBeTruthy();
    expect(item.professorName).toBe('Paulo Professor');
    expect(item.startTime).toBe('19:00');
    expect(item.endTime).toBe('20:00');
    expect(item.occupancy).toEqual({ active: 1, capacity: 24 });
    expect(item.ageMin).toBeNull();
    expect(item.minBelt.name).toBe('Branca');
    expect(item.maxBelt.name).toBe('Azul');
    // Kids meets on Tue/Thu but Ana is not enrolled — never her agenda.
    const tue = await agenda(2);
    expect(tue.classes.map((c: any) => c.classId)).not.toContain(kidsId);
    // An enrolled-nobody class on Monday is invisible too.
    await createClass('AGD Ghost', [{ weekday: 1, startTime: '06:00', durationMinutes: 60 }]);
    const again = await agenda(1);
    expect(again.classes.map((c: any) => c.className)).not.toContain('AGD Ghost');
  });

  it('a removed enrollment and an archived class disappear from the agenda', async () => {
    const w = (spWeekday() + 4) % 7;
    const goneId = await createClass('AGD Gone', [
      { weekday: w, startTime: '10:00', durationMinutes: 60 },
    ]);
    await enroll(goneId);
    expect((await agenda(w)).classes.map((c: any) => c.classId)).toContain(goneId);
    const removed = await t
      .http()
      .delete(`/v1/admin/classes/${goneId}/students/${anaStudentId}`)
      .set(bearer(admin));
    expect(removed.status).toBe(200);
    expect((await agenda(w)).classes.map((c: any) => c.classId)).not.toContain(goneId);

    const archId = await createClass('AGD Arch', [
      { weekday: w, startTime: '11:00', durationMinutes: 60 },
    ]);
    await enroll(archId);
    expect((await agenda(w)).classes.map((c: any) => c.classId)).toContain(archId);
    const archived = await t.http().post(`/v1/admin/classes/${archId}/archive`).set(bearer(admin));
    expect(archived.status).toBe(204);
    expect((await agenda(w)).classes.map((c: any) => c.classId)).not.toContain(archId);
  });

  // ── checkedIn state — pure session/attendance read (AGD.1) ─────────────

  it('checkedIn: false without a session, true after check-in, false again after revoke', async () => {
    const tomorrow = (spWeekday() + 1) % 7;
    const hojeId = await createClass('AGD Hoje', [
      nowSlot(),
      { weekday: tomorrow, startTime: '08:00', durationMinutes: 60 },
    ]);
    await enroll(hojeId);

    // No session row yet — a day nobody touched: checkedIn false.
    let item = (await agenda()).classes.find((c: any) => c.classId === hojeId);
    expect(item.checkedIn).toBe(false);

    // Chamada + code check-in (the Phase-4 write path) flips it to true.
    const live = await t
      .http()
      .post(`/v1/professor/classes/${hojeId}/live-codes`)
      .set(bearer(professor));
    expect(live.status).toBe(201);
    const checkin = await t
      .http()
      .post('/v1/aluno/checkins')
      .set(bearer(aluno))
      .send({ method: 'code', code: live.body.code });
    expect(checkin.status).toBe(200);
    item = (await agenda()).classes.find((c: any) => c.classId === hojeId);
    expect(item.checkedIn).toBe(true);

    // Off-today rows never carry the affordance state.
    const offToday = (await agenda(tomorrow)).classes.find((c: any) => c.classId === hojeId);
    expect(offToday.checkedIn).toBe(false);

    // A revoke (roll-call correction flow) brings the button back.
    const rollCall = await t
      .http()
      .post(`/v1/professor/classes/${hojeId}/roll-call`)
      .set(bearer(professor));
    const anaRow = rollCall.body.roster.find((r: any) => r.studentId === anaStudentId);
    const revoke = await t
      .http()
      .post(`/v1/admin/attendances/${anaRow.attendance.id}/revoke`)
      .set(bearer(admin))
      .send({ reason: 'e2e: agenda revoke state' });
    expect(revoke.status).toBe(200);
    item = (await agenda()).classes.find((c: any) => c.classId === hojeId);
    expect(item.checkedIn).toBe(false);
  });

  it('read purity: no agenda or calendar GET ever creates a class_sessions row', async () => {
    const puroId = await createClass('AGD Puro', [nowSlot()]);
    await enroll(puroId);
    const before = await sessionCountOf();

    await agenda();
    await agenda(spWeekday());
    for (const [token, path] of [
      [aluno, '/v1/aluno/calendar'],
      [professor, '/v1/professor/calendar'],
      [admin, '/v1/admin/calendar'],
    ] as const) {
      const res = await t.http().get(path).set(bearer(token));
      expect(res.status, path).toBe(200);
    }

    expect(await sessionCountOf(puroId)).toBe(0); // its today slot stayed untouched
    expect(await sessionCountOf()).toBe(before); // nothing anywhere else either
  });

  // ── persona calendars (AGD.2) ──────────────────────────────────────────

  it('aluno calendar buckets only the enrolled classes, keyed by weekday', async () => {
    const res = await t.http().get('/v1/aluno/calendar').set(bearer(aluno));
    expect(res.status).toBe(200);
    expect(res.body.month).toBe(spMonth());
    // Spec 008 filled the events contract; membership of the floating seeded
    // fixtures is date-dependent — pinned in events-agenda.e2e.spec.ts.
    expect(Array.isArray(res.body.events)).toBe(true);
    expect(Object.keys(res.body.classesByWeekday).sort()).toEqual([
      '0', '1', '2', '3', '4', '5', '6',
    ]);
    // Adulto Gi recurs Mon/Wed/Fri; Kids (not enrolled) is nowhere.
    for (const day of ['1', '3', '5']) {
      const item = res.body.classesByWeekday[day].find((i: any) => i.classId === adultoGiId);
      expect(item, `weekday ${day}`).toBeTruthy();
      expect(item.startTime).toBe('19:00');
      expect(item.endTime).toBe('20:00');
      expect(item.professorName).toBe('Paulo Professor');
      expect(item.occupancy).toEqual({ active: 1, capacity: 24 });
    }
    expect(bucketClassIds(res.body)).not.toContain(kidsId);
  });

  it("professor calendar buckets only the caller's own classes", async () => {
    const colegaId = await createClass(
      'AGD Colega',
      [{ weekday: 0, startTime: '09:00', durationMinutes: 60 }],
      { professorUserId: multiUserId },
    );
    const res = await t.http().get('/v1/professor/calendar').set(bearer(professor));
    expect(res.status).toBe(200);
    const ids = bucketClassIds(res.body);
    expect(ids).toContain(adultoGiId);
    expect(ids).not.toContain(colegaId); // a colleague's turma is absent
  });

  it('admin calendar buckets every active turma and excludes archived ones', async () => {
    const res = await t.http().get('/v1/admin/calendar').set(bearer(admin));
    expect(res.status).toBe(200);
    const ids = bucketClassIds(res.body);
    expect(ids).toContain(adultoGiId);
    expect(ids).toContain(kidsId);
    const names = Object.values(
      res.body.classesByWeekday as Record<string, Array<{ className: string }>>,
    )
      .flat()
      .map((i) => i.className);
    expect(names).toContain('AGD Colega');
    expect(names).not.toContain('AGD Arch'); // archived in the agenda test above
    // Buckets sorted by start time (staffing view reads top-down).
    for (const items of Object.values(res.body.classesByWeekday) as any[]) {
      const starts = items.map((i: any) => i.startTime);
      expect([...starts].sort()).toEqual(starts);
    }
  });

  // ── validation ─────────────────────────────────────────────────────────

  it('rejects malformed month and out-of-range weekday with the stable 422', async () => {
    for (const month of ['2026-13', '13-2026', '2026-1', 'abc']) {
      const res = await t.http().get(`/v1/aluno/calendar?month=${month}`).set(bearer(aluno));
      expect(res.status, month).toBe(422);
      expect(res.body.code).toBe('validation.failed');
      expect(res.body.errors[0].field).toBe('month');
    }
    const echoed = await t.http().get('/v1/admin/calendar?month=2026-02').set(bearer(admin));
    expect(echoed.status).toBe(200);
    expect(echoed.body.month).toBe('2026-02');

    for (const weekday of ['7', '-1', 'x']) {
      const res = await t.http().get(`/v1/aluno/agenda?weekday=${weekday}`).set(bearer(aluno));
      expect(res.status, weekday).toBe(422);
      expect(res.body.code).toBe('validation.failed');
    }
  });

  // ── RBAC + RLS + read-only ─────────────────────────────────────────────

  it('personas cannot cross agenda/calendar surfaces (RolesGuard default deny)', async () => {
    const cases: Array<[string, string, string]> = [
      ['responsavel', responsavel, '/v1/aluno/agenda'],
      ['responsavel', responsavel, '/v1/aluno/calendar'],
      ['aluno', aluno, '/v1/professor/calendar'],
      ['aluno', aluno, '/v1/admin/calendar'],
      ['professor', professor, '/v1/aluno/agenda'],
      ['professor', professor, '/v1/admin/calendar'],
      ['admin', admin, '/v1/aluno/agenda'],
      ['admin', admin, '/v1/professor/calendar'],
    ];
    for (const [who, token, path] of cases) {
      const res = await t.http().get(path).set(bearer(token));
      expect(res.status, `${who} → ${path}`).toBe(403);
      expect(res.body.code, `${who} → ${path}`).toBe('authz.forbidden_role');
    }
  });

  it('RLS: another academy\'s classes never leak into agenda or calendars', async () => {
    const bravoClassIds = (
      await withPlatform(t.platformDb.db, (tx) =>
        tx.select({ id: classes.id }).from(classes).where(eq(classes.tenantId, bravoId)),
      )
    ).map((r) => r.id);
    expect(bravoClassIds.length).toBeGreaterThan(0);

    const adminCal = await t.http().get('/v1/admin/calendar').set(bearer(admin));
    for (const id of bucketClassIds(adminCal.body)) {
      expect(bravoClassIds, 'admin calendar').not.toContain(id);
    }
    for (let weekday = 0; weekday <= 6; weekday += 1) {
      const body = await agenda(weekday);
      for (const item of body.classes) {
        expect(bravoClassIds, `agenda weekday ${weekday}`).not.toContain(item.classId);
      }
    }
  });

  it('read-only (delinquent) academies keep all four agenda GETs working', async () => {
    await t.setAcademyStatus('alpha-jj', 'delinquent');
    try {
      for (const [token, path] of [
        [aluno, '/v1/aluno/agenda'],
        [aluno, '/v1/aluno/calendar'],
        [professor, '/v1/professor/calendar'],
        [admin, '/v1/admin/calendar'],
      ] as const) {
        const res = await t.http().get(path).set(bearer(token));
        expect(res.status, path).toBe(200);
      }
    } finally {
      await t.setAcademyStatus('alpha-jj', 'active');
    }
  });
});
