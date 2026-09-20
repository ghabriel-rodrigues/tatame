import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

/** ISO date `years` back from today (age is time-dependent — never hardcode). */
function isoYearsAgo(years: number): string {
  const date = new Date();
  date.setFullYear(date.getFullYear() - years);
  date.setDate(date.getDate() - 1);
  return date.toISOString().slice(0, 10);
}

describe('enrollment: professor + responsável surfaces and invite completion (ENR.10–12)', () => {
  let t: TestApp;
  let admin: string;
  let professor: string;
  let responsavel: string;
  let kidsId: string;
  let lotadaId: string;
  let adultoId: string;

  async function classIdByName(token: string, name: string): Promise<string> {
    const res = await t.http().get('/v1/admin/classes').set(bearer(token));
    return res.body.classes.find((c: any) => c.name === name).id;
  }

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await t.login('admin@tatame.dev')).accessToken;
    professor = (await t.login('professor@tatame.dev')).accessToken;
    responsavel = (await t.login('responsavel@tatame.dev')).accessToken;
    kidsId = await classIdByName(admin, 'Kids');
    lotadaId = await classIdByName(admin, 'Lotada');
    adultoId = await classIdByName(admin, 'Adulto Gi');
  });

  afterAll(async () => {
    await t.close();
  });

  it('professor sees only own classes with occupancy; detail carries the roster', async () => {
    const list = await t
      .http()
      .get('/v1/professor/classes')
      .set(bearer(professor));
    expect(list.status).toBe(200);
    expect(list.body.classes.map((c: any) => c.name).sort()).toEqual([
      'Adulto Gi',
      'Kids',
      'Lotada',
    ]);

    const detail = await t
      .http()
      .get(`/v1/professor/classes/${kidsId}`)
      .set(bearer(professor));
    expect(detail.status).toBe(200);
    expect(detail.body.class.roster).toHaveLength(2);
    expect(detail.body.class.occupancy).toBe(2);
  });

  it('a class the professor does not teach behaves as a 404 — same and cross tenant', async () => {
    // Same tenant, another professor (multi@ holds an alpha professor membership).
    const professors = await t
      .http()
      .get('/v1/admin/professors')
      .set(bearer(admin));
    const multiUserId = professors.body.professors.find(
      (p: any) => p.email === 'multi@tatame.dev',
    ).userId;
    const foreign = await t
      .http()
      .post('/v1/admin/classes')
      .set(bearer(admin))
      .send({
        name: 'Turma Do Multi',
        professorUserId: multiUserId,
        capacity: 8,
        schedules: [{ weekday: 4, startTime: '21:00', durationMinutes: 60 }],
      });
    expect(foreign.status).toBe(201);
    const foreignId = foreign.body.class.id;

    for (const [method, path] of [
      ['get', `/v1/professor/classes/${foreignId}`],
      ['post', `/v1/professor/classes/${foreignId}/students`],
    ] as const) {
      const res = await (t.http() as any)
        [method](path)
        .set(bearer(professor))
        .send({ studentId: '018f0000-0000-7000-8000-000000000001' });
      expect(res.status, `${method} ${path}`).toBe(404);
      expect(res.body.code).toBe('resource.not_found');
    }

    // Cross-tenant: a bravo class id is invisible through RLS.
    const bravoAdmin = (await t.login('admin.bravo@tatame.dev')).accessToken;
    const bravoKids = await classIdByName(bravoAdmin, 'Kids');
    const crossTenant = await t
      .http()
      .get(`/v1/professor/classes/${bravoKids}`)
      .set(bearer(professor));
    expect(crossTenant.status).toBe(404);

    expect(
      list404(
        await t.http().get('/v1/professor/classes').set(bearer(professor)),
        foreignId,
      ),
    ).toBe(true);

    function list404(res: any, id: string): boolean {
      return !res.body.classes.some((c: any) => c.id === id);
    }
  });

  it('professor roster add/remove on own classes, bound by the same capacity rule', async () => {
    const created = await t
      .http()
      .post('/v1/admin/students')
      .set(bearer(admin))
      .send({ fullName: 'Aluno Do Tatame', birthDate: '1996-06-06' });
    const studentId = created.body.student.id;

    const added = await t
      .http()
      .post(`/v1/professor/classes/${adultoId}/students`)
      .set(bearer(professor))
      .send({ studentId });
    expect(added.status).toBe(201);

    const full = await t
      .http()
      .post(`/v1/professor/classes/${lotadaId}/students`)
      .set(bearer(professor))
      .send({ studentId });
    expect(full.status).toBe(409);
    expect(full.body.code).toBe('class.full');

    const removed = await t
      .http()
      .delete(`/v1/professor/classes/${adultoId}/students/${studentId}`)
      .set(bearer(professor));
    expect(removed.status).toBe(200);
  });

  it('responsável lists own dependents with class + next slot; foreign ids are 404 (001 debt closed)', async () => {
    const list = await t
      .http()
      .get('/v1/responsavel/dependents')
      .set(bearer(responsavel));
    expect(list.status).toBe(200);
    expect(list.body.dependents.map((d: any) => d.fullName).sort()).toEqual([
      'Kiko Kids',
      'Lara Kids',
    ]);
    const kiko = list.body.dependents.find(
      (d: any) => d.fullName === 'Kiko Kids',
    );
    expect(kiko.class.name).toBe('Kids');
    expect(kiko.class.nextSlot).toBeTruthy();
    expect(kiko.class.schedules).toHaveLength(2);

    const detail = await t
      .http()
      .get(`/v1/responsavel/dependents/${kiko.id}`)
      .set(bearer(responsavel));
    expect(detail.status).toBe(200);

    // Same-tenant student that is NOT theirs: existence never leaks.
    const students = await t
      .http()
      .get('/v1/admin/students')
      .set(bearer(admin));
    const fabio = students.body.students.find(
      (s: any) => s.fullName === 'Fabio Fila',
    );
    const sameTenant = await t
      .http()
      .get(`/v1/responsavel/dependents/${fabio.id}`)
      .set(bearer(responsavel));
    expect(sameTenant.status).toBe(404);
    expect(sameTenant.body.code).toBe('resource.not_found');

    // Cross-tenant dependent id: invisible through RLS, same 404.
    const bravoAdmin = (await t.login('admin.bravo@tatame.dev')).accessToken;
    const bravoStudents = await t
      .http()
      .get('/v1/admin/students')
      .set(bearer(bravoAdmin));
    const bento = bravoStudents.body.students.find(
      (s: any) => s.fullName === 'Bento Bravo Jr',
    );
    const crossTenant = await t
      .http()
      .get(`/v1/responsavel/dependents/${bento.id}`)
      .set(bearer(responsavel));
    expect(crossTenant.status).toBe(404);
  });

  it('suggests a class by age: range match, fullness and occupancy tie-break; null otherwise', async () => {
    const eightYearsOld = isoYearsAgo(8);
    const first = await t
      .http()
      .get(`/v1/responsavel/class-suggestion?birthDate=${eightYearsOld}`)
      .set(bearer(responsavel));
    expect(first.status).toBe(200);
    expect(first.body.suggestion.name).toBe('Kids');

    const adult = await t
      .http()
      .get(`/v1/responsavel/class-suggestion?birthDate=${isoYearsAgo(30)}`)
      .set(bearer(responsavel));
    expect(adult.body.suggestion).toBeNull();

    // Lower occupancy wins the tie-break…
    const professors = await t
      .http()
      .get('/v1/admin/professors')
      .set(bearer(admin));
    const profId = professors.body.professors.find(
      (p: any) => p.email === 'professor@tatame.dev',
    ).userId;
    const kidsB = await t
      .http()
      .post('/v1/admin/classes')
      .set(bearer(admin))
      .send({
        name: 'Kids B',
        professorUserId: profId,
        capacity: 1,
        ageMin: 4,
        ageMax: 12,
        schedules: [{ weekday: 6, startTime: '09:00', durationMinutes: 45 }],
      });
    const kidsBId = kidsB.body.class.id;
    const emptied = await t
      .http()
      .get(`/v1/responsavel/class-suggestion?birthDate=${eightYearsOld}`)
      .set(bearer(responsavel));
    expect(emptied.body.suggestion.name).toBe('Kids B');

    // …and a full class is never suggested.
    const filler = await t
      .http()
      .post('/v1/admin/students')
      .set(bearer(admin))
      .send({
        fullName: 'Kid Ocupante',
        birthDate: eightYearsOld,
        ...(await guardianIdPatch()),
      });
    expect(filler.status).toBe(201);
    await t
      .http()
      .post(`/v1/admin/classes/${kidsBId}/students`)
      .set(bearer(admin))
      .send({ studentId: filler.body.student.id });
    const refilled = await t
      .http()
      .get(`/v1/responsavel/class-suggestion?birthDate=${eightYearsOld}`)
      .set(bearer(responsavel));
    expect(refilled.body.suggestion.name).toBe('Kids');

    async function guardianIdPatch(): Promise<{ guardianId: string }> {
      const guardians = await t
        .http()
        .get('/v1/admin/guardians')
        .set(bearer(admin));
      return {
        guardianId: guardians.body.guardians.find(
          (g: any) => g.fullName === 'Renata Responsavel',
        ).id,
      };
    }
  });

  it('cadastrar filho: auto guardian link + enrollment; a full accepted class only skips it', async () => {
    const registered = await t
      .http()
      .post('/v1/responsavel/dependents')
      .set(bearer(responsavel))
      .send({
        fullName: 'Nino Novo',
        birthDate: isoYearsAgo(7),
        classId: kidsId,
      });
    expect(registered.status).toBe(201);
    expect(registered.body.enrolled).toBe(true);
    expect(registered.body.dependent.class.name).toBe('Kids');

    // Auto-linked: the admin registry shows the child under the guardian.
    const students = await t
      .http()
      .get('/v1/admin/students')
      .set(bearer(admin));
    const nino = students.body.students.find(
      (s: any) => s.fullName === 'Nino Novo',
    );
    expect(nino.guardianId).toBeTruthy();
    expect(nino.badge).toBe('pendente');

    // Kids B is full (previous test): registration still succeeds, unenrolled.
    const kidsBId = (
      await t.http().get('/v1/admin/classes').set(bearer(admin))
    ).body.classes.find((c: any) => c.name === 'Kids B').id;
    const fullClass = await t
      .http()
      .post('/v1/responsavel/dependents')
      .set(bearer(responsavel))
      .send({
        fullName: 'Nina Nova',
        birthDate: isoYearsAgo(6),
        classId: kidsBId,
      });
    expect(fullClass.status).toBe(201);
    expect(fullClass.body.enrolled).toBe(false);
    expect(fullClass.body.dependent.class).toBeNull();

    // A class that is not a legitimate age suggestion is refused.
    const unranged = await t
      .http()
      .post('/v1/responsavel/dependents')
      .set(bearer(responsavel))
      .send({
        fullName: 'Nome Qualquer',
        birthDate: isoYearsAgo(7),
        classId: adultoId,
      });
    expect(unranged.status).toBe(422);
  });

  it('the dependents.register toggle blocks the mutation server-side with its own code', async () => {
    await t
      .http()
      .put('/v1/admin/permissions')
      .set(bearer(admin))
      .send({
        entries: [
          { role: 'guardian', key: 'dependents.register', allowed: false },
        ],
      });
    try {
      const denied = await t
        .http()
        .post('/v1/responsavel/dependents')
        .set(bearer(responsavel))
        .send({ fullName: 'Bloqueado', birthDate: isoYearsAgo(7) });
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe('authz.permission_disabled');

      // Reads stay open — only the toggleable mutation is gated.
      const list = await t
        .http()
        .get('/v1/responsavel/dependents')
        .set(bearer(responsavel));
      expect(list.status).toBe(200);
    } finally {
      await t
        .http()
        .put('/v1/admin/permissions')
        .set(bearer(admin))
        .send({
          entries: [
            { role: 'guardian', key: 'dependents.register', allowed: true },
          ],
        });
    }
  });

  it('aluno invite bound to a class enrolls the new student on accept', async () => {
    const invite = await t
      .http()
      .post('/v1/invites')
      .set(bearer(professor))
      .send({ kind: 'student', classId: adultoId });
    expect(invite.status).toBe(201);

    const accepted = await t
      .http()
      .post(`/v1/public/invites/${invite.body.token}/accept`)
      .send({
        email: 'convidado.turma@example.com',
        password: 'SenhaForte!123',
        fullName: 'Convidado Da Turma',
        birthDate: '1998-08-08',
      });
    expect(accepted.status).toBe(201);
    expect(accepted.body.enrollmentSkipped).toBe(false);

    const students = await t
      .http()
      .get('/v1/admin/students')
      .set(bearer(admin));
    const row = students.body.students.find(
      (s: any) => s.fullName === 'Convidado Da Turma',
    );
    expect(row.badge).toBe('ativo'); // claimed by its own signup
    expect(row.classes.map((c: any) => c.name)).toContain('Adulto Gi');
  });

  it('responsável invite persists guardian + dependents, enrolled into the bound class (001 debt closed)', async () => {
    const invite = await t
      .http()
      .post('/v1/invites')
      .set(bearer(admin))
      .send({ kind: 'guardian', classId: kidsId });
    const accepted = await t
      .http()
      .post(`/v1/public/invites/${invite.body.token}/accept`)
      .send({
        email: 'mae.convidada@example.com',
        password: 'SenhaForte!123',
        fullName: 'Mãe Convidada',
        birthDate: '1987-07-07',
        dependents: [
          { fullName: 'Gêmea Um', birthDate: isoYearsAgo(6) },
          { fullName: 'Gêmea Dois', birthDate: isoYearsAgo(6) },
        ],
      });
    expect(accepted.status).toBe(201);
    expect(accepted.body.enrollmentSkipped).toBe(false);

    const guardians = await t
      .http()
      .get('/v1/admin/guardians')
      .set(bearer(admin));
    const mae = guardians.body.guardians.find(
      (g: any) => g.fullName === 'Mãe Convidada',
    );
    expect(mae.badge).toBe('ativo');
    expect(mae.dependentCount).toBe(2);

    const students = await t
      .http()
      .get('/v1/admin/students')
      .set(bearer(admin));
    for (const name of ['Gêmea Um', 'Gêmea Dois']) {
      const row = students.body.students.find((s: any) => s.fullName === name);
      expect(row.guardianId).toBe(mae.id);
      expect(row.badge).toBe('pendente');
      expect(row.classes.map((c: any) => c.name)).toContain('Kids');
    }

    // The new guardian's own surface works immediately.
    const dependents = await t
      .http()
      .get('/v1/responsavel/dependents')
      .set(bearer(accepted.body.accessToken));
    expect(dependents.status).toBe(200);
    expect(dependents.body.dependents).toHaveLength(2);
  });

  it('accepting into a meanwhile-full class keeps the signup and surfaces enrollment_skipped', async () => {
    const invite = await t
      .http()
      .post('/v1/invites')
      .set(bearer(admin))
      .send({ kind: 'student', classId: lotadaId });
    const accepted = await t
      .http()
      .post(`/v1/public/invites/${invite.body.token}/accept`)
      .send({
        email: 'sem.vaga@example.com',
        password: 'SenhaForte!123',
        fullName: 'Sem Vaga Mas Dentro',
        birthDate: '1997-09-09',
      });
    expect(accepted.status).toBe(201);
    expect(accepted.body.enrollmentSkipped).toBe(true);

    // Unassigned in the registry — the admin's Pendente/unassigned state.
    const students = await t
      .http()
      .get('/v1/admin/students')
      .set(bearer(admin));
    const row = students.body.students.find(
      (s: any) => s.fullName === 'Sem Vaga Mas Dentro',
    );
    expect(row.classes).toEqual([]);
  });

  it('invite creation validates the class binding against the academy', async () => {
    const unknown = await t.http().post('/v1/invites').set(bearer(admin)).send({
      kind: 'student',
      classId: '018f0000-0000-7000-8000-000000000bad',
    });
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('resource.not_found');

    // A foreign (other-tenant) class id is equally invisible.
    const bravoAdmin = (await t.login('admin.bravo@tatame.dev')).accessToken;
    const bravoKids = await classIdByName(bravoAdmin, 'Kids');
    const foreign = await t
      .http()
      .post('/v1/invites')
      .set(bearer(admin))
      .send({ kind: 'student', classId: bravoKids });
    expect(foreign.status).toBe(404);
  });
});
