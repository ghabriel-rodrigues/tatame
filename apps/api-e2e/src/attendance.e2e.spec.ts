import { and, count, eq, isNull } from 'drizzle-orm';
import {
  attendances,
  auditLogs,
  checkinCodes,
  classSessions,
  classes,
  users,
  withPlatform,
  withTenant,
} from '@tatame/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

/** Test-side tenant-timezone helpers — mirror the API's America/Sao_Paulo rule. */
const TZ = 'America/Sao_Paulo';
const spDate = (at: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(at);
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

describe('attendance: chamada lifecycle, check-in, roll call, revoke windows (ATT.6-9/13)', () => {
  let t: TestApp;
  let admin: string;
  let professor: string;
  let aluno: string;
  let alphaId: string;
  let bravoId: string;
  let professorUserId: string;
  let anaStudentId: string;

  /** Class with a slot open right now (start 10 min ago, 60 min long). */
  const nowSlot = () => [
    { weekday: spWeekday(), startTime: hhmm(Math.max(0, spMinutes() - 10)), durationMinutes: 60 },
  ];

  async function createClass(
    name: string,
    schedules = nowSlot(),
    capacity = 20,
  ): Promise<string> {
    const res = await t
      .http()
      .post('/v1/admin/classes')
      .set(bearer(admin))
      .send({ name, professorUserId, capacity, schedules });
    expect(res.status).toBe(201);
    return res.body.class.id;
  }

  async function enroll(classId: string, studentId: string) {
    const res = await t
      .http()
      .post(`/v1/admin/classes/${classId}/students`)
      .set(bearer(admin))
      .send({ studentId });
    expect(res.status).toBe(201);
  }

  async function openChamada(classId: string) {
    const res = await t
      .http()
      .post(`/v1/professor/classes/${classId}/live-codes`)
      .set(bearer(professor));
    expect(res.status).toBe(201);
    return res.body;
  }

  async function checkin(body: Record<string, unknown>) {
    return t.http().post('/v1/aluno/checkins').set(bearer(aluno)).send(body);
  }

  async function activeAttendanceCount(sessionId: string, studentId?: string): Promise<number> {
    const rows = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ total: count() })
        .from(attendances)
        .where(
          and(
            eq(attendances.classSessionId, sessionId),
            isNull(attendances.revokedAt),
            ...(studentId ? [eq(attendances.studentId, studentId)] : []),
          ),
        ),
    );
    return Number(rows[0]?.total ?? 0);
  }

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await t.login('admin@tatame.dev')).accessToken;
    professor = (await t.login('professor@tatame.dev')).accessToken;
    aluno = (await t.login('aluno@tatame.dev')).accessToken;
    alphaId = await t.academyIdBySlug('alpha-jj');
    bravoId = await t.academyIdBySlug('bravo-bjj');

    const professors = await t.http().get('/v1/admin/professors').set(bearer(admin));
    professorUserId = professors.body.professors.find(
      (p: any) => p.email === 'professor@tatame.dev',
    ).userId;

    const students = await t.http().get('/v1/admin/students').set(bearer(admin));
    anaStudentId = students.body.students.find((s: any) => s.fullName === 'Ana Aluna').id;
  });

  afterAll(async () => {
    await t.close();
  });

  // ── chamada lifecycle ──────────────────────────────────────────────────

  let chamadaClassId: string;
  let liveCode: any;

  it('opening chamada materializes today\'s session and mints a 4-digit code + QR token', async () => {
    chamadaClassId = await createClass('E2E Chamada');
    await enroll(chamadaClassId, anaStudentId);

    liveCode = await openChamada(chamadaClassId);
    expect(liveCode.code).toMatch(/^\d{4}$/);
    expect(liveCode.qrToken.length).toBeGreaterThanOrEqual(16);
    expect(new Date(liveCode.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(liveCode.session.classId).toBe(chamadaClassId);
    expect(liveCode.session.sessionDate).toBe(spDate());
    expect(liveCode.presentCount).toBe(0);
  });

  it('open is idempotent — an already-open chamada returns the same active code', async () => {
    const again = await openChamada(chamadaClassId);
    expect(again.id).toBe(liveCode.id);
    expect(again.code).toBe(liveCode.code);
    expect(again.session.id).toBe(liveCode.session.id);
  });

  it('opening chamada for a foreign class is a 404, never a 403', async () => {
    const [bravoClass] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: classes.id })
        .from(classes)
        .where(and(eq(classes.tenantId, bravoId), eq(classes.name, 'Adulto Gi'))),
    );
    const res = await t
      .http()
      .post(`/v1/professor/classes/${bravoClass!.id}/live-codes`)
      .set(bearer(professor));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('resource.not_found');
  });

  // ── aluno check-in ─────────────────────────────────────────────────────

  it('aluno checks in by QR token and gets fresh stats back', async () => {
    const res = await checkin({ method: 'qr', qrToken: liveCode.qrToken });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('checked_in');
    expect(res.body.attendance.method).toBe('qr');
    expect(res.body.session.id).toBe(liveCode.session.id);
    expect(res.body.stats.totalLessons).toBeGreaterThanOrEqual(1);
    expect(res.body.stats.monthTotalSessions).toBeGreaterThanOrEqual(1);
  });

  it('a second attempt lands on the already-checked-in state — same row, never an error', async () => {
    const first = await checkin({ method: 'code', code: liveCode.code });
    expect(first.status).toBe(200);
    expect(first.body.status).toBe('already_checked_in');
    expect(await activeAttendanceCount(liveCode.session.id, anaStudentId)).toBe(1);
  });

  it('wrong code and foreign-academy code behave as nonexistent', async () => {
    const wrongDigits = liveCode.code === '0000' ? '0001' : '0000';
    const wrong = await checkin({ method: 'code', code: wrongDigits });
    expect(wrong.status).toBe(404);
    expect(wrong.body.code).toBe('checkin.code_invalid');

    // A live code in Bravo — invisible from Alpha even with the exact digits.
    const [multiUser] = await withPlatform(t.platformDb.db, (tx) =>
      tx.select({ id: users.id }).from(users).where(eq(users.email, 'multi@tatame.dev')),
    );
    const [bravoClass] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: classes.id })
        .from(classes)
        .where(and(eq(classes.tenantId, bravoId), eq(classes.name, 'Kids'))),
    );
    await withTenant(t.appDb.db, bravoId, async (tx) => {
      const [session] = await tx
        .insert(classSessions)
        .values({ tenantId: bravoId, classId: bravoClass!.id, sessionDate: spDate() })
        .onConflictDoNothing({
          target: [classSessions.tenantId, classSessions.classId, classSessions.sessionDate],
        })
        .returning({ id: classSessions.id });
      const sessionId =
        session?.id ??
        (
          await tx
            .select({ id: classSessions.id })
            .from(classSessions)
            .where(
              and(eq(classSessions.classId, bravoClass!.id), eq(classSessions.sessionDate, spDate())),
            )
        )[0]!.id;
      await tx.insert(checkinCodes).values({
        tenantId: bravoId,
        classSessionId: sessionId,
        code: '7777',
        qrToken: 'bravo-e2e-qr-token',
        openedByUserId: multiUser!.id,
        expiresAt: new Date(Date.now() + 3_600_000),
      });
    });

    const foreignCode = await checkin({ method: 'code', code: '7777' });
    expect(foreignCode.status).toBe(404);
    expect(foreignCode.body.code).toBe('checkin.code_invalid');
    const foreignQr = await checkin({ method: 'qr', qrToken: 'bravo-e2e-qr-token' });
    expect(foreignQr.status).toBe(404);
    expect(foreignQr.body.code).toBe('checkin.code_invalid');
  });

  it('rejects a non-enrolled student on every method with checkin.not_enrolled', async () => {
    const otherClassId = await createClass('E2E NotEnrolled');
    const otherLive = await openChamada(otherClassId);

    const viaCode = await checkin({ method: 'code', code: otherLive.code });
    expect(viaCode.status).toBe(403);
    expect(viaCode.body.code).toBe('checkin.not_enrolled');

    const viaManual = await checkin({ method: 'manual', classId: otherClassId });
    expect(viaManual.status).toBe(403);
    expect(viaManual.body.code).toBe('checkin.not_enrolled');
  });

  it('manual check-in outside the window / with no slot today is rejected', async () => {
    const m = spMinutes();
    const farSlot = [
      {
        weekday: spWeekday(),
        startTime: hhmm(m >= 100 ? m - 100 : m + 120),
        durationMinutes: 45,
      },
    ];
    const outsideClassId = await createClass('E2E Fora', farSlot);
    const outside = await checkin({ method: 'manual', classId: outsideClassId });
    expect(outside.status).toBe(422);
    expect(outside.body.code).toBe('checkin.outside_window');

    const otherDay = [
      { weekday: (spWeekday() + 3) % 7, startTime: '10:00', durationMinutes: 60 },
    ];
    const noTodayClassId = await createClass('E2E SemHoje', otherDay);
    const noSession = await checkin({ method: 'manual', classId: noTodayClassId });
    expect(noSession.status).toBe(422);
    expect(noSession.body.code).toBe('checkin.no_session_today');
  });

  it('re-check-in after an admin revoke works; two concurrent check-ins admit exactly one', async () => {
    // Revoke Ana's active attendance (admin, any-time, audited).
    const rollCall = await t
      .http()
      .post(`/v1/professor/classes/${chamadaClassId}/roll-call`)
      .set(bearer(professor));
    const anaRow = rollCall.body.roster.find((r: any) => r.studentId === anaStudentId);
    const revoke = await t
      .http()
      .post(`/v1/admin/attendances/${anaRow.attendance.id}/revoke`)
      .set(bearer(admin))
      .send({ reason: 'e2e: reset for race test' });
    expect(revoke.status).toBe(200);
    expect(revoke.body.status).toBe('revoked');
    expect(await activeAttendanceCount(liveCode.session.id, anaStudentId)).toBe(0);

    // The sanctioned correction pattern: the partial unique admits a new row.
    const [a, b] = await Promise.all([
      checkin({ method: 'code', code: liveCode.code }),
      checkin({ method: 'code', code: liveCode.code }),
    ]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect([a.body.status, b.body.status].sort()).toEqual(['already_checked_in', 'checked_in']);
    expect(await activeAttendanceCount(liveCode.session.id, anaStudentId)).toBe(1);
  });

  it('session materialization is idempotent under concurrent open-chamada + manual check-in', async () => {
    const raceClassId = await createClass('E2E Corrida');
    await enroll(raceClassId, anaStudentId);
    const [opened, manual] = await Promise.all([
      t.http().post(`/v1/professor/classes/${raceClassId}/live-codes`).set(bearer(professor)),
      checkin({ method: 'manual', classId: raceClassId }),
    ]);
    expect(opened.status).toBe(201);
    expect(manual.status).toBe(200);
    expect(manual.body.status).toBe('checked_in');
    expect(manual.body.attendance.method).toBe('manual');

    const rows = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ total: count() })
        .from(classSessions)
        .where(and(eq(classSessions.classId, raceClassId), eq(classSessions.sessionDate, spDate()))),
    );
    expect(Number(rows[0]?.total)).toBe(1);
  });

  // ── code expiry, close, reopen ─────────────────────────────────────────

  it('expired codes are rejected and the next open revokes the stale row before minting', async () => {
    await withPlatform(t.platformDb.db, (tx) =>
      tx
        .update(checkinCodes)
        .set({ expiresAt: new Date(Date.now() - 60_000) })
        .where(eq(checkinCodes.id, liveCode.id)),
    );
    const expired = await checkin({ method: 'code', code: liveCode.code });
    expect(expired.status).toBe(404);
    expect(expired.body.code).toBe('checkin.code_invalid');

    // The stale-code mint path: expired-but-unclosed rows are revoked so the
    // one-active-per-session partial unique admits the fresh code.
    const reopened = await openChamada(chamadaClassId);
    expect(reopened.id).not.toBe(liveCode.id);
    expect(reopened.session.id).toBe(liveCode.session.id);

    const [stale] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ revokedAt: checkinCodes.revokedAt })
        .from(checkinCodes)
        .where(eq(checkinCodes.id, liveCode.id)),
    );
    expect(stale!.revokedAt).not.toBeNull();
    const active = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ total: count() })
        .from(checkinCodes)
        .where(
          and(
            eq(checkinCodes.classSessionId, liveCode.session.id),
            isNull(checkinCodes.revokedAt),
          ),
        ),
    );
    expect(Number(active[0]?.total)).toBe(1);
    liveCode = reopened;
  });

  it('encerrar invalidates code + QR immediately; reopening mints a fresh single active code', async () => {
    const closed = await t
      .http()
      .post(`/v1/professor/live-codes/${liveCode.id}/close`)
      .set(bearer(professor));
    expect(closed.status).toBe(200);
    expect(closed.body.revokedAt).not.toBeNull();
    expect(closed.body.session.status).toBe('done');

    const late = await checkin({ method: 'qr', qrToken: liveCode.qrToken });
    expect(late.status).toBe(404);
    expect(late.body.code).toBe('checkin.code_invalid');

    const reopened = await openChamada(chamadaClassId);
    expect(reopened.id).not.toBe(liveCode.id);
    expect(reopened.session.id).toBe(liveCode.session.id);
    expect(reopened.session.status).toBe('scheduled');
    const active = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ total: count() })
        .from(checkinCodes)
        .where(
          and(
            eq(checkinCodes.classSessionId, liveCode.session.id),
            isNull(checkinCodes.revokedAt),
          ),
        ),
    );
    expect(Number(active[0]?.total)).toBe(1);
    liveCode = reopened;
  });

  // ── professor manual roll call ─────────────────────────────────────────

  let manualStudentId: string;
  let manualAttendanceId: string;

  it('roll call lists the roster with self check-ins pre-toggled; marking is audited', async () => {
    const created = await t
      .http()
      .post('/v1/admin/students')
      .set(bearer(admin))
      .send({ fullName: 'Marcos Manual', birthDate: '1999-09-09' });
    manualStudentId = created.body.student.id;
    await enroll(chamadaClassId, manualStudentId);

    const rollCall = await t
      .http()
      .post(`/v1/professor/classes/${chamadaClassId}/roll-call`)
      .set(bearer(professor));
    expect(rollCall.status).toBe(200);
    const ana = rollCall.body.roster.find((r: any) => r.studentId === anaStudentId);
    expect(ana.attendance).not.toBeNull(); // QR self check-in appears toggled on
    expect(ana.attendance.recordedByUserId).toBeNull();
    const marcos = rollCall.body.roster.find((r: any) => r.studentId === manualStudentId);
    expect(marcos.attendance).toBeNull();
    expect(rollCall.body.presentCount).toBe(1);

    const marked = await t
      .http()
      .post(`/v1/professor/sessions/${rollCall.body.session.id}/attendances`)
      .set(bearer(professor))
      .send({ studentId: manualStudentId });
    expect(marked.status).toBe(200);
    expect(marked.body.status).toBe('checked_in');
    expect(marked.body.presentCount).toBe(2);
    manualAttendanceId = marked.body.attendance.id;

    // Professor-recorded manual rows are audited in the same transaction.
    const audits = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.action, 'attendance.recorded_manual'),
            eq(auditLogs.targetId, manualAttendanceId),
          ),
        ),
    );
    expect(audits).toHaveLength(1);
    expect(audits[0]!.actorUserId).toBe(professorUserId);

    // Per-tap semantics: marking again is benign.
    const again = await t
      .http()
      .post(`/v1/professor/sessions/${rollCall.body.session.id}/attendances`)
      .set(bearer(professor))
      .send({ studentId: manualStudentId });
    expect(again.status).toBe(200);
    expect(again.body.status).toBe('already_checked_in');
    expect(again.body.attendance.id).toBe(manualAttendanceId);
  });

  it('same-day professor revoke works (audited same_day) and re-marking is possible', async () => {
    const revoked = await t
      .http()
      .post(`/v1/professor/attendances/${manualAttendanceId}/revoke`)
      .set(bearer(professor))
      .send({ reason: 'mis-tap' });
    expect(revoked.status).toBe(200);
    expect(revoked.body.status).toBe('revoked');
    expect(revoked.body.presentCount).toBe(1);

    const audits = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.action, 'attendance.revoked'), eq(auditLogs.targetId, manualAttendanceId)),
        ),
    );
    expect(audits).toHaveLength(1);
    expect((audits[0]!.metadata as any).window).toBe('same_day');

    // A second toggle-off tap is benign, and re-marking re-inserts.
    const again = await t
      .http()
      .post(`/v1/professor/attendances/${manualAttendanceId}/revoke`)
      .set(bearer(professor))
      .send({});
    expect(again.status).toBe(200);
    expect(again.body.status).toBe('already_revoked');

    const remarked = await t
      .http()
      .post(`/v1/professor/sessions/${liveCode.session.id}/attendances`)
      .set(bearer(professor))
      .send({ studentId: manualStudentId });
    expect(remarked.status).toBe(200);
    expect(remarked.body.status).toBe('checked_in');
    expect(remarked.body.attendance.id).not.toBe(manualAttendanceId);
  });

  // ── revoke windows (professor next-day 403, admin any-time) ────────────

  let pastAttendanceId: string;
  let pastSessionId: string;

  it('professor cannot revoke after the session\'s day; the admin can, audited as admin_late', async () => {
    const yesterday = spDate(new Date(Date.now() - 86_400_000));
    await withTenant(t.appDb.db, alphaId, async (tx) => {
      const [session] = await tx
        .insert(classSessions)
        .values({ tenantId: alphaId, classId: chamadaClassId, sessionDate: yesterday })
        .returning({ id: classSessions.id });
      pastSessionId = session!.id;
      const [attendance] = await tx
        .insert(attendances)
        .values({
          tenantId: alphaId,
          classSessionId: pastSessionId,
          studentId: anaStudentId,
          method: 'manual',
          checkedInAt: new Date(Date.now() - 86_400_000),
          recordedByUserId: professorUserId,
        })
        .returning({ id: attendances.id });
      pastAttendanceId = attendance!.id;
    });

    const professorLate = await t
      .http()
      .post(`/v1/professor/attendances/${pastAttendanceId}/revoke`)
      .set(bearer(professor))
      .send({});
    expect(professorLate.status).toBe(403);
    expect(professorLate.body.code).toBe('attendance.revoke_window_closed');

    const adminLate = await t
      .http()
      .post(`/v1/admin/attendances/${pastAttendanceId}/revoke`)
      .set(bearer(admin))
      .send({ reason: 'late correction' });
    expect(adminLate.status).toBe(200);
    expect(adminLate.body.status).toBe('revoked');

    const audits = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(eq(auditLogs.action, 'attendance.revoked'), eq(auditLogs.targetId, pastAttendanceId)),
        ),
    );
    expect(audits).toHaveLength(1);
    expect((audits[0]!.metadata as any).window).toBe('admin_late');
  });

  it('revokes of foreign-tenant attendances are 404s (seam validates the tenant)', async () => {
    const [bravoAttendance] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: attendances.id })
        .from(attendances)
        .where(and(eq(attendances.tenantId, bravoId), isNull(attendances.revokedAt)))
        .limit(1),
    );
    expect(bravoAttendance).toBeTruthy();
    const res = await t
      .http()
      .post(`/v1/admin/attendances/${bravoAttendance!.id}/revoke`)
      .set(bearer(admin))
      .send({});
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('resource.not_found');
  });

  // ── immutability through the app role ──────────────────────────────────

  it('the app role can neither UPDATE nor DELETE attendances (append-only layers)', async () => {
    // Drizzle wraps the pg error ("Failed query: ...") — assert the rejection
    // and then the observable truth: the row is byte-for-byte untouched.
    await expect(
      withTenant(t.appDb.db, alphaId, (tx) =>
        tx
          .update(attendances)
          .set({ method: 'qr' })
          .where(eq(attendances.id, pastAttendanceId)),
      ),
    ).rejects.toThrow();

    await expect(
      withTenant(t.appDb.db, alphaId, (tx) =>
        tx.delete(attendances).where(eq(attendances.id, pastAttendanceId)),
      ),
    ).rejects.toThrow();

    const [row] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ method: attendances.method })
        .from(attendances)
        .where(eq(attendances.id, pastAttendanceId)),
    );
    expect(row).toBeTruthy(); // DELETE refused
    expect(row!.method).toBe('manual'); // UPDATE refused
  });

  // ── admin session list + professor students (ATT.9/ATT.12) ─────────────

  it('admin lists turma sessions with active attendance counts, newest first', async () => {
    const res = await t
      .http()
      .get(`/v1/admin/classes/${chamadaClassId}/sessions`)
      .set(bearer(admin));
    expect(res.status).toBe(200);
    const today = res.body.sessions.find((s: any) => s.id === liveCode.session.id);
    expect(today.presentCount).toBe(await activeAttendanceCount(liveCode.session.id));
    const past = res.body.sessions.find((s: any) => s.id === pastSessionId);
    expect(past.presentCount).toBe(0); // its only attendance was revoked
    const dates = res.body.sessions.map((s: any) => s.sessionDate);
    expect([...dates].sort().reverse()).toEqual(dates);

    const foreign = await t
      .http()
      .get(`/v1/admin/classes/${liveCode.session.id}/sessions`) // a session id is not a class id
      .set(bearer(admin));
    expect(foreign.status).toBe(404);
  });

  it('GET /professor/students filters students not enrolled in an owned class', async () => {
    const all = await t.http().get('/v1/professor/students').set(bearer(professor));
    expect(all.status).toBe(200);
    const allIds = all.body.students.map((s: any) => s.id);
    expect(allIds).toContain(anaStudentId);
    expect(allIds).toContain(manualStudentId);

    const filtered = await t
      .http()
      .get(`/v1/professor/students?notEnrolledInClassId=${chamadaClassId}`)
      .set(bearer(professor));
    expect(filtered.status).toBe(200);
    const filteredIds = filtered.body.students.map((s: any) => s.id);
    expect(filteredIds).not.toContain(anaStudentId); // enrolled
    expect(filteredIds).not.toContain(manualStudentId); // enrolled
    expect(filteredIds.length).toBeGreaterThan(0); // fillers remain candidates

    const [bravoClass] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: classes.id })
        .from(classes)
        .where(and(eq(classes.tenantId, bravoId), eq(classes.name, 'Kids'))),
    );
    const foreign = await t
      .http()
      .get(`/v1/professor/students?notEnrolledInClassId=${bravoClass!.id}`)
      .set(bearer(professor));
    expect(foreign.status).toBe(404);
  });

  // ── RBAC + read-only ───────────────────────────────────────────────────

  it('personas cannot cross surfaces (RolesGuard default deny)', async () => {
    const cases: Array<[string, 'get' | 'post', string]> = [
      [aluno, 'post', `/v1/professor/classes/${chamadaClassId}/live-codes`],
      [aluno, 'get', '/v1/professor/dashboard'],
      [aluno, 'post', `/v1/admin/attendances/${pastAttendanceId}/revoke`],
      [professor, 'post', `/v1/admin/attendances/${pastAttendanceId}/revoke`],
      [professor, 'post', '/v1/aluno/checkins'],
      [professor, 'get', '/v1/aluno/home'],
      [admin, 'get', '/v1/professor/students'],
      [admin, 'post', '/v1/aluno/checkins'],
    ];
    for (const [token, method, path] of cases) {
      const res = await (t.http() as any)[method](path).set(bearer(token)).send({});
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.code, `${method} ${path}`).toBe('authz.forbidden_role');
    }
  });

  it('read-only academies block attendance writes but keep the reads', async () => {
    await t.setAcademyStatus('alpha-jj', 'delinquent');
    try {
      const write = await checkin({ method: 'code', code: liveCode.code });
      expect(write.status).toBe(403);
      expect(write.body.code).toBe('tenant.read_only');

      const rollCall = await t
        .http()
        .post(`/v1/professor/classes/${chamadaClassId}/roll-call`)
        .set(bearer(professor));
      expect(rollCall.status).toBe(403);
      expect(rollCall.body.code).toBe('tenant.read_only');

      const home = await t.http().get('/v1/aluno/home').set(bearer(aluno));
      expect(home.status).toBe(200);
      const snapshot = await t
        .http()
        .get(`/v1/professor/live-codes/${liveCode.id}/attendances`)
        .set(bearer(professor));
      expect(snapshot.status).toBe(200);
    } finally {
      await t.setAcademyStatus('alpha-jj', 'active');
    }
  });
});
