import { eq, sql } from 'drizzle-orm';
import { students, users, withPlatform } from '@tatame/db';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

/**
 * Spec 013 (REP.6/REP.7, REP.8): the aluno Dados pessoais round trip — locked
 * CPF/RG, read-only identity facts, per-field validation, in-transaction name
 * sync onto the student row — plus the now-real graduation-timeline
 * `certificateAvailable` flag.
 */

describe('aluno profile & certificate flag (spec 013)', () => {
  let t: TestApp;
  let aluno: string;
  let admin: string;

  beforeAll(async () => {
    t = await createTestApp();
    aluno = (await t.login('aluno@tatame.dev')).accessToken;
    admin = (await t.login('admin@tatame.dev')).accessToken;
  });

  afterAll(async () => {
    await t.close();
  });

  const getProfile = () => t.http().get('/v1/aluno/profile').set(bearer(aluno));
  const putProfile = (body: Record<string, unknown>) =>
    t.http().put('/v1/aluno/profile').set(bearer(aluno)).send(body);

  it('GET: the seeded full profile arrives locked, with read-only identity facts', async () => {
    const res = await getProfile();
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fullName: 'Ana Aluna',
      email: 'aluno@tatame.dev',
      // Birth-date authority: the linked student row of the active academy.
      birthDate: '2000-03-15',
      gender: 'female',
      cpf: '39053344705',
      cpfLocked: true,
      rg: '12.345.678-9',
      rgLocked: true,
      addressState: 'SP',
      addressZip: '01310100',
      emergencyContactName: 'Renata Responsavel',
    });
  });

  it('PUT: edits normalize (UF uppercase, CEP digits) and the name syncs onto the student row', async () => {
    const res = await putProfile({
      fullName: 'Ana Aluna Silva',
      phone: '+55 11 98888-0000',
      addressLine: 'Av. Paulista, 1000',
      addressCity: 'Rio de Janeiro',
      addressState: 'rj',
      addressZip: '20040-020',
      emergencyContactName: 'Paulo Emergencia',
      emergencyContactPhone: '+55 21 97777-1111',
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      fullName: 'Ana Aluna Silva',
      addressState: 'RJ',
      addressZip: '20040020',
      phone: '+55 11 98888-0000',
    });

    // Roster truth: the admin registry shows the new name immediately.
    const registry = await t.http().get('/v1/admin/students').set(bearer(admin));
    const names = registry.body.students.map((s: any) => s.fullName);
    expect(names).toContain('Ana Aluna Silva');
    expect(names).not.toContain('Ana Aluna');

    // Restore the fixture name (also proves the sync runs both ways).
    const restore = await putProfile({ fullName: 'Ana Aluna' });
    expect(restore.status).toBe(200);
    const restored = await t.http().get('/v1/admin/students').set(bearer(admin));
    expect(restored.body.students.map((s: any) => s.fullName)).toContain('Ana Aluna');
  });

  it('CPF/RG are write-once: any change after set is a 422 profile.field_locked; same value is a no-op', async () => {
    const changeCpf = await putProfile({ cpf: '529.982.247-25' }); // valid, but different
    expect(changeCpf.status).toBe(422);
    expect(changeCpf.body.code).toBe('profile.field_locked');

    const changeRg = await putProfile({ rg: '99.999.999-9' });
    expect(changeRg.status).toBe(422);
    expect(changeRg.body.code).toBe('profile.field_locked');

    const sameCpf = await putProfile({ cpf: '390.533.447-05' }); // masked, same digits
    expect(sameCpf.status).toBe(200);
    expect(sameCpf.body.cpf).toBe('39053344705');
  });

  it('CPF sets once while NULL (mask normalized + checksum), then locks', async () => {
    await withPlatform(t.platformDb.db, (tx) =>
      tx
        .update(users)
        .set({ cpf: null, rg: null })
        .where(sql`lower(${users.email}) = 'aluno@tatame.dev'`),
    );
    const unlocked = await getProfile();
    expect(unlocked.body.cpfLocked).toBe(false);
    expect(unlocked.body.rgLocked).toBe(false);

    const set = await putProfile({ cpf: '529.982.247-25', rg: 'MG-12.345.678' });
    expect(set.status).toBe(200);
    expect(set.body.cpf).toBe('52998224725');
    expect(set.body.cpfLocked).toBe(true);
    expect(set.body.rgLocked).toBe(true);

    const relock = await putProfile({ cpf: '39053344705' });
    expect(relock.status).toBe(422);
    expect(relock.body.code).toBe('profile.field_locked');
  });

  it('per-field validation: bad checksum, CEP, UF and gender are 422s with field errors', async () => {
    for (const [body, field] of [
      [{ cpf: '111.111.111-11' }, 'cpf'], // same-digit sequence
      [{ cpf: '123.456.789-00' }, 'cpf'], // checksum fails
      [{ addressZip: '1234' }, 'addressZip'],
      [{ addressState: 'XX' }, 'addressState'],
      [{ phone: 'abc' }, 'phone'],
    ] as const) {
      const res = await putProfile(body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.code).toBe('validation.failed');
      expect(res.body.errors.map((e: any) => e.field)).toContain(field);
    }

    // Unknown gender is stopped by the DTO validator.
    const gender = await putProfile({ gender: 'banana' });
    expect(gender.status).toBe(422);
    expect(gender.body.code).toBe('validation.failed');
  });

  it('email and birthDate in the payload are ignored-with-422, never silently dropped', async () => {
    for (const body of [{ email: 'novo@tatame.dev' }, { birthDate: '1999-01-01' }]) {
      const res = await putProfile(body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(res.body.code).toBe('profile.field_read_only');
    }
    const unchanged = await getProfile();
    expect(unchanged.body.email).toBe('aluno@tatame.dev');
    expect(unchanged.body.birthDate).toBe('2000-03-15');
  });

  it('the surface is student-only, and the PUT is blocked in read-only academies', async () => {
    for (const email of ['professor@tatame.dev', 'responsavel@tatame.dev', 'admin@tatame.dev']) {
      const token = (await t.login(email)).accessToken;
      const res = await t.http().get('/v1/aluno/profile').set(bearer(token));
      expect(res.status, email).toBe(403);
      expect(res.body.code).toBe('authz.forbidden_role');
    }

    await t.setAcademyStatus('alpha-jj', 'delinquent');
    try {
      const read = await getProfile();
      expect(read.status).toBe(200); // read-only means read-only, not blind
      const write = await putProfile({ addressCity: 'Santos' });
      expect(write.status).toBe(403);
      expect(write.body.code).toBe('tenant.read_only');
    } finally {
      await t.setAcademyStatus('alpha-jj', 'active');
    }
  });

  it('certificateAvailable is real: true exactly on non-reversed belt promotions', async () => {
    const before = await t.http().get('/v1/aluno/graduation').set(bearer(aluno));
    expect(before.status).toBe(200);
    for (const entry of before.body.timeline) {
      expect(entry.certificateAvailable, `${entry.kind} ${entry.id}`).toBe(
        entry.kind === 'belt' && !entry.reversed,
      );
    }
    expect(before.body.timeline.some((e: any) => e.certificateAvailable)).toBe(true);
    expect(
      before.body.timeline
        .filter((e: any) => e.kind !== 'belt')
        .every((e: any) => e.certificateAvailable === false),
    ).toBe(true);

    // A reversed belt promotion loses the certificate: award Roxa, revoke it.
    const [ana] = await withPlatform(t.platformDb.db, (tx) =>
      tx.select({ id: students.id }).from(students).where(eq(students.fullName, 'Ana Aluna')),
    );
    const rules = await t.http().get('/v1/admin/graduation-rules').set(bearer(admin));
    const roxa = rules.body.rules.find((r: any) => r.name === 'Roxa');
    const award = await t
      .http()
      .post(`/v1/admin/students/${ana!.id}/graduations`)
      .set(bearer(admin))
      .send({ kind: 'belt', beltId: roxa.beltId });
    expect(award.status).toBe(201);
    expect(award.body.graduation.certificateAvailable).toBe(true);

    const revoke = await t
      .http()
      .post(`/v1/admin/graduations/${award.body.graduation.id}/revoke`)
      .set(bearer(admin))
      .send({ reason: 'Lançada por engano' });
    expect(revoke.status).toBe(200);

    const after = await t.http().get('/v1/aluno/graduation').set(bearer(aluno));
    const reversed = after.body.timeline.find((e: any) => e.id === award.body.graduation.id);
    expect(reversed.reversed).toBe(true);
    expect(reversed.certificateAvailable).toBe(false);
    // The original (non-reversed) belt entry keeps its certificate.
    const original = after.body.timeline.find((e: any) => e.kind === 'belt' && !e.reversed);
    expect(original.certificateAvailable).toBe(true);
  });
});
