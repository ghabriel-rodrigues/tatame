import { randomBytes } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import pg from 'pg';
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
  attendances,
  auditLogs,
  checkinCodes,
  classSessions,
  classes,
  memberships,
  students,
  users,
} from '../schema/index.js';
import { createFreshDb, testAdminUrl, type FreshDb } from '../testing/test-db.js';

/** Drizzle wraps pg errors; the interesting message lives on the cause chain. */
async function expectRejection(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  await expect(promise).rejects.toSatisfy((error: unknown) => {
    let current = error as (Error & { cause?: unknown }) | undefined;
    while (current) {
      if (pattern.test(current.message)) return true;
      current = current.cause as (Error & { cause?: unknown }) | undefined;
    }
    return false;
  });
}

describe('attendance slice (spec 004 DB)', () => {
  let fresh: FreshDb;
  let app: DbHandle;
  let platform: DbHandle;
  /** Superuser connection — the owner path grants + RLS cannot stop, so the
   * guard trigger is the only layer left (exactly what it exists for). */
  let owner: pg.Client;

  let tenantA: string;
  let tenantB: string;
  let professorA: string;
  let adminA: string;
  let alunoA: string; // student-role member — no revoke authority
  let classA: string;
  let studentA: string;
  let studentA2: string;
  let studentB: string;

  /** Current / previous local date in the seam's tenant timezone. */
  let today: string;
  let yesterday: string;

  beforeAll(async () => {
    fresh = await createFreshDb(testAdminUrl());
    app = createAppDb(fresh.url);
    platform = createPlatformDb(fresh.url);
    owner = new pg.Client({ connectionString: fresh.url });
    await owner.connect();

    const dates = await owner.query(
      `SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date::text AS today,
              ((now() AT TIME ZONE 'America/Sao_Paulo')::date - 1)::text AS yesterday`,
    );
    today = dates.rows[0].today;
    yesterday = dates.rows[0].yesterday;

    await withPlatform(platform.db, async (tx) => {
      const [a] = await tx
        .insert(academies)
        .values({ name: 'Tenant A', slug: 'tenant-a', contactEmail: 'a@t.dev', status: 'active' })
        .returning({ id: academies.id });
      const [b] = await tx
        .insert(academies)
        .values({ name: 'Tenant B', slug: 'tenant-b', contactEmail: 'b@t.dev', status: 'active' })
        .returning({ id: academies.id });
      tenantA = a!.id;
      tenantB = b!.id;

      const insertUser = async (email: string) => {
        const [u] = await tx
          .insert(users)
          .values({ email, fullName: email })
          .returning({ id: users.id });
        return u!.id;
      };
      professorA = await insertUser('prof-a@t.dev');
      adminA = await insertUser('admin-a@t.dev');
      alunoA = await insertUser('aluno-a@t.dev');
    });

    await withTenant(app.db, tenantA, async (tx) => {
      await tx.insert(memberships).values([
        { tenantId: tenantA, userId: professorA, role: 'professor' },
        { tenantId: tenantA, userId: adminA, role: 'admin' },
        { tenantId: tenantA, userId: alunoA, role: 'student' },
      ]);
      const [c] = await tx
        .insert(classes)
        .values({ tenantId: tenantA, name: 'Adulto Gi', professorUserId: professorA, capacity: 20 })
        .returning({ id: classes.id });
      classA = c!.id;
      const [s] = await tx
        .insert(students)
        .values({ tenantId: tenantA, fullName: 'Aluno A', birthDate: '1999-01-01', userId: alunoA })
        .returning({ id: students.id });
      studentA = s!.id;
      const [s2] = await tx
        .insert(students)
        .values({ tenantId: tenantA, fullName: 'Aluno A2', birthDate: '1997-06-06' })
        .returning({ id: students.id });
      studentA2 = s2!.id;
    });

    await withTenant(app.db, tenantB, async (tx) => {
      await tx
        .insert(classes)
        .values({ tenantId: tenantB, name: 'B Class', professorUserId: professorA, capacity: 20 });
      const [s] = await tx
        .insert(students)
        .values({ tenantId: tenantB, fullName: 'Aluno B', birthDate: '1998-01-01' })
        .returning({ id: students.id });
      studentB = s!.id;
    });
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
    await platform?.close();
    await fresh?.drop();
  });

  async function createSession(tenantId: string, classId: string, sessionDate: string) {
    return withTenant(app.db, tenantId, async (tx) => {
      const [row] = await tx
        .insert(classSessions)
        .values({ tenantId, classId, sessionDate, startsAt: new Date() })
        .onConflictDoNothing({
          target: [classSessions.tenantId, classSessions.classId, classSessions.sessionDate],
        })
        .returning({ id: classSessions.id });
      if (row) return row.id;
      const [existing] = await tx
        .select({ id: classSessions.id })
        .from(classSessions)
        .where(
          and(
            eq(classSessions.classId, classId),
            eq(classSessions.sessionDate, sessionDate),
          ),
        );
      return existing!.id;
    });
  }

  async function checkIn(
    tenantId: string,
    classSessionId: string,
    studentId: string,
    method: 'qr' | 'code' | 'manual' = 'qr',
    recordedByUserId?: string,
  ) {
    return withTenant(app.db, tenantId, async (tx) => {
      const [row] = await tx
        .insert(attendances)
        .values({ tenantId, classSessionId, studentId, method, recordedByUserId })
        .returning({ id: attendances.id });
      return row!.id;
    });
  }

  async function revoke(
    tenantId: string,
    attendanceId: string,
    actorUserId: string,
    reason: string | null = null,
  ) {
    const res = await app.db.execute(
      sql`SELECT * FROM attendance_revoke(${tenantId}::uuid, ${attendanceId}::uuid, ${actorUserId}::uuid, ${reason})`,
    );
    return res.rows[0]!;
  }

  describe('RLS on the three new tables (ATT.2)', () => {
    it('fails closed with no tenant context and hides the other tenant', async () => {
      const sessionId = await createSession(tenantA, classA, '2026-01-05');
      await checkIn(tenantA, sessionId, studentA, 'qr');
      await withTenant(app.db, tenantA, (tx) =>
        tx.insert(checkinCodes).values({
          tenantId: tenantA,
          classSessionId: sessionId,
          code: '1234',
          qrToken: randomBytes(16).toString('base64url'),
          openedByUserId: professorA,
          expiresAt: new Date(Date.now() + 3600_000),
          revokedAt: new Date(), // closed — keeps later one-active tests clean
        }),
      );

      // No context: zero rows from all three tables.
      expect(await app.db.select().from(classSessions)).toHaveLength(0);
      expect(await app.db.select().from(checkinCodes)).toHaveLength(0);
      expect(await app.db.select().from(attendances)).toHaveLength(0);

      // Tenant B sees nothing of tenant A — foreign sessions do not exist.
      const fromB = await withTenant(app.db, tenantB, (tx) => tx.select().from(classSessions));
      expect(fromB.every((s) => s.tenantId === tenantB)).toBe(true);
      expect(fromB.some((s) => s.id === sessionId)).toBe(false);

      // WITH CHECK blocks writing a row into the other tenant.
      await expectRejection(
        withTenant(app.db, tenantB, (tx) =>
          tx
            .insert(classSessions)
            .values({ tenantId: tenantA, classId: classA, sessionDate: '2026-01-06' }),
        ),
        /row-level security/,
      );
    });

    it('composite FKs refuse cross-tenant references even where RLS is bypassed', async () => {
      const sessionA = await createSession(tenantA, classA, '2026-01-07');

      // Platform pool BYPASSRLS — exactly the case the composite FK guards.
      await expectRejection(
        withPlatform(platform.db, (tx) =>
          tx.insert(checkinCodes).values({
            tenantId: tenantB,
            classSessionId: sessionA, // session belongs to tenant A
            code: '9999',
            qrToken: randomBytes(16).toString('base64url'),
            openedByUserId: professorA,
            expiresAt: new Date(Date.now() + 3600_000),
          }),
        ),
        /checkin_codes_session_fk/,
      );

      // Under the app role: tenant B cannot attach an attendance to a tenant-A
      // session (no (tenantB, id) parent exists).
      await expectRejection(
        withTenant(app.db, tenantB, (tx) =>
          tx.insert(attendances).values({
            tenantId: tenantB,
            classSessionId: sessionA,
            studentId: studentB,
            method: 'qr',
          }),
        ),
        /attendances_session_fk/,
      );
    });
  });

  describe('append-only layers on attendances (ATT.3)', () => {
    it('grant layer: UPDATE and DELETE are denied to both runtime roles', async () => {
      const sessionId = await createSession(tenantA, classA, '2026-01-08');
      const attendanceId = await checkIn(tenantA, sessionId, studentA, 'code');

      await expectRejection(
        withTenant(app.db, tenantA, (tx) =>
          tx.update(attendances).set({ method: 'manual' }).where(eq(attendances.id, attendanceId)),
        ),
        /permission denied/,
      );
      await expectRejection(
        withTenant(app.db, tenantA, (tx) =>
          tx.delete(attendances).where(eq(attendances.id, attendanceId)),
        ),
        /permission denied/,
      );

      // Platform reads only: INSERT, UPDATE and DELETE all refused.
      await expectRejection(
        withPlatform(platform.db, (tx) =>
          tx.update(attendances).set({ method: 'manual' }).where(eq(attendances.id, attendanceId)),
        ),
        /permission denied/,
      );
      await expectRejection(
        withPlatform(platform.db, (tx) =>
          tx.delete(attendances).where(eq(attendances.id, attendanceId)),
        ),
        /permission denied/,
      );
      await expectRejection(
        withPlatform(platform.db, (tx) =>
          tx.insert(attendances).values({
            tenantId: tenantA,
            classSessionId: sessionId,
            studentId: studentB,
            method: 'qr',
          }),
        ),
        /permission denied/,
      );
    });

    it('trigger layer: the owner path is refused too, except the revoke transition — once', async () => {
      const sessionId = await createSession(tenantA, classA, '2026-01-09');
      const attendanceId = await checkIn(tenantA, sessionId, studentA, 'qr');

      // History columns can never change, and rows can never disappear.
      await expect(
        owner.query(`UPDATE attendances SET method = 'manual' WHERE id = $1`, [attendanceId]),
      ).rejects.toThrow(/append-only/);
      await expect(
        owner.query(`DELETE FROM attendances WHERE id = $1`, [attendanceId]),
      ).rejects.toThrow(/append-only/);

      // Sneaking a data change inside the revoke transition is refused.
      await expect(
        owner.query(
          `UPDATE attendances SET revoked_at = now(), revoked_by_user_id = $2, method = 'manual'
           WHERE id = $1`,
          [attendanceId, adminA],
        ),
      ).rejects.toThrow(/append-only/);

      // The sanctioned transition: revoke columns NULL -> set, exactly once.
      await owner.query(
        `UPDATE attendances
         SET revoked_at = now(), revoked_by_user_id = $2, revoke_reason = 'test', updated_at = now()
         WHERE id = $1`,
        [attendanceId, adminA],
      );
      await expect(
        owner.query(
          `UPDATE attendances SET revoked_at = now(), revoked_by_user_id = $2 WHERE id = $1`,
          [attendanceId, adminA],
        ),
      ).rejects.toThrow(/append-only/);
    });

    it('guards audit_logs unconditionally', async () => {
      const inserted = await owner.query(
        `SELECT audit_append($1::uuid, $2::uuid, NULL, 'test.action', NULL, NULL, NULL) AS id`,
        [tenantA, adminA],
      );
      const auditId = inserted.rows[0].id;
      await expect(
        owner.query(`UPDATE audit_logs SET action = 'forged' WHERE id = $1`, [auditId]),
      ).rejects.toThrow(/append-only/);
      await expect(
        owner.query(`DELETE FROM audit_logs WHERE id = $1`, [auditId]),
      ).rejects.toThrow(/append-only/);
    });
  });

  describe('active-check-in uniqueness (ATT.1)', () => {
    it('admits exactly one active row per (tenant, session, student), re-openable by revoke', async () => {
      const sessionId = await createSession(tenantA, classA, today);
      const firstId = await checkIn(tenantA, sessionId, studentA, 'qr');

      await expectRejection(
        checkIn(tenantA, sessionId, studentA, 'code'),
        /attendances_active_session_student_uq/,
      );

      // Revoke (professor, same day) unlocks the sanctioned re-check-in…
      const res = await revoke(tenantA, firstId, professorA, 'mis-tap');
      expect(res['status']).toBe('revoked');
      const secondId = await checkIn(tenantA, sessionId, studentA, 'manual', professorA);
      expect(secondId).not.toBe(firstId);

      // …and the active-uniqueness gate closes again.
      await expectRejection(
        checkIn(tenantA, sessionId, studentA, 'qr'),
        /attendances_active_session_student_uq/,
      );

      // Both rows remain — history never shrinks.
      const rows = await withTenant(app.db, tenantA, (tx) =>
        tx
          .select()
          .from(attendances)
          .where(and(eq(attendances.classSessionId, sessionId), eq(attendances.studentId, studentA))),
      );
      expect(rows).toHaveLength(2);
      expect(rows.filter((r) => r.revokedAt === null)).toHaveLength(1);
    });

    it('admits exactly one of two simultaneous check-ins', async () => {
      const sessionId = await createSession(tenantA, classA, '2026-01-12');
      const race = await Promise.allSettled([
        checkIn(tenantA, sessionId, studentA, 'qr'),
        checkIn(tenantA, sessionId, studentA, 'code'),
      ]);
      expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(race.filter((r) => r.status === 'rejected')).toHaveLength(1);
    });
  });

  describe('checkin_codes shape (ATT.1)', () => {
    it('rejects non-4-digit codes and enforces one active code per session', async () => {
      const sessionId = await createSession(tenantA, classA, '2026-01-13');
      const mint = (code: string, revokedAt?: Date) =>
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(checkinCodes).values({
            tenantId: tenantA,
            classSessionId: sessionId,
            code,
            qrToken: randomBytes(16).toString('base64url'),
            openedByUserId: professorA,
            expiresAt: new Date(Date.now() + 3600_000),
            revokedAt,
          }),
        );

      await expectRejection(mint('abcd'), /checkin_codes_code_digits_ck/);
      await expectRejection(mint('123'), /checkin_codes_code_digits_ck/);

      await mint('4321');
      // A second active code for the same session is impossible…
      await expectRejection(mint('8765'), /checkin_codes_one_active_per_session_uq/);

      // …until "Encerrar chamada" (an UPDATE the app role CAN do here —
      // checkin_codes is not append-only) closes the window; reopening then
      // inserts a fresh row.
      await withTenant(app.db, tenantA, (tx) =>
        tx
          .update(checkinCodes)
          .set({ revokedAt: new Date() })
          .where(and(eq(checkinCodes.classSessionId, sessionId), sql`${checkinCodes.revokedAt} IS NULL`)),
      );
      await mint('8765');

      // Active digits are unique per tenant (unambiguous code resolution).
      const otherSession = await createSession(tenantA, classA, '2026-01-14');
      await expectRejection(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(checkinCodes).values({
            tenantId: tenantA,
            classSessionId: otherSession,
            code: '8765',
            qrToken: randomBytes(16).toString('base64url'),
            openedByUserId: professorA,
            expiresAt: new Date(Date.now() + 3600_000),
          }),
        ),
        /checkin_codes_tenant_code_active_uq/,
      );
    });
  });

  describe('attendance_revoke seam (ATT.4)', () => {
    it('professor revokes same-day, audited with window same_day', async () => {
      // Today's session may already exist from the uniqueness test — the
      // materialization helper is idempotent and the student differs.
      const sessionId = await createSession(tenantA, classA, today);
      const attendanceId = await checkIn(tenantA, sessionId, studentA2, 'qr');

      const res = await revoke(tenantA, attendanceId, professorA, 'wrong student');
      expect(res['status']).toBe('revoked');
      expect(res['revoke_window']).toBe('same_day');

      const [row] = await withTenant(app.db, tenantA, (tx) =>
        tx.select().from(attendances).where(eq(attendances.id, attendanceId)),
      );
      expect(row!.revokedAt).not.toBeNull();
      expect(row!.revokedByUserId).toBe(professorA);
      expect(row!.revokeReason).toBe('wrong student');

      const audit = await withTenant(app.db, tenantA, (tx) =>
        tx
          .select()
          .from(auditLogs)
          .where(and(eq(auditLogs.action, 'attendance.revoked'), eq(auditLogs.targetId, attendanceId))),
      );
      expect(audit).toHaveLength(1);
      expect(audit[0]!.actorUserId).toBe(professorA);
      expect((audit[0]!.metadata as Record<string, unknown>)['window']).toBe('same_day');
    });

    it('refuses the professor after the session day closes; admin may revoke any time', async () => {
      const sessionId = await createSession(tenantA, classA, yesterday);
      const attendanceId = await checkIn(tenantA, sessionId, studentA, 'qr');

      const late = await revoke(tenantA, attendanceId, professorA);
      expect(late['status']).toBe('window_closed');
      const [untouched] = await withTenant(app.db, tenantA, (tx) =>
        tx.select().from(attendances).where(eq(attendances.id, attendanceId)),
      );
      expect(untouched!.revokedAt).toBeNull();

      const adminRes = await revoke(tenantA, attendanceId, adminA, 'late correction');
      expect(adminRes['status']).toBe('revoked');
      expect(adminRes['revoke_window']).toBe('admin_late');

      const audit = await withTenant(app.db, tenantA, (tx) =>
        tx
          .select()
          .from(auditLogs)
          .where(and(eq(auditLogs.action, 'attendance.revoked'), eq(auditLogs.targetId, attendanceId))),
      );
      expect(audit).toHaveLength(1);
      expect((audit[0]!.metadata as Record<string, unknown>)['window']).toBe('admin_late');
    });

    it('refuses cross-tenant ids, non-privileged actors and double revokes', async () => {
      const sessionId = await createSession(tenantA, classA, '2026-01-15');
      const attendanceId = await checkIn(tenantA, sessionId, studentA, 'manual', professorA);

      // Foreign tenant: the row behaves as nonexistent.
      const cross = await revoke(tenantB, attendanceId, adminA);
      expect(cross['status']).toBe('not_found');

      // A student-role member has no revoke authority.
      const student = await revoke(tenantA, attendanceId, alunoA);
      expect(student['status']).toBe('not_allowed');

      const first = await revoke(tenantA, attendanceId, adminA);
      expect(first['status']).toBe('revoked');
      const second = await revoke(tenantA, attendanceId, adminA);
      expect(second['status']).toBe('already_revoked');
    });
  });

  describe('professor manual record + audit (ATT.4)', () => {
    it('writes the manual row and attendance.recorded_manual in one transaction', async () => {
      const sessionId = await createSession(tenantA, classA, '2026-01-16');

      const attendanceId = await withTenant(app.db, tenantA, async (tx) => {
        const [row] = await tx
          .insert(attendances)
          .values({
            tenantId: tenantA,
            classSessionId: sessionId,
            studentId: studentA,
            method: 'manual',
            recordedByUserId: professorA,
          })
          .returning({ id: attendances.id });
        await tx.execute(
          sql`SELECT audit_append(${tenantA}::uuid, ${professorA}::uuid, NULL,
                ${'attendance.recorded_manual'}, ${'attendance'}, ${row!.id},
                ${JSON.stringify({ class_session_id: sessionId, student_id: studentA })}::jsonb)`,
        );
        return row!.id;
      });

      const [row] = await withTenant(app.db, tenantA, (tx) =>
        tx.select().from(attendances).where(eq(attendances.id, attendanceId)),
      );
      expect(row!.method).toBe('manual');
      expect(row!.recordedByUserId).toBe(professorA);

      const audit = await withTenant(app.db, tenantA, (tx) =>
        tx
          .select()
          .from(auditLogs)
          .where(
            and(
              eq(auditLogs.action, 'attendance.recorded_manual'),
              eq(auditLogs.targetId, attendanceId),
            ),
          ),
      );
      expect(audit).toHaveLength(1);
      expect(audit[0]!.actorUserId).toBe(professorA);
    });
  });
});
