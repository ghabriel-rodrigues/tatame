import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { and, count, eq, isNull } from 'drizzle-orm';
import { LiveRoomRegistry, StreamTicketService } from '@org/api';
import {
  attendances,
  classSessions,
  withPlatform,
  withTenant,
} from '@tatame/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

const TZ = 'America/Sao_Paulo';
const spDate = (at: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(at);
const spWeekday = (at: Date = new Date()) =>
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(
    new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short' }).format(
      at,
    ),
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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitFor(
  predicate: () => boolean,
  label: string,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await sleep(50);
  }
  throw new Error(`Timed out waiting for ${label}`);
}

describe('attendance realtime + derived stats (ATT.10/ATT.11/13)', () => {
  let t: TestApp;
  let admin: string;
  let professor: string;
  let aluno: string;
  let alphaId: string;
  let professorUserId: string;
  let anaStudentId: string;
  let liveA: any;
  let liveB: any;
  let liveClassId: string;

  const nowSlot = () => [
    {
      weekday: spWeekday(),
      startTime: hhmm(Math.max(0, spMinutes() - 10)),
      durationMinutes: 60,
    },
  ];

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await t.login('admin@tatame.dev')).accessToken;
    professor = (await t.login('professor@tatame.dev')).accessToken;
    aluno = (await t.login('aluno@tatame.dev')).accessToken;
    alphaId = await t.academyIdBySlug('alpha-jj');

    const professors = await t
      .http()
      .get('/v1/admin/professors')
      .set(bearer(admin));
    professorUserId = professors.body.professors.find(
      (p: any) => p.email === 'professor@tatame.dev',
    ).userId;
    const students = await t
      .http()
      .get('/v1/admin/students')
      .set(bearer(admin));
    anaStudentId = students.body.students.find(
      (s: any) => s.fullName === 'Ana Aluna',
    ).id;

    const classA = await t
      .http()
      .post('/v1/admin/classes')
      .set(bearer(admin))
      .send({
        name: 'Live SSE',
        professorUserId,
        capacity: 20,
        schedules: nowSlot(),
      });
    liveClassId = classA.body.class.id;
    await t
      .http()
      .post(`/v1/admin/classes/${liveClassId}/students`)
      .set(bearer(admin))
      .send({ studentId: anaStudentId });

    const classB = await t
      .http()
      .post('/v1/admin/classes')
      .set(bearer(admin))
      .send({
        name: 'Live SSE B',
        professorUserId,
        capacity: 20,
        schedules: nowSlot(),
      });

    liveA = (
      await t
        .http()
        .post(`/v1/professor/classes/${liveClassId}/live-codes`)
        .set(bearer(professor))
    ).body;
    liveB = (
      await t
        .http()
        .post(`/v1/professor/classes/${classB.body.class.id}/live-codes`)
        .set(bearer(professor))
    ).body;
  });

  afterAll(async () => {
    await t.close();
  });

  // ── stream tickets ─────────────────────────────────────────────────────

  it('mints a ~60 s single-purpose ticket over bearer REST (own live codes only)', async () => {
    const res = await t
      .http()
      .post(`/v1/professor/live-codes/${liveA.id}/stream-ticket`)
      .set(bearer(professor));
    expect(res.status).toBe(201);
    expect(res.body.ticket).toContain('.');
    expect(res.body.expiresInSeconds).toBe(60);

    const foreign = await t
      .http()
      .post(`/v1/professor/live-codes/${liveA.session.id}/stream-ticket`) // not a live-code id
      .set(bearer(professor));
    expect(foreign.status).toBe(404);
  });

  it('rejects forged, expired and wrong-room tickets with 401 stream.ticket_invalid', async () => {
    const forged = await t
      .http()
      .get(`/v1/professor/live-codes/${liveA.id}/stream?ticket=not.a.ticket`);
    expect(forged.status).toBe(401);
    expect(forged.body.code).toBe('stream.ticket_invalid');

    const missing = await t
      .http()
      .get(`/v1/professor/live-codes/${liveA.id}/stream`);
    expect(missing.status).toBe(401);

    const tickets = t.app.get(StreamTicketService);
    const expired = tickets.mint(
      { liveCodeId: liveA.id, tenantId: alphaId, userId: professorUserId },
      -10,
    );
    const expiredRes = await t
      .http()
      .get(
        `/v1/professor/live-codes/${liveA.id}/stream?ticket=${encodeURIComponent(expired.ticket)}`,
      );
    expect(expiredRes.status).toBe(401);
    expect(expiredRes.body.code).toBe('stream.ticket_invalid');

    // A valid ticket for live code B is bound to B — refused on A's stream.
    const forB = await t
      .http()
      .post(`/v1/professor/live-codes/${liveB.id}/stream-ticket`)
      .set(bearer(professor));
    const wrongRoom = await t
      .http()
      .get(
        `/v1/professor/live-codes/${liveA.id}/stream?ticket=${encodeURIComponent(forB.body.ticket)}`,
      );
    expect(wrongRoom.status).toBe(401);
    expect(wrongRoom.body.code).toBe('stream.ticket_invalid');
  });

  // ── the stream itself (post-commit bridge, real subscription) ──────────

  let checkinAttendanceId: string;

  it('delivers checkin and revoke events post-commit to an attached subscriber', async () => {
    const server = t.app.getHttpServer();
    if (!server.address()) {
      await new Promise<void>((resolve) => server.listen(0, () => resolve()));
    }
    const port = (server.address() as AddressInfo).port;

    const minted = await t
      .http()
      .post(`/v1/professor/live-codes/${liveA.id}/stream-ticket`)
      .set(bearer(professor));
    const chunks: string[] = [];
    const received = () => chunks.join('');

    const req = await new Promise<http.ClientRequest>((resolve, reject) => {
      const request = http.get(
        {
          host: '127.0.0.1',
          port,
          path: `/v1/professor/live-codes/${liveA.id}/stream?ticket=${encodeURIComponent(minted.body.ticket)}`,
        },
        (res) => {
          expect(res.statusCode).toBe(200);
          expect(res.headers['content-type']).toContain('text/event-stream');
          res.setEncoding('utf8');
          res.on('data', (chunk: string) => chunks.push(chunk));
          resolve(request);
        },
      );
      request.on('error', reject);
    });
    await sleep(150); // headers commit on the next macrotask — settle first

    // Check-in lands while the stream is attached → checkin event.
    const checkin = await t
      .http()
      .post('/v1/aluno/checkins')
      .set(bearer(aluno))
      .send({ method: 'qr', qrToken: liveA.qrToken });
    expect(checkin.status).toBe(200);
    expect(checkin.body.status).toBe('checked_in');
    checkinAttendanceId = checkin.body.attendance.id;

    await waitFor(
      () => received().includes('event: checkin'),
      'the checkin event',
    );
    expect(received()).toContain('Ana Aluna');
    expect(received()).toContain('"presentCount":1');

    // Revoke decrements the counter through the revoke event.
    const revoked = await t
      .http()
      .post(`/v1/professor/attendances/${checkinAttendanceId}/revoke`)
      .set(bearer(professor))
      .send({ reason: 'e2e stream revoke' });
    expect(revoked.status).toBe(200);
    await waitFor(
      () => received().includes('event: revoke'),
      'the revoke event',
    );
    expect(received()).toContain('"presentCount":0');

    // Ana checks in again (correction pattern) — stats below expect today attended.
    const again = await t
      .http()
      .post('/v1/aluno/checkins')
      .set(bearer(aluno))
      .send({ method: 'qr', qrToken: liveA.qrToken });
    expect(again.body.status).toBe('checked_in');
    await waitFor(
      () => received().split('event: checkin').length >= 3,
      'the second checkin event',
    );

    // Disconnect → the per-session room is cleaned up.
    req.destroy();
    const rooms = t.app.get(LiveRoomRegistry);
    await waitFor(
      () => rooms.roomCount() === 0,
      'room cleanup after disconnect',
    );
  });

  it('snapshot doubles as the polling fallback: active rows only', async () => {
    const res = await t
      .http()
      .get(`/v1/professor/live-codes/${liveA.id}/attendances`)
      .set(bearer(professor));
    expect(res.status).toBe(200);
    expect(res.body.presentCount).toBe(1); // revoked row excluded
    expect(res.body.attendances).toHaveLength(1);
    expect(res.body.attendances[0].studentName).toBe('Ana Aluna');
    expect(res.body.code.id).toBe(liveA.id);
  });

  // ── derived stats (ATT.11) ─────────────────────────────────────────────

  async function home() {
    const res = await t.http().get('/v1/aluno/home').set(bearer(aluno));
    expect(res.status).toBe(200);
    return res.body;
  }

  async function anaActiveTodayCount(): Promise<number> {
    const rows = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ total: count() })
        .from(attendances)
        .innerJoin(
          classSessions,
          eq(classSessions.id, attendances.classSessionId),
        )
        .where(
          and(
            eq(attendances.studentId, anaStudentId),
            isNull(attendances.revokedAt),
            eq(classSessions.sessionDate, spDate()),
          ),
        ),
    );
    return Number(rows[0]?.total ?? 0);
  }

  it('aluno home reports consistent presença %, lesson count and hero state', async () => {
    const body = await home();
    expect(body.student.id).toBe(anaStudentId);
    expect(body.todayClass).not.toBeNull(); // Live SSE has a slot today
    expect(body.todayClass.checkedIn).toBe(true);

    const { stats } = body;
    expect(stats.monthTotalSessions).toBeGreaterThanOrEqual(1);
    expect(stats.monthAttendedSessions).toBeLessThanOrEqual(
      stats.monthTotalSessions,
    );
    expect(stats.monthPresencePct).toBe(
      Math.round(
        (stats.monthAttendedSessions / stats.monthTotalSessions) * 100,
      ),
    );

    const rows = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ total: count() })
        .from(attendances)
        .where(
          and(
            eq(attendances.studentId, anaStudentId),
            isNull(attendances.revokedAt),
          ),
        ),
    );
    expect(stats.totalLessons).toBe(Number(rows[0]?.total));
    expect(typeof stats.streak).toBe('number');
    expect(stats.streak).toBeGreaterThanOrEqual(1);
  });

  it('a missed materialized session breaks the streak; attending it extends; revoke recomputes', async () => {
    // Materialize YESTERDAY for Live SSE with no attendance — streak must
    // stop at the sessions attended today (the honest denominator rule).
    //
    // The streak walks sessions of ALL of Ana's enrolled classes ordered by
    // (session_date DESC, starts_at DESC NULLS LAST), so the break must be
    // the FIRST of yesterday's occurrences: the dev seed materializes one
    // attended session per weekday slot, and on most weekdays one of those
    // lands on yesterday. Stamping this one at the end of yesterday sorts it
    // ahead of them, which is what makes the assertion below independent of
    // which weekday the suite runs on.
    const yesterday = spDate(new Date(Date.now() - 86_400_000));
    let yesterdaySessionId = '';
    await withTenant(t.appDb.db, alphaId, async (tx) => {
      const [session] = await tx
        .insert(classSessions)
        .values({
          tenantId: alphaId,
          classId: liveClassId,
          sessionDate: yesterday,
          startsAt: new Date(`${yesterday}T23:59:00-03:00`),
        })
        .returning({ id: classSessions.id });
      yesterdaySessionId = session!.id;
    });

    const broken = (await home()).stats.streak;
    expect(broken).toBe(await anaActiveTodayCount());

    // Attending yesterday's session re-links the chain.
    let yesterdayAttendanceId = '';
    await withTenant(t.appDb.db, alphaId, async (tx) => {
      const [row] = await tx
        .insert(attendances)
        .values({
          tenantId: alphaId,
          classSessionId: yesterdaySessionId,
          studentId: anaStudentId,
          method: 'manual',
          checkedInAt: new Date(Date.now() - 86_400_000),
          recordedByUserId: professorUserId,
        })
        .returning({ id: attendances.id });
      yesterdayAttendanceId = row!.id;
    });
    const extended = (await home()).stats.streak;
    expect(extended).toBeGreaterThan(broken);

    // Revoking retroactively recomputes — stats are derived, never cached.
    const revoked = await t
      .http()
      .post(`/v1/admin/attendances/${yesterdayAttendanceId}/revoke`)
      .set(bearer(admin))
      .send({ reason: 'e2e retroactive recompute' });
    expect(revoked.status).toBe(200);
    expect((await home()).stats.streak).toBe(broken);
  });

  it('the gamification.streak toggle hides the streak server-side (home AND check-in reply)', async () => {
    const off = await t
      .http()
      .put('/v1/admin/permissions')
      .set(bearer(admin))
      .send({
        entries: [
          { role: 'student', key: 'gamification.streak', allowed: false },
        ],
      });
    expect(off.status).toBe(200);

    expect((await home()).stats.streak).toBeNull();
    const duplicate = await t
      .http()
      .post('/v1/aluno/checkins')
      .set(bearer(aluno))
      .send({ method: 'qr', qrToken: liveA.qrToken });
    expect(duplicate.body.status).toBe('already_checked_in');
    expect(duplicate.body.stats.streak).toBeNull();

    await t
      .http()
      .put('/v1/admin/permissions')
      .set(bearer(admin))
      .send({
        entries: [
          { role: 'student', key: 'gamification.streak', allowed: true },
        ],
      });
    expect(typeof (await home()).stats.streak).toBe('number');
  });

  it('professor dashboard: alunos hoje, presença média, next-class hero with count', async () => {
    const res = await t
      .http()
      .get('/v1/professor/dashboard')
      .set(bearer(professor));
    expect(res.status).toBe(200);
    expect(res.body.alunosHoje).toBeGreaterThanOrEqual(1);
    expect(res.body.presencaMediaPct).toBeGreaterThanOrEqual(0);
    expect(res.body.presencaMediaPct).toBeLessThanOrEqual(100);

    const liveClass = res.body.todayClasses.find(
      (c: any) => c.classId === liveClassId,
    );
    expect(liveClass).toBeTruthy();
    expect(liveClass.checkedInCount).toBe(1);
    expect(liveClass.enrolledCount).toBe(1);
    expect(res.body.nextClass).not.toBeNull();
  });
});
