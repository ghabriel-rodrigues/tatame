import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

/** ISO date `years` back from today (age is time-dependent — never hardcode). */
function isoYearsAgo(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  date.setDate(date.getDate() - 1); // safely past the birthday
  return date.toISOString().slice(0, 10);
}

describe('enrollment: admin registry (ENR.6/ENR.7)', () => {
  let t: TestApp;
  let admin: string;

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await t.login('admin@tatame.dev')).accessToken;
  });

  afterAll(async () => {
    await t.close();
  });

  it('lists students with derived Ativo/Pendente badges and active classes', async () => {
    const res = await t.http().get('/v1/admin/students').set(bearer(admin));
    expect(res.status).toBe(200);
    const byName = new Map(res.body.students.map((s: any) => [s.fullName, s]));

    const ana: any = byName.get('Ana Aluna');
    expect(ana.badge).toBe('ativo'); // claimed by a login
    expect(ana.classes.map((c: any) => c.name)).toContain('Adulto Gi');

    const kiko: any = byName.get('Kiko Kids');
    expect(kiko.badge).toBe('pendente'); // record without a login
    expect(kiko.guardianId).toBeTruthy();
    expect(kiko.classes.map((c: any) => c.name)).toContain('Kids');
  });

  it('creates an adult student without a guardian (badge pendente)', async () => {
    const res = await t
      .http()
      .post('/v1/admin/students')
      .set(bearer(admin))
      .send({ fullName: 'Walk-in Adulto', birthDate: '1990-01-15' });
    expect(res.status).toBe(201);
    expect(res.body.student.badge).toBe('pendente');
    expect(res.body.student.classes).toEqual([]);
  });

  it('refuses a minor without a guardian, accepts one linked (minor ⇒ guardian rule)', async () => {
    const minor = { fullName: 'Criança Sem Vínculo', birthDate: isoYearsAgo(9) };
    const refused = await t.http().post('/v1/admin/students').set(bearer(admin)).send(minor);
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('invite.minor_requires_guardian');

    const guardians = await t.http().get('/v1/admin/guardians').set(bearer(admin));
    const renata = guardians.body.guardians.find((g: any) => g.fullName === 'Renata Responsavel');
    const accepted = await t
      .http()
      .post('/v1/admin/students')
      .set(bearer(admin))
      .send({ ...minor, fullName: 'Criança Vinculada', guardianId: renata.id });
    expect(accepted.status).toBe(201);
    expect(accepted.body.student.guardianId).toBe(renata.id);

    const unknownGuardian = await t
      .http()
      .post('/v1/admin/students')
      .set(bearer(admin))
      .send({ ...minor, guardianId: '018f0000-0000-7000-8000-000000000bad' });
    expect(unknownGuardian.status).toBe(404);
    expect(unknownGuardian.body.code).toBe('resource.not_found');
  });

  it('edits name only and 404s on unknown ids', async () => {
    const created = await t
      .http()
      .post('/v1/admin/students')
      .set(bearer(admin))
      .send({ fullName: 'Nome Com Tipo', birthDate: '1985-02-02' });
    const renamed = await t
      .http()
      .patch(`/v1/admin/students/${created.body.student.id}`)
      .set(bearer(admin))
      .send({ fullName: 'Nome Sem Typo' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.student.fullName).toBe('Nome Sem Typo');

    const missing = await t
      .http()
      .patch('/v1/admin/students/018f0000-0000-7000-8000-000000000bad')
      .set(bearer(admin))
      .send({ fullName: 'Ninguém' });
    expect(missing.status).toBe(404);
  });

  it('soft-archives a student and ends their active enrollments atomically', async () => {
    const classesRes = await t.http().get('/v1/admin/classes').set(bearer(admin));
    const adulto = classesRes.body.classes.find((c: any) => c.name === 'Adulto Gi');

    const created = await t
      .http()
      .post('/v1/admin/students')
      .set(bearer(admin))
      .send({ fullName: 'Arquivavel Adulto', birthDate: '1992-03-03' });
    const studentId = created.body.student.id;
    const enrolled = await t
      .http()
      .post(`/v1/admin/classes/${adulto.id}/students`)
      .set(bearer(admin))
      .send({ studentId });
    expect(enrolled.status).toBe(201);

    const archived = await t
      .http()
      .post(`/v1/admin/students/${studentId}/archive`)
      .set(bearer(admin));
    expect(archived.status).toBe(204);

    // Hidden from the active listing, visible under the inactive filter.
    const activeList = await t.http().get('/v1/admin/students').set(bearer(admin));
    expect(activeList.body.students.some((s: any) => s.id === studentId)).toBe(false);
    const inactiveList = await t
      .http()
      .get('/v1/admin/students?status=inactive')
      .set(bearer(admin));
    const row = inactiveList.body.students.find((s: any) => s.id === studentId);
    expect(row.status).toBe('inactive');
    expect(row.classes).toEqual([]); // enrollment ended in the same transaction

    const roster = await t.http().get(`/v1/admin/classes/${adulto.id}`).set(bearer(admin));
    expect(roster.body.class.roster.some((r: any) => r.studentId === studentId)).toBe(false);
  });

  it('lists guardians with dependent counts and creates login-less records', async () => {
    const list = await t.http().get('/v1/admin/guardians').set(bearer(admin));
    expect(list.status).toBe(200);
    const renata = list.body.guardians.find((g: any) => g.fullName === 'Renata Responsavel');
    expect(renata.badge).toBe('ativo'); // claimed by responsavel@tatame.dev
    expect(renata.dependentCount).toBeGreaterThanOrEqual(2);

    const created = await t
      .http()
      .post('/v1/admin/guardians')
      .set(bearer(admin))
      .send({ fullName: 'Pai Novo', phone: '+55 11 90000-0000', email: 'Pai.Novo@example.com' });
    expect(created.status).toBe(201);
    expect(created.body.guardian.badge).toBe('pendente');
    expect(created.body.guardian.email).toBe('pai.novo@example.com');
    expect(created.body.guardian.dependentCount).toBe(0);

    const renamed = await t
      .http()
      .patch(`/v1/admin/guardians/${created.body.guardian.id}`)
      .set(bearer(admin))
      .send({ fullName: 'Pai Renomeado' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.guardian.fullName).toBe('Pai Renomeado');
  });

  it('registers a professor: new user + membership + set-your-password email full circle', async () => {
    t.sentEmails.length = 0;
    const res = await t
      .http()
      .post('/v1/admin/professors')
      .set(bearer(admin))
      .send({ fullName: 'Nova Professora', email: 'nova.prof@example.com' });
    expect(res.status).toBe(201);
    expect(res.body.userCreated).toBe(true);
    expect(res.body.passwordEmailSent).toBe(true);

    // The email rides the existing reset-token seam.
    expect(t.sentEmails).toHaveLength(1);
    expect(t.sentEmails[0].to).toBe('nova.prof@example.com');
    const token = new URL(t.sentEmails[0].resetUrl).searchParams.get('token');
    expect(token).toBeTruthy();

    const set = await t
      .http()
      .post('/v1/auth/password/reset')
      .send({ token, newPassword: 'SenhaProf!123' });
    expect([200, 204]).toContain(set.status);

    const login = await t
      .http()
      .post('/v1/auth/login')
      .send({ email: 'nova.prof@example.com', password: 'SenhaProf!123', transport: 'body' });
    expect(login.status).toBe(200);
    expect(login.body.memberships[0].role).toBe('professor');

    const list = await t.http().get('/v1/admin/professors').set(bearer(admin));
    expect(list.body.professors.some((p: any) => p.email === 'nova.prof@example.com')).toBe(true);

    // Registering the same email again in the same academy is a conflict.
    const dup = await t
      .http()
      .post('/v1/admin/professors')
      .set(bearer(admin))
      .send({ fullName: 'Nova Professora', email: 'nova.prof@example.com' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('resource.conflict');
  });

  it('reuses an existing account by email without sending a password email', async () => {
    t.sentEmails.length = 0;
    const res = await t
      .http()
      .post('/v1/admin/professors')
      .set(bearer(admin))
      .send({ fullName: 'Ana Aluna', email: 'aluno@tatame.dev' });
    expect(res.status).toBe(201);
    expect(res.body.userCreated).toBe(false);
    expect(res.body.passwordEmailSent).toBe(false);
    expect(t.sentEmails).toHaveLength(0);
  });

  it('RBAC: the registry surfaces are role-fenced per persona', async () => {
    const professor = (await t.login('professor@tatame.dev')).accessToken;
    const student = (await t.login('aluno@tatame.dev')).accessToken;
    const guardian = (await t.login('responsavel@tatame.dev')).accessToken;

    for (const [token, method, path] of [
      [professor, 'get', '/v1/admin/students'],
      [professor, 'post', '/v1/admin/professors'],
      [student, 'get', '/v1/admin/guardians'],
      [student, 'get', '/v1/responsavel/dependents'],
      [guardian, 'get', '/v1/admin/classes'],
      [guardian, 'get', '/v1/professor/classes'],
      [admin, 'get', '/v1/professor/classes'],
      [admin, 'get', '/v1/responsavel/dependents'],
    ] as const) {
      const res = await (t.http() as any)[method](path).set(bearer(token)).send({});
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.code).toBe('authz.forbidden_role');
    }
  });

  it('read-only (delinquent) academy blocks registry mutations but keeps reads', async () => {
    await t.setAcademyStatus('alpha-jj', 'delinquent');
    try {
      const write = await t
        .http()
        .post('/v1/admin/students')
        .set(bearer(admin))
        .send({ fullName: 'Bloqueado', birthDate: '1990-01-01' });
      expect(write.status).toBe(403);
      expect(write.body.code).toBe('tenant.read_only');

      const read = await t.http().get('/v1/admin/students').set(bearer(admin));
      expect(read.status).toBe(200);
    } finally {
      await t.setAcademyStatus('alpha-jj', 'active');
    }
  });

  it('RLS: registry listings never cross tenants', async () => {
    const bravoAdmin = (await t.login('admin.bravo@tatame.dev')).accessToken;

    const students = await t.http().get('/v1/admin/students').set(bearer(bravoAdmin));
    const names = students.body.students.map((s: any) => s.fullName);
    expect(names).toContain('Bento Bravo Jr');
    expect(names).not.toContain('Ana Aluna');
    expect(names).not.toContain('Kiko Kids');

    const guardians = await t.http().get('/v1/admin/guardians').set(bearer(bravoAdmin));
    const guardianNames = guardians.body.guardians.map((g: any) => g.fullName);
    expect(guardianNames).toContain('Gustavo Guardiao');
    expect(guardianNames).not.toContain('Renata Responsavel');

    // Same fixture class names exist in both academies — ids must differ.
    const alphaClasses = await t.http().get('/v1/admin/classes').set(bearer(admin));
    const bravoClasses = await t.http().get('/v1/admin/classes').set(bearer(bravoAdmin));
    const alphaIds = new Set(alphaClasses.body.classes.map((c: any) => c.id));
    for (const c of bravoClasses.body.classes) expect(alphaIds.has(c.id)).toBe(false);
    expect(
      bravoClasses.body.classes.every((c: any) => c.professor.fullName === 'Marcos Multi'),
    ).toBe(true);
  });
});
