import { and, count, eq, gt, isNull } from 'drizzle-orm';
import {
  attendances,
  auditLogs,
  studentGraduations,
  students,
  withPlatform,
} from '@tatame/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

/**
 * GRD.11 — graduation slice, aluno + professor surfaces: derivation fixtures,
 * progress correctness against seeded attendances + the Azul-45 override,
 * belt exposure in every list response, awards (validations + toggle gating),
 * revocation semantics and notes.
 */
describe('graduation: derivation, progress, awards, profiles', () => {
  let t: TestApp;
  let admin: string;
  let professor: string;
  let aluno: string;
  let responsavel: string;
  let alphaId: string;
  let anaId: string;
  /** Catalog belt ids resolved from the admin régua (name → beltId). */
  const beltId: Record<string, string> = {};

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await t.login('admin@tatame.dev')).accessToken;
    professor = (await t.login('professor@tatame.dev')).accessToken;
    aluno = (await t.login('aluno@tatame.dev')).accessToken;
    responsavel = (await t.login('responsavel@tatame.dev')).accessToken;
    alphaId = await t.academyIdBySlug('alpha-jj');

    const rules = await t
      .http()
      .get('/v1/admin/graduation-rules')
      .set(bearer(admin));
    expect(rules.status).toBe(200);
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

  /** Independent progress numerator: active lessons after Ana's last award. */
  async function expectedCurrentLessons(): Promise<number> {
    const rows = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(studentGraduations)
        .where(eq(studentGraduations.studentId, anaId)),
    );
    const reversed = new Set(
      rows
        .filter((r) => r.reversesGraduationId != null)
        .map((r) => r.reversesGraduationId),
    );
    const awards = rows
      .filter((r) => r.kind !== 'revocation' && !reversed.has(r.id))
      .sort((a, b) => a.awardedAt.getTime() - b.awardedAt.getTime());
    const anchor = awards[awards.length - 1]!.awardedAt;
    const [row] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ total: count() })
        .from(attendances)
        .where(
          and(
            eq(attendances.studentId, anaId),
            isNull(attendances.revokedAt),
            gt(attendances.checkedInAt, anchor),
          ),
        ),
    );
    return Number(row?.total ?? 0);
  }

  it('aluno graduation: seeded history derives Azul · 2 graus, revoked degree excluded', async () => {
    const res = await t.http().get('/v1/aluno/graduation').set(bearer(aluno));
    expect(res.status).toBe(200);

    // Hero: derived belt (the seeded 3rd degree was revoked — story 8).
    expect(res.body.belt).toMatchObject({
      name: 'Azul',
      colorSlug: 'belt.blue',
      degrees: 2,
      maxDegrees: 4,
    });

    // Progress: seeded Azul-45 override + active lessons after the last award.
    expect(res.body.progress.target).toBe(45);
    expect(res.body.progress.label).toBe('Próximo 3º grau');
    expect(res.body.progress.nextMilestone).toEqual({
      kind: 'degree',
      degree: 3,
    });
    expect(res.body.progress.current).toBe(await expectedCurrentLessons());

    // Timeline: belt + 3 degrees + 1 revocation, newest first, full context.
    expect(res.body.timeline).toHaveLength(5);
    const kinds = res.body.timeline.map((e: any) => e.kind);
    expect(kinds).toEqual(['revocation', 'degree', 'degree', 'degree', 'belt']);
    const beltEntry = res.body.timeline[4];
    expect(beltEntry.certificateAvailable).toBe(true); // Ver certificado placeholder
    expect(beltEntry.notes).toBe('Exame de faixa — aprovado com distinção.');
    expect(beltEntry.awardedBy.fullName).toBe('Paulo Professor');
    const revokedDegree = res.body.timeline[1];
    expect(revokedDegree.degree).toBe(3);
    expect(revokedDegree.reversed).toBe(true);
    const revocation = res.body.timeline[0];
    expect(revocation.reversesGraduationId).toBe(revokedDegree.id);
    expect(revocation.certificateAvailable).toBe(false);
  });

  it('aluno home: graduation card uses the real rule target, not the 40 placeholder', async () => {
    const res = await t.http().get('/v1/aluno/home').set(bearer(aluno));
    expect(res.status).toBe(200);
    expect(res.body.graduation.belt).toMatchObject({
      name: 'Azul',
      degrees: 2,
    });
    expect(res.body.graduation.progress.target).toBe(45);
    expect(res.body.graduation.progress.current).toBe(
      await expectedCurrentLessons(),
    );
  });

  it('belt exposure: registry rows, professor students, rosters, roll-call, dependents', async () => {
    const registry = await t
      .http()
      .get('/v1/admin/students')
      .set(bearer(admin));
    expect(registry.status).toBe(200);
    const anaRow = registry.body.students.find((s: any) => s.id === anaId);
    expect(anaRow.belt).toMatchObject({
      name: 'Azul',
      colorSlug: 'belt.blue',
      degrees: 2,
    });
    // Historyless students default to white — never a missing payload.
    for (const s of registry.body.students) expect(s.belt.name).toBeTruthy();

    const profStudents = await t
      .http()
      .get('/v1/professor/students')
      .set(bearer(professor));
    expect(profStudents.status).toBe(200);
    const anaProf = profStudents.body.students.find((s: any) => s.id === anaId);
    expect(anaProf.belt).toMatchObject({ name: 'Azul', degrees: 2 });

    const classes = await t
      .http()
      .get('/v1/professor/classes')
      .set(bearer(professor));
    const adulto = classes.body.classes.find(
      (c: any) => c.name === 'Adulto Gi',
    );
    // Turma belt range (Phase-3 deferral): "Branca a Azul" chips data.
    expect(adulto.minBelt).toMatchObject({ name: 'Branca' });
    expect(adulto.maxBelt).toMatchObject({ name: 'Azul' });
    const detail = await t
      .http()
      .get(`/v1/professor/classes/${adulto.id}`)
      .set(bearer(professor));
    const rosterAna = detail.body.class.roster.find(
      (r: any) => r.studentId === anaId,
    );
    expect(rosterAna.belt).toMatchObject({ name: 'Azul', degrees: 2 });

    const kids = classes.body.classes.find((c: any) => c.name === 'Kids');
    const rollCall = await t
      .http()
      .post(`/v1/professor/classes/${kids.id}/roll-call`)
      .set(bearer(professor));
    expect(rollCall.status).toBe(200);
    for (const row of rollCall.body.roster) {
      expect(row.belt).toMatchObject({ name: 'Branca', degrees: 0 }); // white default
    }

    const dependents = await t
      .http()
      .get('/v1/responsavel/dependents')
      .set(bearer(responsavel));
    expect(dependents.status).toBe(200);
    expect(dependents.body.dependents.length).toBeGreaterThan(0);
    for (const dep of dependents.body.dependents) {
      expect(dep.belt).toMatchObject({
        name: 'Branca',
        colorSlug: 'belt.white',
        degrees: 0,
      });
    }
  });

  it('professor perfil do aluno: belt, progress, Phase-4 tiles, observações (any student)', async () => {
    const res = await t
      .http()
      .get(`/v1/professor/students/${anaId}/profile`)
      .set(bearer(professor));
    expect(res.status).toBe(200);
    expect(res.body.student).toMatchObject({
      id: anaId,
      fullName: 'Ana Aluna',
      badge: 'ativo',
    });
    expect(res.body.belt).toMatchObject({ name: 'Azul', degrees: 2 });
    expect(res.body.progress.target).toBe(45);
    expect(typeof res.body.stats.monthPresencePct).toBe('number');
    expect(typeof res.body.stats.totalLessons).toBe('number');
    expect(res.body.notes.length).toBeGreaterThan(0);
    expect(
      res.body.notes.some((n: any) => n.body.includes('guarda fechada')),
    ).toBe(true);

    // Foreign (other tenant) student behaves as nonexistent.
    const [bravoStudent] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ id: students.id })
        .from(students)
        .where(eq(students.fullName, 'Fabio Fila')),
    );
    const bravoRows = await withPlatform(t.platformDb.db, (tx) =>
      tx.select().from(students).where(eq(students.fullName, 'Fabio Fila')),
    );
    const foreign =
      bravoRows.find((r) => r.tenantId !== alphaId) ?? bravoStudent;
    const denied = await t
      .http()
      .get(`/v1/professor/students/${foreign!.id}/profile`)
      .set(bearer(professor));
    expect(denied.status).toBe(404);
  });

  it('professor profile: own belt chip + Graduações válidas in régua order', async () => {
    const res = await t
      .http()
      .get('/v1/professor/profile')
      .set(bearer(professor));
    expect(res.status).toBe(200);
    // Seeded display-only rank: Faixa preta · 2º dan with the red ponteira.
    expect(res.body.belt).toMatchObject({
      name: 'Preta',
      colorSlug: 'belt.black',
      tipColorSlug: 'belt.red',
      degrees: 2,
      maxDegrees: 6,
    });
    const names = res.body.validGraduations.map((b: any) => b.name);
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
    const laranja = res.body.validGraduations.find(
      (b: any) => b.name === 'Laranja',
    );
    expect(laranja.enabled).toBe(false); // seeded kids toggle off
    expect(
      res.body.validGraduations.filter((b: any) => b.enabled),
    ).toHaveLength(9);
  });

  it('notes: professor and admin write and share one memory, newest first', async () => {
    const created = await t
      .http()
      .post(`/v1/professor/students/${anaId}/notes`)
      .set(bearer(professor))
      .send({ body: 'Preparar para o exame de faixa roxa.' });
    expect(created.status).toBe(201);
    expect(created.body.note.author.fullName).toBe('Paulo Professor');

    const adminNote = await t
      .http()
      .post(`/v1/admin/students/${anaId}/notes`)
      .set(bearer(admin))
      .send({ body: 'Mensalidade regularizada, liberar exame.' });
    expect(adminNote.status).toBe(201);

    const list = await t
      .http()
      .get(`/v1/professor/students/${anaId}/notes`)
      .set(bearer(professor));
    expect(list.status).toBe(200);
    expect(list.body.notes.length).toBeGreaterThanOrEqual(3);
    const bodies = list.body.notes.map((n: any) => n.body);
    expect(bodies).toContain('Mensalidade regularizada, liberar exame.');
    expect(bodies).toContain('Preparar para o exame de faixa roxa.');
    // Newest first: the seeded (oldest) observação closes the list.
    expect(bodies[bodies.length - 1]).toContain('guarda fechada');

    const adminList = await t
      .http()
      .get(`/v1/admin/students/${anaId}/notes`)
      .set(bearer(admin));
    expect(adminList.body.notes.map((n: any) => n.id)).toEqual(
      list.body.notes.map((n: any) => n.id),
    );
  });

  it('derivation default: a fresh student is Branca with zero degrees everywhere', async () => {
    const created = await t
      .http()
      .post('/v1/admin/students')
      .set(bearer(admin))
      .send({ fullName: 'Novato Sem Faixa', birthDate: '1991-05-05' });
    expect(created.status).toBe(201);
    expect(created.body.student.belt).toMatchObject({
      name: 'Branca',
      colorSlug: 'belt.white',
      degrees: 0,
      maxDegrees: 4,
    });

    const history = await t
      .http()
      .get(`/v1/admin/students/${created.body.student.id}/graduations`)
      .set(bearer(admin));
    expect(history.status).toBe(200);
    expect(history.body.graduations).toEqual([]); // no synthetic row
  });

  it('optional initial belt seeds one audited belt award; disabled belts are rejected', async () => {
    const created = await t
      .http()
      .post('/v1/admin/students')
      .set(bearer(admin))
      .send({
        fullName: 'Tia Transferida',
        birthDate: '1988-02-02',
        initialBeltId: beltId['Roxa'],
      });
    expect(created.status).toBe(201);
    expect(created.body.student.belt).toMatchObject({
      name: 'Roxa',
      degrees: 0,
    });

    const history = await t
      .http()
      .get(`/v1/admin/students/${created.body.student.id}/graduations`)
      .set(bearer(admin));
    expect(history.body.graduations).toHaveLength(1);
    expect(history.body.graduations[0]).toMatchObject({
      kind: 'belt',
      degree: 0,
      notes: 'Início da jornada',
    });
    const audits = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.action, 'graduation.awarded'),
            eq(auditLogs.targetId, history.body.graduations[0].id),
          ),
        ),
    );
    expect(audits).toHaveLength(1);

    // Laranja is disabled for this academy — invalid as an initial belt.
    const rejected = await t
      .http()
      .post('/v1/admin/students')
      .set(bearer(admin))
      .send({
        fullName: 'Lino Laranja',
        birthDate: '1994-01-01',
        initialBeltId: beltId['Laranja'],
      });
    expect(rejected.status).toBe(422);
    expect(rejected.body.code).toBe('graduation.belt_invalid_target');
  });

  it('awards: add degree, promote belt (reset), max-degree and target validations', async () => {
    const created = await t
      .http()
      .post('/v1/admin/students')
      .set(bearer(admin))
      .send({ fullName: 'Aldo Award', birthDate: '1990-03-03' });
    const studentId = created.body.student.id;

    // Professor adds a stripe on the current (white) belt.
    const degree = await t
      .http()
      .post(`/v1/professor/students/${studentId}/graduations`)
      .set(bearer(professor))
      .send({ kind: 'degree', notes: 'Primeiro grau merecido.' });
    expect(degree.status).toBe(201);
    expect(degree.body.graduation).toMatchObject({ kind: 'degree', degree: 1 });
    expect(degree.body.belt).toMatchObject({ name: 'Branca', degrees: 1 });

    // Awards are audited in-transaction — who promoted, when.
    const audits = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.action, 'graduation.awarded'),
            eq(auditLogs.targetId, degree.body.graduation.id),
          ),
        ),
    );
    expect(audits).toHaveLength(1);

    // Promote: degrees reset to zero on the new belt row.
    const promoted = await t
      .http()
      .post(`/v1/professor/students/${studentId}/graduations`)
      .set(bearer(professor))
      .send({ kind: 'belt', beltId: beltId['Azul'] });
    expect(promoted.status).toBe(201);
    expect(promoted.body.belt).toMatchObject({ name: 'Azul', degrees: 0 });

    // Fill Azul to its max of 4 degrees, then the 5th is rejected.
    for (let i = 1; i <= 4; i += 1) {
      const res = await t
        .http()
        .post(`/v1/professor/students/${studentId}/graduations`)
        .set(bearer(professor))
        .send({ kind: 'degree' });
      expect(res.status).toBe(201);
      expect(res.body.belt.degrees).toBe(i);
    }
    const overMax = await t
      .http()
      .post(`/v1/professor/students/${studentId}/graduations`)
      .set(bearer(professor))
      .send({ kind: 'degree' });
    expect(overMax.status).toBe(422);
    expect(overMax.body.code).toBe('graduation.degree_at_max');

    // At max degrees the aluno-facing bar points at the next belt.
    const profile = await t
      .http()
      .get(`/v1/professor/students/${studentId}/profile`)
      .set(bearer(professor));
    expect(profile.body.progress.label).toBe('Próxima faixa');
    expect(profile.body.progress.nextMilestone).toEqual({
      kind: 'belt',
      degree: null,
    });

    // Target validations: disabled kids belt, current belt, unknown id.
    for (const [target, label] of [
      [beltId['Laranja'], 'disabled'],
      [beltId['Azul'], 'current'],
      ['00000000-0000-4000-8000-000000000000', 'unknown'],
    ] as const) {
      const res = await t
        .http()
        .post(`/v1/professor/students/${studentId}/graduations`)
        .set(bearer(professor))
        .send({ kind: 'belt', beltId: target });
      expect(res.status, label).toBe(422);
      expect(res.body.code, label).toBe('graduation.belt_invalid_target');
    }

    // kind=belt without a target is a plain validation failure.
    const missing = await t
      .http()
      .post(`/v1/professor/students/${studentId}/graduations`)
      .set(bearer(professor))
      .send({ kind: 'belt' });
    expect(missing.status).toBe(422);
    expect(missing.body.code).toBe('validation.failed');

    // Revocation semantics: revoke the 4th degree, state restores to 3.
    const history = await t
      .http()
      .get(`/v1/admin/students/${studentId}/graduations`)
      .set(bearer(admin));
    const fourth = history.body.graduations.find(
      (g: any) => g.kind === 'degree' && g.degree === 4,
    );
    const revoked = await t
      .http()
      .post(`/v1/admin/graduations/${fourth.id}/revoke`)
      .set(bearer(admin))
      .send({ reason: 'Grau lançado em duplicidade.' });
    expect(revoked.status).toBe(200);
    expect(revoked.body).toMatchObject({
      status: 'revoked',
      graduationId: fourth.id,
    });
    expect(revoked.body.belt).toMatchObject({ name: 'Azul', degrees: 3 });

    const revokeAudits = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(
          and(
            eq(auditLogs.action, 'graduation.revoked'),
            eq(auditLogs.targetId, revoked.body.revocationId),
          ),
        ),
    );
    expect(revokeAudits).toHaveLength(1);

    // An award is revocable at most once — the second attempt conflicts.
    const again = await t
      .http()
      .post(`/v1/admin/graduations/${fourth.id}/revoke`)
      .set(bearer(admin))
      .send({ reason: 'De novo.' });
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('graduation.already_reversed');

    // A revocation row itself can never be revoked.
    const freshHistory = await t
      .http()
      .get(`/v1/admin/students/${studentId}/graduations`)
      .set(bearer(admin));
    const revocationRow = freshHistory.body.graduations.find(
      (g: any) => g.kind === 'revocation',
    );
    const revokeRevocation = await t
      .http()
      .post(`/v1/admin/graduations/${revocationRow.id}/revoke`)
      .set(bearer(admin))
      .send({});
    expect(revokeRevocation.status).toBe(422);
    expect(revokeRevocation.body.code).toBe('validation.failed');
  });

  it('toggle gating: graduation.update off blocks the professor, never the admin', async () => {
    const created = await t
      .http()
      .post('/v1/admin/students')
      .set(bearer(admin))
      .send({ fullName: 'Gina Gate', birthDate: '1992-04-04' });
    const studentId = created.body.student.id;

    const off = await t
      .http()
      .put('/v1/admin/permissions')
      .set(bearer(admin))
      .send({
        entries: [
          { role: 'professor', key: 'graduation.update', allowed: false },
        ],
      });
    expect(off.status).toBe(200);

    const denied = await t
      .http()
      .post(`/v1/professor/students/${studentId}/graduations`)
      .set(bearer(professor))
      .send({ kind: 'degree' });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('authz.permission_disabled');

    // The admin is role-fixed — no toggle gates the academy owner (story 28).
    const adminAward = await t
      .http()
      .post(`/v1/admin/students/${studentId}/graduations`)
      .set(bearer(admin))
      .send({ kind: 'degree' });
    expect(adminAward.status).toBe(201);
    expect(adminAward.body.belt).toMatchObject({ name: 'Branca', degrees: 1 });

    await t
      .http()
      .put('/v1/admin/permissions')
      .set(bearer(admin))
      .send({
        entries: [
          { role: 'professor', key: 'graduation.update', allowed: true },
        ],
      });
    const restored = await t
      .http()
      .post(`/v1/professor/students/${studentId}/graduations`)
      .set(bearer(professor))
      .send({ kind: 'degree' });
    expect(restored.status).toBe(201);
  });
});
