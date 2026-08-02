import { createHash } from 'node:crypto';
import { invites, withPlatform } from '@tatame/db';
import { eq } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, DEV_PASSWORD, type TestApp } from './support/test-app.js';

describe('invite flows (the only signup) + password reset', () => {
  let t: TestApp;
  let professorToken: string;

  async function createInvite(kind: 'student' | 'guardian', maxUses?: number): Promise<string> {
    const res = await t
      .http()
      .post('/v1/invites')
      .set(bearer(professorToken))
      .send({ kind, ...(maxUses ? { maxUses } : {}) });
    expect(res.status).toBe(201);
    return res.body.token as string;
  }

  beforeAll(async () => {
    t = await createTestApp();
    professorToken = (await t.login('professor@tatame.dev')).accessToken;
  });

  afterAll(async () => {
    await t.close();
  });

  it('landing exposes academy branding + inherited bindings for a valid token', async () => {
    const token = await createInvite('student');
    const res = await t.http().get(`/v1/public/invites/${token}`);
    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('student');
    expect(res.body.academy.name).toBe('Alpha Jiu-Jitsu');
    expect(res.body.academy.theme).toBeTruthy();
  });

  it('landing fails honestly for unknown, expired and revoked tokens', async () => {
    const unknown = await t.http().get('/v1/public/invites/definitely-not-a-token');
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('invite.invalid_or_expired');

    const sha256 = (raw: string) => createHash('sha256').update(raw).digest('hex');

    const expiredToken = await createInvite('student');
    await withPlatform(t.platformDb.db, (tx) =>
      tx
        .update(invites)
        .set({ expiresAt: new Date(Date.now() - 1000) })
        .where(eq(invites.tokenHash, sha256(expiredToken))),
    );
    const expired = await t.http().get(`/v1/public/invites/${expiredToken}`);
    expect(expired.status).toBe(410);
    expect(expired.body.code).toBe('invite.invalid_or_expired');

    const revokedToken = await createInvite('student');
    await withPlatform(t.platformDb.db, (tx) =>
      tx
        .update(invites)
        .set({ revokedAt: new Date() })
        .where(eq(invites.tokenHash, sha256(revokedToken))),
    );
    const revoked = await t.http().get(`/v1/public/invites/${revokedToken}`);
    expect(revoked.status).toBe(410);
  });

  it('accepts an adult student invite atomically and ends logged in', async () => {
    const token = await createInvite('student');
    const res = await t.http().post(`/v1/public/invites/${token}/accept`).send({
      email: 'novo.aluno@example.com',
      password: 'SenhaForte!123',
      fullName: 'Novo Aluno',
      birthDate: '1999-05-05',
    });
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy();
    expect(res.body.memberships).toHaveLength(1);
    expect(res.body.memberships[0].role).toBe('student');

    const me = await t.http().get('/v1/auth/me').set(bearer(res.body.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('novo.aluno@example.com');

    // And the account is a real login from now on.
    const login = await t
      .http()
      .post('/v1/auth/login')
      .send({ email: 'novo.aluno@example.com', password: 'SenhaForte!123', transport: 'body' });
    expect(login.status).toBe(200);
  });

  it('refuses a minor on a student invite (minor always linked to a guardian)', async () => {
    const token = await createInvite('student');
    const res = await t.http().post(`/v1/public/invites/${token}/accept`).send({
      email: 'crianca@example.com',
      password: 'SenhaForte!123',
      fullName: 'Criança Sem Responsável',
      birthDate: '2015-01-01',
    });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('invite.minor_requires_guardian');
  });

  it('registers a guardian with dependents through the responsável variant', async () => {
    const token = await createInvite('guardian');
    const res = await t
      .http()
      .post(`/v1/public/invites/${token}/accept`)
      .send({
        email: 'nova.responsavel@example.com',
        password: 'SenhaForte!123',
        fullName: 'Nova Responsável',
        birthDate: '1988-03-03',
        dependents: [{ fullName: 'Filho Um', birthDate: '2014-06-06' }],
      });
    expect(res.status).toBe(201);
    expect(res.body.memberships[0].role).toBe('guardian');
  });

  it('answers 409 invite.email_exists for an existing account on the public accept', async () => {
    const token = await createInvite('guardian');
    const res = await t.http().post(`/v1/public/invites/${token}/accept`).send({
      email: 'aluno@tatame.dev',
      password: 'SenhaForte!123',
      fullName: 'Ana Aluna',
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('invite.email_exists');

    // BOSS ruling: the existing user logs in and accepts, attaching a NEW
    // membership to the same account.
    const aluno = await t.login('aluno@tatame.dev');
    const attach = await t
      .http()
      .post(`/v1/invites/${token}/accept`)
      .set(bearer(aluno.accessToken));
    expect(attach.status).toBe(201);
    expect(attach.body.role).toBe('guardian');
    expect(attach.body.membershipId).toBeTruthy();

    const me = await t.http().get('/v1/auth/me').set(bearer(aluno.accessToken));
    expect(me.body.memberships).toHaveLength(2);
    expect(me.body.memberships.map((m: any) => m.role).sort()).toEqual(['guardian', 'student']);

    // Accepting the same invite again is a conflict, not a duplicate row.
    const again = await t
      .http()
      .post(`/v1/invites/${token}/accept`)
      .set(bearer(aluno.accessToken));
    expect(again.status).toBe(409);
    expect(again.body.code).toBe('invite.already_member');
  });

  it('exhausts max_uses invites', async () => {
    const token = await createInvite('student', 1);
    const first = await t.http().post(`/v1/public/invites/${token}/accept`).send({
      email: 'unico.uso@example.com',
      password: 'SenhaForte!123',
      fullName: 'Único Uso',
      birthDate: '1990-01-01',
    });
    expect(first.status).toBe(201);

    const second = await t.http().post(`/v1/public/invites/${token}/accept`).send({
      email: 'tarde.demais@example.com',
      password: 'SenhaForte!123',
      fullName: 'Tarde Demais',
      birthDate: '1990-01-01',
    });
    expect(second.status).toBe(410);
    expect(second.body.code).toBe('invite.invalid_or_expired');
  });

  it('forgot-password always answers 202 and never leaks account existence', async () => {
    const unknown = await t.http().post('/v1/auth/password/forgot').send({ email: 'ghost@x.dev' });
    expect(unknown.status).toBe(202);
    expect(t.sentEmails).toHaveLength(0);

    const known = await t
      .http()
      .post('/v1/auth/password/forgot')
      .send({ email: 'responsavel@tatame.dev' });
    expect(known.status).toBe(202);
    expect(t.sentEmails).toHaveLength(1);
    expect(t.sentEmails[0].to).toBe('responsavel@tatame.dev');
    expect(t.sentEmails[0].deepLink).toContain('tatame://reset?token=');
  });

  it('reset is single-use, changes the password and revokes every session', async () => {
    const session = await t.login('responsavel@tatame.dev');
    await t.http().post('/v1/auth/password/forgot').send({ email: 'responsavel@tatame.dev' });
    const resetUrl = new URL(t.sentEmails[t.sentEmails.length - 1].resetUrl);
    const rawToken = resetUrl.searchParams.get('token') as string;
    expect(rawToken).toBeTruthy();

    const reset = await t
      .http()
      .post('/v1/auth/password/reset')
      .send({ token: rawToken, newPassword: 'NovaSenha!456' });
    expect(reset.status).toBe(204);

    // All sessions revoked — the old refresh token is dead.
    const refresh = await t
      .http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: session.refreshToken, transport: 'body' });
    expect(refresh.status).toBe(401);

    // Old password out, new password in.
    const oldLogin = await t
      .http()
      .post('/v1/auth/login')
      .send({ email: 'responsavel@tatame.dev', password: DEV_PASSWORD });
    expect(oldLogin.status).toBe(401);
    const newLogin = await t
      .http()
      .post('/v1/auth/login')
      .send({ email: 'responsavel@tatame.dev', password: 'NovaSenha!456', transport: 'body' });
    expect(newLogin.status).toBe(200);

    // Single use: the same token cannot reset twice.
    const replay = await t
      .http()
      .post('/v1/auth/password/reset')
      .send({ token: rawToken, newPassword: 'Outra!789xyz' });
    expect(replay.status).toBe(400);
    expect(replay.body.code).toBe('reset.invalid_or_expired');
  });
});
