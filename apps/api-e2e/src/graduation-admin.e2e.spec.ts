import { and, count, eq, sql } from 'drizzle-orm';
import {
  belts,
  graduationRules,
  studentGraduations,
  students,
  withPlatform,
  withTenant,
} from '@tatame/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

/**
 * GRD.11 — graduation slice, admin + integrity: régua rules (merged defaults,
 * lazy rows, validations, live re-aim), history with revocations, RBAC, RLS
 * cross-tenant invisibility, append-only + catalog write-protection and the
 * read-only (delinquent) academy block.
 */
describe('graduation: admin rules, integrity and cross-cutting guarantees', () => {
  let t: TestApp;
  let admin: string;
  let professor: string;
  let aluno: string;
  let responsavel: string;
  let alphaId: string;
  let bravoId: string;
  let anaId: string;
  const beltId: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await t.login('admin@tatame.dev')).accessToken;
    professor = (await t.login('professor@tatame.dev')).accessToken;
    aluno = (await t.login('aluno@tatame.dev')).accessToken;
    responsavel = (await t.login('responsavel@tatame.dev')).accessToken;
    alphaId = await t.academyIdBySlug('alpha-jj');
    bravoId = await t.academyIdBySlug('bravo-bjj');

    const rules = await t
      .http()
      .get('/v1/admin/graduation-rules')
      .set(bearer(admin));
    for (const row of rules.body.rules) beltId[row.name] = row.beltId;

    const [ana] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: students.id })
        .from(students)
        .where(
          and(
            eq(students.tenantId, alphaId),
            eq(students.fullName, 'Ana Aluna'),
          ),
        ),
    );
    anaId = ana!.id;
  });

  afterAll(async () => {
    await t.close();
  });

  it('rules GET: merged ladder in régua order with seeded overrides and kids toggles', async () => {
    const res = await t
      .http()
      .get('/v1/admin/graduation-rules')
      .set(bearer(admin));
    expect(res.status).toBe(200);
    const names = res.body.rules.map((r: any) => r.name);
    expect(names).toEqual([
      'Branca',
      'Cinza',
      'Amarela',
      'Laranja',
      'Verde',
      'Azul',
      'Roxa',
      'Marrom',
      'Preta',
      'Vermelha',
    ]);
    const byName = new Map<string, any>(
      res.body.rules.map((r: any) => [r.name, r]),
    );
    expect(byName.get('Azul')).toMatchObject({
      lessonsPerDegree: 45,
      enabled: true,
    }); // override
    expect(byName.get('Laranja')).toMatchObject({
      lessonsPerDegree: 40,
      enabled: false,
    });
    expect(byName.get('Branca')).toMatchObject({
      lessonsPerDegree: 40,
      enabled: true,
    }); // default
    expect(byName.get('Preta').maxDegrees).toBe(6);
    expect(byName.get('Vermelha').maxDegrees).toBe(0);
    for (const row of res.body.rules) {
      expect(row.toggleable).toBe(row.ladderKind === 'kids');
      expect(row.colorSlug.startsWith('belt.')).toBe(true); // tokens, never hex
    }
  });

  it('rules PUT: lazy upsert persists only changed rows and re-aims progress live', async () => {
    const overrideCount = async () => {
      const [row] = await withPlatform(t.platformDb.db, (tx) =>
        tx
          .select({ total: count() })
          .from(graduationRules)
          .where(eq(graduationRules.tenantId, alphaId)),
      );
      return Number(row?.total ?? 0);
    };
    const before = await overrideCount(); // seeded: Azul-45 + Laranja-off

    // Saving untouched defaults writes nothing (lazy-row doctrine).
    const noop = await t
      .http()
      .put('/v1/admin/graduation-rules')
      .set(bearer(admin))
      .send({
        rules: [
          { beltId: beltId['Marrom'], lessonsPerDegree: 40, enabled: true },
        ],
      });
    expect(noop.status).toBe(200);
    expect(await overrideCount()).toBe(before);

    // A real change persists and is immediately reflected in the merged view.
    const changed = await t
      .http()
      .put('/v1/admin/graduation-rules')
      .set(bearer(admin))
      .send({
        rules: [
          { beltId: beltId['Roxa'], lessonsPerDegree: 50, enabled: true },
        ],
      });
    expect(changed.status).toBe(200);
    const roxa = changed.body.rules.find((r: any) => r.name === 'Roxa');
    expect(roxa.lessonsPerDegree).toBe(50);
    expect(await overrideCount()).toBe(before + 1);

    // Story 27: changing the Azul rule re-aims the aluno's bar on next read.
    const reaim = await t
      .http()
      .put('/v1/admin/graduation-rules')
      .set(bearer(admin))
      .send({
        rules: [
          { beltId: beltId['Azul'], lessonsPerDegree: 60, enabled: true },
        ],
      });
    expect(reaim.status).toBe(200);
    const graduation = await t
      .http()
      .get('/v1/aluno/graduation')
      .set(bearer(aluno));
    expect(graduation.body.progress.target).toBe(60);
    await t
      .http()
      .put('/v1/admin/graduation-rules')
      .set(bearer(admin))
      .send({
        rules: [
          { beltId: beltId['Azul'], lessonsPerDegree: 45, enabled: true },
        ],
      });
  });

  it('rules PUT validations: minimum lessons, non-kids toggle, unknown belt', async () => {
    const below = await t
      .http()
      .put('/v1/admin/graduation-rules')
      .set(bearer(admin))
      .send({
        rules: [{ beltId: beltId['Roxa'], lessonsPerDegree: 5, enabled: true }],
      });
    expect(below.status).toBe(422);
    expect(below.body.code).toBe('graduation.lessons_below_minimum');

    const nonKids = await t
      .http()
      .put('/v1/admin/graduation-rules')
      .set(bearer(admin))
      .send({
        rules: [
          { beltId: beltId['Roxa'], lessonsPerDegree: 40, enabled: false },
        ],
      });
    expect(nonKids.status).toBe(422);
    expect(nonKids.body.code).toBe('graduation.cannot_disable_non_kids_belt');

    const unknown = await t
      .http()
      .put('/v1/admin/graduation-rules')
      .set(bearer(admin))
      .send({
        rules: [
          {
            beltId: '00000000-0000-4000-8000-000000000000',
            lessonsPerDegree: 40,
            enabled: true,
          },
        ],
      });
    expect(unknown.status).toBe(422);
    expect(unknown.body.code).toBe('validation.failed');
  });

  it('admin history: full immutable record including the revocation pair', async () => {
    const res = await t
      .http()
      .get(`/v1/admin/students/${anaId}/graduations`)
      .set(bearer(admin));
    expect(res.status).toBe(200);
    expect(res.body.graduations).toHaveLength(5);
    const kinds = res.body.graduations.map((g: any) => g.kind);
    expect(kinds).toEqual(['revocation', 'degree', 'degree', 'degree', 'belt']);
    const revocation = res.body.graduations[0];
    expect(revocation.notes).toBe('Grau lançado em duplicidade.');
    expect(revocation.awardedBy.fullName).toBe('Amanda Admin');
    expect(res.body.graduations[1].reversed).toBe(true);
  });

  it('RLS: cross-tenant students and graduations behave as nonexistent (404)', async () => {
    const bravoAdmin = (await t.login('admin.bravo@tatame.dev')).accessToken;

    // Bravo's admin cannot see an Alpha student's history, profile or notes.
    for (const path of [
      `/v1/admin/students/${anaId}/graduations`,
      `/v1/admin/students/${anaId}/notes`,
    ]) {
      const res = await t.http().get(path).set(bearer(bravoAdmin));
      expect(res.status, path).toBe(404);
    }
    const award = await t
      .http()
      .post(`/v1/admin/students/${anaId}/graduations`)
      .set(bearer(bravoAdmin))
      .send({ kind: 'degree' });
    expect(award.status).toBe(404);

    // Alpha's admin cannot revoke a Bravo graduation row.
    const [bravoGraduation] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: studentGraduations.id })
        .from(studentGraduations)
        .where(
          and(
            eq(studentGraduations.tenantId, bravoId),
            eq(studentGraduations.kind, 'degree'),
          ),
        ),
    );
    const revoke = await t
      .http()
      .post(`/v1/admin/graduations/${bravoGraduation!.id}/revoke`)
      .set(bearer(admin))
      .send({ reason: 'não é meu' });
    expect(revoke.status).toBe(404);
  });

  it('append-only at the database level: the app role can never UPDATE or DELETE', async () => {
    const [row] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: studentGraduations.id })
        .from(studentGraduations)
        .where(eq(studentGraduations.tenantId, alphaId)),
    );
    await expect(
      withTenant(t.appDb.db, alphaId, (tx) =>
        tx
          .update(studentGraduations)
          .set({ notes: 'falsified' })
          .where(eq(studentGraduations.id, row!.id)),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(t.appDb.db, alphaId, (tx) =>
        tx.delete(studentGraduations).where(eq(studentGraduations.id, row!.id)),
      ),
    ).rejects.toThrow();
  });

  it('catalog write-protection: tenant connections cannot mutate the shared ladder', async () => {
    const [branca] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: belts.id, ladderId: belts.ladderId })
        .from(belts)
        .where(eq(belts.name, 'Branca')),
    );
    await expect(
      withTenant(t.appDb.db, alphaId, (tx) =>
        tx
          .update(belts)
          .set({ name: 'Hacked' })
          .where(eq(belts.id, branca!.id)),
      ),
    ).rejects.toThrow();
    await expect(
      withTenant(t.appDb.db, alphaId, (tx) =>
        tx.insert(belts).values({
          ladderId: branca!.ladderId,
          position: 99,
          name: 'Falsa',
          colorSlug: 'belt.fake',
          tipColorSlug: null,
          maxDegrees: 4,
        }),
      ),
    ).rejects.toThrow();
    // Catalogs stay readable from any tenant context (shared truth).
    const readable = await withTenant(t.appDb.db, bravoId, (tx) =>
      tx.select({ id: belts.id }).from(belts),
    );
    expect(readable.length).toBeGreaterThanOrEqual(10);
  });

  it('read-only (delinquent) academy: graduation writes blocked, reads untouched', async () => {
    await t.setAcademyStatus('alpha-jj', 'delinquent');
    try {
      const award = await t
        .http()
        .post(`/v1/professor/students/${anaId}/graduations`)
        .set(bearer(professor))
        .send({ kind: 'degree' });
      expect(award.status).toBe(403);
      expect(award.body.code).toBe('tenant.read_only');

      const rules = await t
        .http()
        .put('/v1/admin/graduation-rules')
        .set(bearer(admin))
        .send({
          rules: [
            { beltId: beltId['Roxa'], lessonsPerDegree: 55, enabled: true },
          ],
        });
      expect(rules.status).toBe(403);
      expect(rules.body.code).toBe('tenant.read_only');

      const note = await t
        .http()
        .post(`/v1/professor/students/${anaId}/notes`)
        .set(bearer(professor))
        .send({ body: 'bloqueado' });
      expect(note.status).toBe(403);

      const [graduation] = await withPlatform(t.platformDb.db, (tx) =>
        tx
          .select({ id: studentGraduations.id })
          .from(studentGraduations)
          .where(
            and(
              eq(studentGraduations.tenantId, alphaId),
              eq(studentGraduations.kind, 'degree'),
            ),
          ),
      );
      const revoke = await t
        .http()
        .post(`/v1/admin/graduations/${graduation!.id}/revoke`)
        .set(bearer(admin))
        .send({ reason: 'tentativa' });
      expect(revoke.status).toBe(403);

      const read = await t
        .http()
        .get('/v1/aluno/graduation')
        .set(bearer(aluno));
      expect(read.status).toBe(200);
    } finally {
      await t.setAcademyStatus('alpha-jj', 'active');
    }
  });

  it('RBAC: every graduation surface rejects the wrong persona with 403', async () => {
    const cases: Array<[string, 'get' | 'post' | 'put', string]> = [
      [aluno, 'get', '/v1/admin/graduation-rules'],
      [aluno, 'put', '/v1/admin/graduation-rules'],
      [aluno, 'post', `/v1/professor/students/${anaId}/graduations`],
      [aluno, 'get', `/v1/professor/students/${anaId}/notes`],
      [aluno, 'get', '/v1/professor/profile'],
      [professor, 'get', `/v1/admin/students/${anaId}/graduations`],
      [professor, 'put', '/v1/admin/graduation-rules'],
      [responsavel, 'get', '/v1/aluno/graduation'],
      [responsavel, 'get', '/v1/professor/profile'],
    ];
    for (const [token, method, path] of cases) {
      const res = await (t.http() as any)
        [method](path)
        .set(bearer(token))
        .send({});
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.code, `${method} ${path}`).toBe('authz.forbidden_role');
    }
  });

  it('audit seam sanity: graduation audit rows are tenant-scoped and append-only', async () => {
    // The audit trail for graduations is written through audit_append — the
    // app role has no direct INSERT/UPDATE path (already covered by identity
    // suites); here we only assert the graduation actions landed for Alpha.
    const rows = await withPlatform(t.platformDb.db, (tx) =>
      tx.execute(sql`
        SELECT action, COUNT(*)::int AS total
        FROM audit_logs
        WHERE tenant_id = ${alphaId}::uuid
          AND action IN ('graduation.awarded', 'graduation.revoked')
        GROUP BY action
      `),
    );
    const byAction = new Map(rows.rows.map((r: any) => [r.action, r.total]));
    expect(
      Number(byAction.get('graduation.awarded') ?? 0),
    ).toBeGreaterThanOrEqual(4);
    expect(
      Number(byAction.get('graduation.revoked') ?? 0),
    ).toBeGreaterThanOrEqual(1);
  });
});
