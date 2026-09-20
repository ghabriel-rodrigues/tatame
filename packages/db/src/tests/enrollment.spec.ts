import { createHash } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
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
  classes,
  enrollments,
  guardians,
  invites,
  memberships,
  students,
  users,
} from '../schema/index.js';
import {
  createFreshDb,
  testAdminUrl,
  type FreshDb,
} from '../testing/test-db.js';

const sha256 = (value: string) =>
  createHash('sha256').update(value).digest('hex');

const WEEK = 7 * 24 * 3600 * 1000;

/** Drizzle wraps pg errors; the interesting message lives on the cause chain. */
async function expectRejection(
  promise: Promise<unknown>,
  pattern: RegExp,
): Promise<void> {
  await expect(promise).rejects.toSatisfy((error: unknown) => {
    let current = error as (Error & { cause?: unknown }) | undefined;
    while (current) {
      if (pattern.test(current.message)) return true;
      current = current.cause as (Error & { cause?: unknown }) | undefined;
    }
    return false;
  });
}

describe('enrollment slice (spec 003 DB)', () => {
  let fresh: FreshDb;
  let app: DbHandle;
  let platform: DbHandle;

  let tenantA: string;
  let tenantB: string;
  let professorA: string;

  beforeAll(async () => {
    fresh = await createFreshDb(testAdminUrl());
    app = createAppDb(fresh.url);
    platform = createPlatformDb(fresh.url);

    await withPlatform(platform.db, async (tx) => {
      const [a] = await tx
        .insert(academies)
        .values({
          name: 'Tenant A',
          slug: 'tenant-a',
          contactEmail: 'a@t.dev',
          status: 'active',
        })
        .returning({ id: academies.id });
      const [b] = await tx
        .insert(academies)
        .values({
          name: 'Tenant B',
          slug: 'tenant-b',
          contactEmail: 'b@t.dev',
          status: 'active',
        })
        .returning({ id: academies.id });
      tenantA = a!.id;
      tenantB = b!.id;

      const [prof] = await tx
        .insert(users)
        .values({ email: 'prof-a@t.dev', fullName: 'Prof A' })
        .returning({ id: users.id });
      professorA = prof!.id;
    });
  });

  afterAll(async () => {
    await app?.close();
    await platform?.close();
    await fresh?.drop();
  });

  async function createClass(
    tenantId: string,
    name: string,
    capacity: number,
    extra: Partial<{
      ageMin: number;
      ageMax: number;
      status: 'active' | 'archived';
    }> = {},
  ): Promise<string> {
    return withTenant(app.db, tenantId, async (tx) => {
      const [row] = await tx
        .insert(classes)
        .values({
          tenantId,
          name,
          professorUserId: professorA,
          capacity,
          ...extra,
        })
        .returning({ id: classes.id });
      return row!.id;
    });
  }

  async function createInvite(
    tenantId: string,
    token: string,
    kind: 'student' | 'guardian',
    classId: string | null,
  ): Promise<void> {
    await withTenant(app.db, tenantId, async (tx) => {
      await tx.insert(invites).values({
        tenantId,
        tokenHash: sha256(token),
        kind,
        classId,
        createdByUserId: professorA,
        expiresAt: new Date(Date.now() + WEEK),
      });
    });
  }

  describe('RLS on the five new tables', () => {
    it('fails closed with no tenant context and hides the other tenant', async () => {
      await withTenant(app.db, tenantA, async (tx) => {
        const [g] = await tx
          .insert(guardians)
          .values({ tenantId: tenantA, fullName: 'Rls Guardian' })
          .returning({ id: guardians.id });
        await tx.insert(students).values({
          tenantId: tenantA,
          fullName: 'Rls Student',
          birthDate: '2015-01-01',
          guardianId: g!.id,
        });
      });

      // No context: zero rows.
      expect(await app.db.select().from(students)).toHaveLength(0);
      expect(await app.db.select().from(guardians)).toHaveLength(0);
      expect(await app.db.select().from(classes)).toHaveLength(0);
      expect(await app.db.select().from(enrollments)).toHaveLength(0);

      // Tenant B sees nothing of tenant A.
      const fromB = await withTenant(app.db, tenantB, (tx) =>
        tx.select().from(students),
      );
      expect(fromB).toHaveLength(0);

      // WITH CHECK blocks writing into the other tenant.
      await expectRejection(
        withTenant(app.db, tenantB, (tx) =>
          tx
            .insert(guardians)
            .values({ tenantId: tenantA, fullName: 'Cross Tenant' }),
        ),
        /row-level security/,
      );
    });

    it('composite FKs refuse cross-tenant references even where RLS is bypassed', async () => {
      const classA = await createClass(tenantA, 'FK Class A', 10);
      // The platform pool BYPASSRLS — exactly the case the composite FK guards.
      await expectRejection(
        withPlatform(platform.db, (tx) =>
          tx.insert(invites).values({
            tenantId: tenantB,
            tokenHash: sha256('cross-tenant-invite'),
            kind: 'student',
            classId: classA, // class belongs to tenant A
            createdByUserId: professorA,
            expiresAt: new Date(Date.now() + WEEK),
          }),
        ),
        /invites_class_fk/,
      );

      await expectRejection(
        withPlatform(platform.db, (tx) =>
          tx.insert(students).values({
            tenantId: tenantB,
            fullName: 'Foreign Guardian Kid',
            birthDate: '2016-01-01',
            // Guardian id from tenant A cannot be referenced from tenant B.
            guardianId: classA, // any tenant-A-scoped uuid: no (tenantB, id) parent
          }),
        ),
        /students_guardian_fk/,
      );
    });
  });

  describe('enrollments unique key + reactivation', () => {
    it('allows one row per (tenant, class, student); re-adding reactivates the same row', async () => {
      const classId = await createClass(tenantA, 'Reactivation', 10);
      const studentId = await withTenant(app.db, tenantA, async (tx) => {
        const [s] = await tx
          .insert(students)
          .values({
            tenantId: tenantA,
            fullName: 'Re Ativa',
            birthDate: '1999-05-05',
          })
          .returning({ id: students.id });
        return s!.id;
      });

      const firstId = await withTenant(app.db, tenantA, async (tx) => {
        const [e] = await tx
          .insert(enrollments)
          .values({ tenantId: tenantA, classId, studentId })
          .returning({ id: enrollments.id });
        return e!.id;
      });

      // A second active row for the same pair is impossible.
      await expectRejection(
        withTenant(app.db, tenantA, (tx) =>
          tx
            .insert(enrollments)
            .values({ tenantId: tenantA, classId, studentId }),
        ),
        /enrollments_tenant_class_student_uq/,
      );

      // Remove, then re-add through the reactivation upsert: same row flips back.
      await withTenant(app.db, tenantA, (tx) =>
        tx
          .update(enrollments)
          .set({ status: 'removed' })
          .where(eq(enrollments.id, firstId)),
      );
      const reactivated = await withTenant(app.db, tenantA, async (tx) => {
        const [e] = await tx
          .insert(enrollments)
          .values({ tenantId: tenantA, classId, studentId })
          .onConflictDoUpdate({
            target: [
              enrollments.tenantId,
              enrollments.classId,
              enrollments.studentId,
            ],
            set: { status: 'active', updatedAt: new Date() },
          })
          .returning({ id: enrollments.id, status: enrollments.status });
        return e!;
      });
      expect(reactivated.id).toBe(firstId);
      expect(reactivated.status).toBe('active');

      const all = await withTenant(app.db, tenantA, (tx) =>
        tx
          .select()
          .from(enrollments)
          .where(
            and(
              eq(enrollments.classId, classId),
              eq(enrollments.studentId, studentId),
            ),
          ),
      );
      expect(all).toHaveLength(1);
    });
  });

  describe('auth_accept_invite_v2 (ENR.4)', () => {
    it('student invite with a class binding: students row + enrollment persisted', async () => {
      const classId = await createClass(tenantA, 'Accept Class', 5);
      await createInvite(tenantA, 'v2-student', 'student', classId);

      const res = await app.db.execute(
        sql`SELECT * FROM auth_accept_invite_v2(${sha256('v2-student')}, ${'v2-aluno@t.dev'}, ${'V2 Aluno'}, NULL, ${'1998-04-04'}::date, ${'argon2id$x'})`,
      );
      const row = res.rows[0]!;
      expect(row['status']).toBe('accepted');
      expect(row['role']).toBe('student');
      expect(row['tenant_id']).toBe(tenantA);
      expect(row['student_id']).toBeTruthy();
      expect(row['guardian_id']).toBeNull();
      expect(row['enrollment_skipped']).toBe(false);
      expect(row['enrolled_student_ids']).toEqual([row['student_id']]);

      await withTenant(app.db, tenantA, async (tx) => {
        const [student] = await tx
          .select()
          .from(students)
          .where(eq(students.id, row['student_id'] as string));
        expect(student).toBeDefined();
        expect(student!.userId).toBe(row['user_id']);
        expect(student!.fullName).toBe('V2 Aluno');

        const enrolled = await tx
          .select()
          .from(enrollments)
          .where(
            and(
              eq(enrollments.classId, classId),
              eq(enrollments.studentId, row['student_id'] as string),
            ),
          );
        expect(enrolled).toHaveLength(1);
        expect(enrolled[0]!.status).toBe('active');

        // One use consumed, membership attached.
        const [invite] = await tx
          .select()
          .from(invites)
          .where(eq(invites.tokenHash, sha256('v2-student')));
        expect(invite!.usesCount).toBe(1);
        const member = await tx
          .select()
          .from(memberships)
          .where(eq(memberships.userId, row['user_id'] as string));
        expect(member).toHaveLength(1);
        expect(member[0]!.role).toBe('student');
      });
    });

    it('student invite into a full class: signup succeeds, enrollment skipped', async () => {
      const classId = await createClass(tenantA, 'Full Class', 1);
      // Fill the single slot.
      await withTenant(app.db, tenantA, async (tx) => {
        const [s] = await tx
          .insert(students)
          .values({
            tenantId: tenantA,
            fullName: 'Seat Taker',
            birthDate: '1990-01-01',
          })
          .returning({ id: students.id });
        await tx
          .insert(enrollments)
          .values({ tenantId: tenantA, classId, studentId: s!.id });
      });
      await createInvite(tenantA, 'v2-full', 'student', classId);

      const res = await app.db.execute(
        sql`SELECT * FROM auth_accept_invite_v2(${sha256('v2-full')}, ${'v2-late@t.dev'}, ${'V2 Late'}, NULL, ${'1997-07-07'}::date, ${'argon2id$x'})`,
      );
      const row = res.rows[0]!;
      expect(row['status']).toBe('accepted');
      expect(row['enrollment_skipped']).toBe(true);
      expect(row['enrolled_student_ids']).toEqual([]);

      await withTenant(app.db, tenantA, async (tx) => {
        // The student exists (unassigned in the registry)…
        const [student] = await tx
          .select()
          .from(students)
          .where(eq(students.id, row['student_id'] as string));
        expect(student).toBeDefined();
        // …and the class was never overfilled.
        const active = await tx
          .select()
          .from(enrollments)
          .where(
            and(
              eq(enrollments.classId, classId),
              eq(enrollments.status, 'active'),
            ),
          );
        expect(active).toHaveLength(1);
      });
    });

    it('guardian invite persists guardian + dependents, enrolling while capacity allows', async () => {
      // Capacity 1 and two dependents: first enrolls, second is skipped.
      const classId = await createClass(tenantA, 'Kids Accept', 1);
      await createInvite(tenantA, 'v2-guardian', 'guardian', classId);

      const dependents = JSON.stringify([
        { full_name: 'Dep One', birth_date: '2016-02-02' },
        { full_name: 'Dep Two', birth_date: '2018-03-03' },
      ]);
      const res = await app.db.execute(
        sql`SELECT * FROM auth_accept_invite_v2(${sha256('v2-guardian')}, ${'v2-resp@t.dev'}, ${'V2 Resp'}, ${'+55 11 90000-0000'}, ${'1985-05-05'}::date, ${'argon2id$x'}, ${dependents}::jsonb)`,
      );
      const row = res.rows[0]!;
      expect(row['status']).toBe('accepted');
      expect(row['role']).toBe('guardian');
      expect(row['guardian_id']).toBeTruthy();
      expect(row['student_id']).toBeNull();
      expect(row['dependent_student_ids']).toHaveLength(2);
      expect(row['enrolled_student_ids']).toHaveLength(1);
      expect(row['enrollment_skipped']).toBe(true);

      await withTenant(app.db, tenantA, async (tx) => {
        const [guardian] = await tx
          .select()
          .from(guardians)
          .where(eq(guardians.id, row['guardian_id'] as string));
        expect(guardian).toBeDefined();
        expect(guardian!.userId).toBe(row['user_id']);

        // Every dependent is guardian-linked (minors included by construction).
        const kids = await tx
          .select()
          .from(students)
          .where(eq(students.guardianId, row['guardian_id'] as string));
        expect(kids.map((k) => k.fullName).sort()).toEqual([
          'Dep One',
          'Dep Two',
        ]);
        for (const kid of kids) {
          expect(kid.userId).toBeNull();
        }

        // Exactly one seat existed, exactly one enrollment landed.
        const active = await tx
          .select()
          .from(enrollments)
          .where(
            and(
              eq(enrollments.classId, classId),
              eq(enrollments.status, 'active'),
            ),
          );
        expect(active).toHaveLength(1);
        expect(active[0]!.studentId).toBe(
          (row['enrolled_student_ids'] as string[])[0],
        );
      });
    });

    it('keeps the v1 guards: minor student refused, malformed dependents refused atomically', async () => {
      await createInvite(tenantA, 'v2-minor', 'student', null);
      const minorBirth = new Date();
      minorBirth.setFullYear(minorBirth.getFullYear() - 12);
      const minor = await app.db.execute(
        sql`SELECT * FROM auth_accept_invite_v2(${sha256('v2-minor')}, ${'v2-kid@t.dev'}, ${'V2 Kid'}, NULL, ${minorBirth.toISOString().slice(0, 10)}::date, ${'argon2id$x'})`,
      );
      expect(minor.rows[0]!['status']).toBe('minor_requires_guardian');

      await createInvite(tenantA, 'v2-bad-deps', 'guardian', null);
      const bad = await app.db.execute(
        sql`SELECT * FROM auth_accept_invite_v2(${sha256('v2-bad-deps')}, ${'v2-bad@t.dev'}, ${'V2 Bad'}, NULL, ${'1980-01-01'}::date, ${'argon2id$x'}, ${'[{"full_name":"No Birth"}]'}::jsonb)`,
      );
      expect(bad.rows[0]!['status']).toBe('invalid_dependent');

      // Nothing persisted for either refusal.
      const ghosts = await app.db.execute(
        sql`SELECT * FROM auth_login_lookup(${'v2-bad@t.dev'})`,
      );
      expect(ghosts.rows).toHaveLength(0);
    });
  });
});
