import { asc, eq } from 'drizzle-orm';
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
  beltLadders,
  belts,
  classes,
  graduationRules,
  martialArts,
  memberships,
  studentGraduations,
  studentNotes,
  students,
  users,
} from '../schema/index.js';
import { seedBeltCatalog } from '../seed/index.js';
import {
  createFreshDb,
  testAdminUrl,
  type FreshDb,
} from '../testing/test-db.js';

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

describe('graduation slice (spec 005 DB)', () => {
  let fresh: FreshDb;
  let app: DbHandle;
  let platform: DbHandle;
  /** Superuser connection — grants + RLS cannot stop the owner path, so the
   * guard trigger is the only layer left (exactly what it exists for). */
  let owner: pg.Client;

  let tenantA: string;
  let tenantB: string;
  let professorA: string;
  let adminA: string;
  let studentA: string;
  let studentB: string;
  let azulId: string;
  let brancaId: string;
  let laranjaId: string;

  beforeAll(async () => {
    fresh = await createFreshDb(testAdminUrl());
    app = createAppDb(fresh.url);
    platform = createPlatformDb(fresh.url);
    owner = new pg.Client({ connectionString: fresh.url });
    await owner.connect();

    await seedBeltCatalog(platform.db);

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

      const insertUser = async (email: string) => {
        const [u] = await tx
          .insert(users)
          .values({ email, fullName: email })
          .returning({ id: users.id });
        return u!.id;
      };
      professorA = await insertUser('prof-a@t.dev');
      adminA = await insertUser('admin-a@t.dev');
    });

    await withTenant(app.db, tenantA, async (tx) => {
      await tx.insert(memberships).values([
        { tenantId: tenantA, userId: professorA, role: 'professor' },
        { tenantId: tenantA, userId: adminA, role: 'admin' },
      ]);
      const [s] = await tx
        .insert(students)
        .values({
          tenantId: tenantA,
          fullName: 'Aluno A',
          birthDate: '1999-01-01',
        })
        .returning({ id: students.id });
      studentA = s!.id;
    });
    await withTenant(app.db, tenantB, async (tx) => {
      const [s] = await tx
        .insert(students)
        .values({
          tenantId: tenantB,
          fullName: 'Aluno B',
          birthDate: '1998-01-01',
        })
        .returning({ id: students.id });
      studentB = s!.id;
    });

    // Catalog ids resolved with NO tenant context — public SELECT policy.
    const catalog = await app.db
      .select({ id: belts.id, name: belts.name, kind: beltLadders.kind })
      .from(belts)
      .innerJoin(beltLadders, eq(beltLadders.id, belts.ladderId));
    const beltId = (kind: string, name: string) => {
      const row = catalog.find((c) => c.kind === kind && c.name === name);
      if (!row) throw new Error(`Belt ${kind}/${name} missing from catalog`);
      return row.id;
    };
    azulId = beltId('adult', 'Azul');
    brancaId = beltId('adult', 'Branca');
    laranjaId = beltId('kids', 'Laranja');
  });

  afterAll(async () => {
    await owner?.end();
    await app?.close();
    await platform?.close();
    await fresh?.drop();
  });

  async function award(
    tenantId: string,
    studentId: string,
    values: Partial<typeof studentGraduations.$inferInsert> = {},
  ): Promise<string> {
    return withTenant(app.db, tenantId, async (tx) => {
      const [row] = await tx
        .insert(studentGraduations)
        .values({
          tenantId,
          studentId,
          beltId: azulId,
          kind: 'degree',
          degree: 1,
          awardedByUserId: professorA,
          ...values,
        })
        .returning({ id: studentGraduations.id });
      return row!.id;
    });
  }

  describe('shared catalogs (GRD.1)', () => {
    it('seeds the handoff régua: adult Branca→Vermelha, kids Cinza→Verde without white', async () => {
      const rows = await app.db
        .select({
          kind: beltLadders.kind,
          name: belts.name,
          position: belts.position,
          colorSlug: belts.colorSlug,
          tipColorSlug: belts.tipColorSlug,
          maxDegrees: belts.maxDegrees,
        })
        .from(belts)
        .innerJoin(beltLadders, eq(beltLadders.id, belts.ladderId))
        .orderBy(asc(beltLadders.kind), asc(belts.position));

      const adult = rows.filter((r) => r.kind === 'adult');
      expect(adult.map((b) => [b.name, b.colorSlug, b.maxDegrees])).toEqual([
        ['Branca', 'belt.white', 4],
        ['Azul', 'belt.blue', 4],
        ['Roxa', 'belt.purple', 4],
        ['Marrom', 'belt.brown', 4],
        ['Preta', 'belt.black', 6],
        ['Vermelha', 'belt.red', 0],
      ]);
      // Black belt dan tip is the only ponteira override.
      expect(adult.find((b) => b.name === 'Preta')!.tipColorSlug).toBe(
        'belt.red',
      );
      expect(
        adult
          .filter((b) => b.name !== 'Preta')
          .every((b) => b.tipColorSlug === null),
      ).toBe(true);

      // Kids ladder has NO white row (Branca lives in the adult ladder).
      const kids = rows.filter((r) => r.kind === 'kids');
      expect(kids.map((b) => [b.name, b.colorSlug, b.maxDegrees])).toEqual([
        ['Cinza', 'belt.gray', 4],
        ['Amarela', 'belt.yellow', 4],
        ['Laranja', 'belt.orange', 4],
        ['Verde', 'belt.green', 4],
      ]);
    });

    it('is readable from any tenant context and with none at all', async () => {
      // No context at all (pre-auth) — the catalog is still visible.
      expect(await app.db.select().from(belts)).toHaveLength(10);
      // And from both tenants identically.
      const fromA = await withTenant(app.db, tenantA, (tx) =>
        tx.select().from(belts),
      );
      const fromB = await withTenant(app.db, tenantB, (tx) =>
        tx.select().from(belts),
      );
      expect(fromA).toHaveLength(10);
      expect(fromB).toHaveLength(10);
    });

    it('rejects every catalog write from the app role (grant layer)', async () => {
      const [ladder] = await app.db
        .select({ id: beltLadders.id })
        .from(beltLadders);
      await expectRejection(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(belts).values({
            ladderId: ladder!.id,
            position: 99,
            name: 'Coral',
            colorSlug: 'belt.red',
            maxDegrees: 0,
          }),
        ),
        /permission denied/,
      );
      await expectRejection(
        withTenant(app.db, tenantA, (tx) =>
          tx.update(belts).set({ maxDegrees: 10 }).where(eq(belts.id, azulId)),
        ),
        /permission denied/,
      );
      await expectRejection(
        withTenant(app.db, tenantA, (tx) =>
          tx.delete(belts).where(eq(belts.id, azulId)),
        ),
        /permission denied/,
      );
      await expectRejection(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(martialArts).values({ key: 'judo', name: 'Judo' }),
        ),
        /permission denied/,
      );
    });

    it('stays writable through the platform pool (the seed path) and re-seeds idempotently', async () => {
      await seedBeltCatalog(platform.db);
      expect(await app.db.select().from(belts)).toHaveLength(10);
    });
  });

  describe('graduation_rules (GRD.2)', () => {
    it('accepts overrides and kids toggles, one row per (tenant, belt)', async () => {
      await withTenant(app.db, tenantA, (tx) =>
        tx.insert(graduationRules).values([
          { tenantId: tenantA, beltId: azulId, lessonsPerDegree: 45 },
          { tenantId: tenantA, beltId: laranjaId, enabled: false },
        ]),
      );
      const rows = await withTenant(app.db, tenantA, (tx) =>
        tx
          .select()
          .from(graduationRules)
          .orderBy(asc(graduationRules.lessonsPerDegree)),
      );
      expect(
        rows.map((r) => [r.beltId, r.lessonsPerDegree, r.enabled]),
      ).toEqual([
        [laranjaId, 40, false], // default 40 applied
        [azulId, 45, true], // default enabled applied
      ]);

      await expectRejection(
        withTenant(app.db, tenantA, (tx) =>
          tx
            .insert(graduationRules)
            .values({ tenantId: tenantA, beltId: azulId }),
        ),
        /graduation_rules_tenant_belt_uq/,
      );
    });

    it('refuses lessons_per_degree below 10 (CHECK)', async () => {
      await expectRejection(
        withTenant(app.db, tenantA, (tx) =>
          tx.insert(graduationRules).values({
            tenantId: tenantA,
            beltId: brancaId,
            lessonsPerDegree: 9,
          }),
        ),
        /graduation_rules_lessons_min_ck/,
      );
    });

    it('is tenant-isolated: fail-closed with no context, invisible cross-tenant', async () => {
      expect(await app.db.select().from(graduationRules)).toHaveLength(0);
      const fromB = await withTenant(app.db, tenantB, (tx) =>
        tx.select().from(graduationRules),
      );
      expect(fromB).toHaveLength(0);
      await expectRejection(
        withTenant(app.db, tenantB, (tx) =>
          tx
            .insert(graduationRules)
            .values({ tenantId: tenantA, beltId: brancaId }),
        ),
        /row-level security/,
      );
    });
  });

  describe('student_graduations shape (GRD.3)', () => {
    it('records awards and admin revocation compensation rows', async () => {
      const beltAwardId = await award(tenantA, studentA, {
        kind: 'belt',
        degree: 0,
        notes: 'Exame de faixa.',
      });
      const degreeId = await award(tenantA, studentA, {
        kind: 'degree',
        degree: 1,
      });
      const revocationId = await award(tenantA, studentA, {
        kind: 'revocation',
        degree: 0,
        awardedByUserId: adminA,
        reversesGraduationId: degreeId,
        notes: 'Lançado por engano.',
      });

      const rows = await withTenant(app.db, tenantA, (tx) =>
        tx
          .select()
          .from(studentGraduations)
          .where(eq(studentGraduations.studentId, studentA))
          .orderBy(asc(studentGraduations.createdAt)),
      );
      expect(rows.map((r) => r.id)).toEqual([
        beltAwardId,
        degreeId,
        revocationId,
      ]);
      expect(rows[2]!.reversesGraduationId).toBe(degreeId);
      expect(rows[2]!.awardedByUserId).toBe(adminA);
    });

    it('CHECK: reverses_graduation_id is set exactly when kind = revocation', async () => {
      const awardId = await award(tenantA, studentA, {
        kind: 'degree',
        degree: 2,
      });
      // A revocation without a target is impossible…
      await expectRejection(
        award(tenantA, studentA, { kind: 'revocation', degree: 0 }),
        /student_graduations_revocation_ck/,
      );
      // …and so is an award that claims to reverse something.
      await expectRejection(
        award(tenantA, studentA, {
          kind: 'degree',
          degree: 3,
          reversesGraduationId: awardId,
        }),
        /student_graduations_revocation_ck/,
      );
    });

    it('partial unique: an award is reversible at most once', async () => {
      const awardId = await award(tenantA, studentA, {
        kind: 'degree',
        degree: 3,
      });
      await award(tenantA, studentA, {
        kind: 'revocation',
        degree: 0,
        awardedByUserId: adminA,
        reversesGraduationId: awardId,
      });
      await expectRejection(
        award(tenantA, studentA, {
          kind: 'revocation',
          degree: 0,
          awardedByUserId: adminA,
          reversesGraduationId: awardId,
        }),
        /student_graduations_single_reversal_uq/,
      );
    });

    it('composite tenant self-FK: a revocation cannot target a foreign tenant row', async () => {
      const foreignAwardId = await award(tenantA, studentA, {
        kind: 'degree',
        degree: 4,
      });
      await expectRejection(
        award(tenantB, studentB, {
          kind: 'revocation',
          degree: 0,
          reversesGraduationId: foreignAwardId,
        }),
        /student_graduations_reverses_fk/,
      );
    });

    it('composite tenant FK: a graduation cannot point at a foreign student', async () => {
      await expectRejection(
        award(tenantB, studentA, { kind: 'degree', degree: 1 }),
        /student_graduations_student_fk/,
      );
    });
  });

  describe('append-only layers on student_graduations (GRD.3)', () => {
    it('grant layer: UPDATE and DELETE denied to the app role; platform reads only', async () => {
      const awardId = await award(tenantA, studentA, {
        kind: 'degree',
        degree: 4,
      });

      await expectRejection(
        withTenant(app.db, tenantA, (tx) =>
          tx
            .update(studentGraduations)
            .set({ degree: 5 })
            .where(eq(studentGraduations.id, awardId)),
        ),
        /permission denied/,
      );
      await expectRejection(
        withTenant(app.db, tenantA, (tx) =>
          tx
            .delete(studentGraduations)
            .where(eq(studentGraduations.id, awardId)),
        ),
        /permission denied/,
      );

      // Platform pool: INSERT, UPDATE and DELETE all refused (reads only).
      await expectRejection(
        withPlatform(platform.db, (tx) =>
          tx.insert(studentGraduations).values({
            tenantId: tenantA,
            studentId: studentA,
            beltId: azulId,
            kind: 'degree',
            degree: 1,
            awardedByUserId: professorA,
          }),
        ),
        /permission denied/,
      );
      await expectRejection(
        withPlatform(platform.db, (tx) =>
          tx
            .update(studentGraduations)
            .set({ notes: 'forged' })
            .where(eq(studentGraduations.id, awardId)),
        ),
        /permission denied/,
      );
      await expectRejection(
        withPlatform(platform.db, (tx) =>
          tx
            .delete(studentGraduations)
            .where(eq(studentGraduations.id, awardId)),
        ),
        /permission denied/,
      );
    });

    it('trigger layer: the owner path is refused unconditionally — no revoke-style window', async () => {
      const res = await owner.query(
        `SELECT id FROM student_graduations LIMIT 1`,
      );
      const rowId = res.rows[0].id;

      await expect(
        owner.query(
          `UPDATE student_graduations SET notes = 'forged' WHERE id = $1`,
          [rowId],
        ),
      ).rejects.toThrow(/append-only/);
      // Unlike attendances there is NO sanctioned transition of any shape.
      await expect(
        owner.query(
          `UPDATE student_graduations SET updated_at = now() WHERE id = $1`,
          [rowId],
        ),
      ).rejects.toThrow(/append-only/);
      await expect(
        owner.query(`DELETE FROM student_graduations WHERE id = $1`, [rowId]),
      ).rejects.toThrow(/append-only/);
    });
  });

  describe('student_notes + additive columns (GRD.4)', () => {
    it('stores staff notes under tenant RLS with a composite student FK', async () => {
      await withTenant(app.db, tenantA, (tx) =>
        tx.insert(studentNotes).values({
          tenantId: tenantA,
          studentId: studentA,
          authorUserId: professorA,
          body: 'Guarda evoluindo bem.',
        }),
      );
      const rows = await withTenant(app.db, tenantA, (tx) =>
        tx.select().from(studentNotes),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]!.authorUserId).toBe(professorA);

      // Cross-tenant: invisible and unwritable against a foreign student.
      expect(
        await withTenant(app.db, tenantB, (tx) =>
          tx.select().from(studentNotes),
        ),
      ).toHaveLength(0);
      await expectRejection(
        withTenant(app.db, tenantB, (tx) =>
          tx.insert(studentNotes).values({
            tenantId: tenantB,
            studentId: studentA, // tenant A's student
            authorUserId: professorA,
            body: 'x',
          }),
        ),
        /student_notes_student_fk/,
      );
    });

    it('classes carry a nullable belt range; memberships carry display rank', async () => {
      const classId = await withTenant(app.db, tenantA, async (tx) => {
        const [c] = await tx
          .insert(classes)
          .values({
            tenantId: tenantA,
            name: 'Fundamentals',
            professorUserId: professorA,
            capacity: 20,
            minBeltId: brancaId,
            maxBeltId: azulId,
          })
          .returning({ id: classes.id });
        return c!.id;
      });
      const [cls] = await withTenant(app.db, tenantA, (tx) =>
        tx.select().from(classes).where(eq(classes.id, classId)),
      );
      expect([cls!.minBeltId, cls!.maxBeltId]).toEqual([brancaId, azulId]);

      await withTenant(app.db, tenantA, (tx) =>
        tx
          .update(memberships)
          .set({ beltId: azulId, beltDegree: 2 })
          .where(eq(memberships.userId, professorA)),
      );
      const [m] = await withTenant(app.db, tenantA, (tx) =>
        tx.select().from(memberships).where(eq(memberships.userId, professorA)),
      );
      expect([m!.beltId, m!.beltDegree]).toEqual([azulId, 2]);

      // The belt FKs are real: a bogus belt id is refused.
      await expectRejection(
        withTenant(app.db, tenantA, (tx) =>
          tx
            .update(classes)
            .set({ minBeltId: '00000000-0000-7000-8000-000000000000' })
            .where(eq(classes.id, classId)),
        ),
        /classes_min_belt_id_belts_id_fk/,
      );
    });
  });
});
