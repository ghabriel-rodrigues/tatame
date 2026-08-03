import { and, count, eq } from 'drizzle-orm';
import { enrollments, withPlatform } from '@tatame/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

describe('enrollment: turmas, capacity lock and the atomic move (ENR.8/ENR.9)', () => {
  let t: TestApp;
  let admin: string;
  let professorUserId: string;

  async function createStudent(fullName: string): Promise<string> {
    const res = await t
      .http()
      .post('/v1/admin/students')
      .set(bearer(admin))
      .send({ fullName, birthDate: '1994-04-04' });
    expect(res.status).toBe(201);
    return res.body.student.id;
  }

  async function createClass(
    name: string,
    capacity: number,
    schedules = [{ weekday: 2, startTime: '20:00', durationMinutes: 60 }],
  ): Promise<string> {
    const res = await t
      .http()
      .post('/v1/admin/classes')
      .set(bearer(admin))
      .send({ name, professorUserId, capacity, schedules });
    expect(res.status).toBe(201);
    return res.body.class.id;
  }

  async function addStudent(classId: string, studentId: string) {
    return t.http().post(`/v1/admin/classes/${classId}/students`).set(bearer(admin)).send({ studentId });
  }

  async function rosterIds(classId: string): Promise<string[]> {
    const res = await t.http().get(`/v1/admin/classes/${classId}`).set(bearer(admin));
    expect(res.status).toBe(200);
    return res.body.class.roster.map((r: any) => r.studentId);
  }

  beforeAll(async () => {
    t = await createTestApp();
    admin = (await t.login('admin@tatame.dev')).accessToken;
    const professors = await t.http().get('/v1/admin/professors').set(bearer(admin));
    professorUserId = professors.body.professors.find(
      (p: any) => p.email === 'professor@tatame.dev',
    ).userId;
  });

  afterAll(async () => {
    await t.close();
  });

  it('lists turmas with schedules, server-derived occupancy and Lotada', async () => {
    const res = await t.http().get('/v1/admin/classes').set(bearer(admin));
    expect(res.status).toBe(200);
    const byName = new Map(res.body.classes.map((c: any) => [c.name, c]));

    const lotada: any = byName.get('Lotada');
    expect(lotada.occupancy).toBe(2);
    expect(lotada.capacity).toBe(2);
    expect(lotada.lotada).toBe(true);

    const adulto: any = byName.get('Adulto Gi');
    expect(adulto.lotada).toBe(false);
    expect(adulto.schedules).toHaveLength(3); // Seg · Qua · Sex 19:00
    expect(adulto.schedules[0]).toMatchObject({ weekday: 1, startTime: '19:00' });
    expect(adulto.professor.fullName).toBe('Paulo Professor');

    const kids: any = byName.get('Kids');
    expect(kids.ageMin).toBe(4);
    expect(kids.ageMax).toBe(12);
  });

  it('creates a recurring turma — each weekday chip becomes a schedule row', async () => {
    const res = await t
      .http()
      .post('/v1/admin/classes')
      .set(bearer(admin))
      .send({
        name: 'Competição',
        professorUserId,
        capacity: 10,
        schedules: [
          { weekday: 1, startTime: '06:30', durationMinutes: 90 },
          { weekday: 3, startTime: '06:30', durationMinutes: 90 },
          { weekday: 5, startTime: '06:30', durationMinutes: 90 },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body.class.schedules).toHaveLength(3);
    expect(res.body.class.occupancy).toBe(0);

    const detail = await t.http().get(`/v1/admin/classes/${res.body.class.id}`).set(bearer(admin));
    expect(detail.body.class.schedules).toHaveLength(3);
  });

  it('rejects schedule-less, duplicate-slot and non-professor turma creation', async () => {
    const scheduleless = await t
      .http()
      .post('/v1/admin/classes')
      .set(bearer(admin))
      .send({ name: 'Sem Grade', professorUserId, capacity: 10, schedules: [] });
    expect(scheduleless.status).toBe(422);
    expect(scheduleless.body.code).toBe('validation.failed');

    const duplicated = await t
      .http()
      .post('/v1/admin/classes')
      .set(bearer(admin))
      .send({
        name: 'Chip Duplicado',
        professorUserId,
        capacity: 10,
        schedules: [
          { weekday: 1, startTime: '19:00', durationMinutes: 60 },
          { weekday: 1, startTime: '19:00', durationMinutes: 60 },
        ],
      });
    expect(duplicated.status).toBe(422);

    const me = await t.http().get('/v1/auth/me').set(bearer(admin));
    const notProfessor = await t
      .http()
      .post('/v1/admin/classes')
      .set(bearer(admin))
      .send({
        name: 'Prof Errado',
        professorUserId: me.body.user.id, // admin has no professor membership
        capacity: 10,
        schedules: [{ weekday: 2, startTime: '19:00', durationMinutes: 60 }],
      });
    expect(notProfessor.status).toBe(422);
    expect(notProfessor.body.code).toBe('validation.failed');
  });

  it('name-only edit works and archive hides the turma ending its enrollments', async () => {
    const classId = await createClass('Descontinuada', 5);
    const studentId = await createStudent('Aluno Da Descontinuada');
    expect((await addStudent(classId, studentId)).status).toBe(201);

    const renamed = await t
      .http()
      .patch(`/v1/admin/classes/${classId}`)
      .set(bearer(admin))
      .send({ name: 'Descontinuada 2024' });
    expect(renamed.status).toBe(200);
    expect(renamed.body.class.name).toBe('Descontinuada 2024');

    const archived = await t.http().post(`/v1/admin/classes/${classId}/archive`).set(bearer(admin));
    expect(archived.status).toBe(204);

    const activeList = await t.http().get('/v1/admin/classes').set(bearer(admin));
    expect(activeList.body.classes.some((c: any) => c.id === classId)).toBe(false);

    // History survives: detail still resolves, roster emptied atomically.
    const detail = await t.http().get(`/v1/admin/classes/${classId}`).set(bearer(admin));
    expect(detail.body.class.status).toBe('archived');
    expect(detail.body.class.roster).toEqual([]);

    // An archived class refuses enrollment with its own stable code.
    const rejected = await addStudent(classId, studentId);
    expect(rejected.status).toBe(409);
    expect(rejected.body.code).toBe('class.archived');
  });

  it('roster add/remove with reactivation upsert — never a second row', async () => {
    const classId = await createClass('Reativação', 5);
    const studentId = await createStudent('Aluno Reativado');

    expect((await addStudent(classId, studentId)).status).toBe(201);
    const again = await addStudent(classId, studentId);
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('enrollment.already_enrolled');

    const removed = await t
      .http()
      .delete(`/v1/admin/classes/${classId}/students/${studentId}`)
      .set(bearer(admin));
    expect(removed.status).toBe(200);
    expect(removed.body.enrollment.status).toBe('removed');

    const removeAgain = await t
      .http()
      .delete(`/v1/admin/classes/${classId}/students/${studentId}`)
      .set(bearer(admin));
    expect(removeAgain.status).toBe(404);

    expect((await addStudent(classId, studentId)).status).toBe(201);
    expect(await rosterIds(classId)).toContain(studentId);

    // Upsert on the unique key: one row per (tenant, class, student), ever.
    const [row] = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select({ total: count() })
        .from(enrollments)
        .where(and(eq(enrollments.classId, classId), eq(enrollments.studentId, studentId))),
    );
    expect(Number(row?.total)).toBe(1);
  });

  it('rejects adding to a full class with class.full', async () => {
    const classes = await t.http().get('/v1/admin/classes').set(bearer(admin));
    const lotada = classes.body.classes.find((c: any) => c.name === 'Lotada');
    const studentId = await createStudent('Sem Vaga');
    const res = await addStudent(lotada.id, studentId);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('class.full');
  });

  it('capacity race: two concurrent adds on the last slot admit exactly one', async () => {
    const classId = await createClass('Última Vaga', 1);
    const [a, b] = await Promise.all([
      createStudent('Corredor A'),
      createStudent('Corredor B'),
    ]);

    const [resA, resB] = await Promise.all([addStudent(classId, a), addStudent(classId, b)]);
    const statuses = [resA.status, resB.status].sort();
    expect(statuses).toEqual([201, 409]);
    const loser = resA.status === 409 ? resA : resB;
    expect(loser.body.code).toBe('class.full');
    expect(await rosterIds(classId)).toHaveLength(1);
  });

  it('bulk move is all-or-nothing: capacity rejection leaves every roster untouched', async () => {
    const origin = await createClass('Origem', 5);
    const destination = await createClass('Destino Apertado', 2);
    const [a, b, c] = await Promise.all([
      createStudent('Movido A'),
      createStudent('Movido B'),
      createStudent('Ocupante C'),
    ]);
    for (const s of [a, b]) expect((await addStudent(origin, s)).status).toBe(201);
    expect((await addStudent(destination, c)).status).toBe(201);

    // 2 selected, 1 free seat → whole batch rejected with per-student detail.
    const rejected = await t
      .http()
      .post('/v1/admin/students/move')
      .set(bearer(admin))
      .send({ studentIds: [a, b], destinationClassId: destination });
    expect(rejected.status).toBe(409);
    expect(rejected.body.code).toBe('class.capacity_exceeded');
    expect(rejected.body.errors?.length).toBeGreaterThan(0);

    expect((await rosterIds(origin)).sort()).toEqual([a, b].sort());
    expect(await rosterIds(destination)).toEqual([c]);

    // A destination with room takes the whole selection atomically.
    const roomy = await createClass('Destino Livre', 5);
    const moved = await t
      .http()
      .post('/v1/admin/students/move')
      .set(bearer(admin))
      .send({ studentIds: [a, b], destinationClassId: roomy });
    expect(moved.status).toBe(200);
    expect(moved.body.movedStudentIds.sort()).toEqual([a, b].sort());
    expect(await rosterIds(origin)).toEqual([]);
    expect((await rosterIds(roomy)).sort()).toEqual([a, b].sort());
  });

  it('move validates destination and selection', async () => {
    const studentId = await createStudent('Selecionado');
    const archivedClass = await createClass('Destino Arquivado', 5);
    await t.http().post(`/v1/admin/classes/${archivedClass}/archive`).set(bearer(admin));

    const toArchived = await t
      .http()
      .post('/v1/admin/students/move')
      .set(bearer(admin))
      .send({ studentIds: [studentId], destinationClassId: archivedClass });
    expect(toArchived.status).toBe(409);
    expect(toArchived.body.code).toBe('class.archived');

    const destination = await createClass('Destino Real', 5);
    const unknown = await t
      .http()
      .post('/v1/admin/students/move')
      .set(bearer(admin))
      .send({
        studentIds: [studentId, '018f0000-0000-7000-8000-000000000bad'],
        destinationClassId: destination,
      });
    expect(unknown.status).toBe(404);
    expect(await rosterIds(destination)).toEqual([]);
  });
});
