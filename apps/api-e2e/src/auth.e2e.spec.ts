import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { bearer, createTestApp, DEV_PASSWORD, type TestApp } from './support/test-app.js';

describe('auth: login, session, refresh rotation, switch, logout', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('rejects invalid credentials with the same 401 code for wrong password and unknown email', async () => {
    const wrongPassword = await t
      .http()
      .post('/v1/auth/login')
      .send({ email: 'aluno@tatame.dev', password: 'not-the-password' });
    expect(wrongPassword.status).toBe(401);
    expect(wrongPassword.body.code).toBe('auth.invalid_credentials');
    expect(wrongPassword.headers['content-type']).toContain('application/problem+json');

    const unknownEmail = await t
      .http()
      .post('/v1/auth/login')
      .send({ email: 'ghost@tatame.dev', password: DEV_PASSWORD });
    expect(unknownEmail.status).toBe(401);
    expect(unknownEmail.body.code).toBe('auth.invalid_credentials');
  });

  it('answers 422 problem+json with field errors on invalid payloads', async () => {
    const res = await t.http().post('/v1/auth/login').send({ email: 'not-an-email' });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('validation.failed');
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' })]),
    );
  });

  it('logs in a single-membership user with body transport and boots /me', async () => {
    const body = await t.login('aluno@tatame.dev');
    expect(body.accessToken).toBeTruthy();
    expect(body.refreshToken).toBeTruthy();
    expect(body.memberships).toHaveLength(1);
    expect(body.activeMembershipId).toBe(body.memberships[0].id);

    const me = await t.http().get('/v1/auth/me').set(bearer(body.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe('aluno@tatame.dev');
    expect(me.body.activeRole).toBe('student');
    expect(me.body.academy.name).toBe('Alpha Jiu-Jitsu');
    expect(me.body.permissions['checkin.self']).toBe(true);
    expect(me.body.impersonation.isImpersonated).toBe(false);
  });

  it('uses the httpOnly path-scoped cookie transport by default (web)', async () => {
    const agent = request.agent(t.app.getHttpServer());
    const res = await agent
      .post('/v1/auth/login')
      .send({ email: 'aluno@tatame.dev', password: DEV_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.refreshToken).toBeUndefined();
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
      c.startsWith('tatame_refresh='),
    );
    expect(cookie).toBeTruthy();
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Path=/v1/auth');
    expect(cookie).toContain('SameSite=Strict');

    // Refresh straight off the cookie jar — no body token needed.
    const refreshed = await agent.post('/v1/auth/refresh').send({});
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toBeTruthy();
    expect(refreshed.body.refreshToken).toBeUndefined();
  });

  it('rotates refresh tokens and revokes the whole family on reuse', async () => {
    const login = await t.login('professor@tatame.dev');

    const first = await t
      .http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: login.refreshToken, transport: 'body' });
    expect(first.status).toBe(200);
    expect(first.body.refreshToken).toBeTruthy();
    expect(first.body.refreshToken).not.toBe(login.refreshToken);

    // Presenting the consumed token is a theft signal.
    const reuse = await t
      .http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: login.refreshToken, transport: 'body' });
    expect(reuse.status).toBe(401);
    expect(reuse.body.code).toBe('auth.refresh_reused');

    // The whole session (including the fresh token) is dead.
    const afterReuse = await t
      .http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: first.body.refreshToken, transport: 'body' });
    expect(afterReuse.status).toBe(401);
    expect(afterReuse.body.code).toBe('auth.token_expired');
  });

  it('lists all memberships for a multi-persona user and switches without re-login', async () => {
    const body = await t.login('multi@tatame.dev');
    expect(body.memberships).toHaveLength(2);
    const professorAlpha = body.memberships.find((m: any) => m.role === 'professor');
    const adminBravo = body.memberships.find((m: any) => m.role === 'admin');
    expect(professorAlpha.academySlug).toBe('alpha-jj');
    expect(adminBravo.academySlug).toBe('bravo-bjj');

    const switched = await t
      .http()
      .post('/v1/auth/switch')
      .set(bearer(body.accessToken))
      .send({ membershipId: adminBravo.id });
    expect(switched.status).toBe(200);
    expect(switched.body.activeMembershipId).toBe(adminBravo.id);

    const me = await t.http().get('/v1/auth/me').set(bearer(switched.body.accessToken));
    expect(me.body.activeRole).toBe('admin');
    expect(me.body.academy.slug).toBe('bravo-bjj');

    // Story 11: the most recently used membership wins at the next login.
    const secondLogin = await t.login('multi@tatame.dev');
    expect(secondLogin.activeMembershipId).toBe(adminBravo.id);
  });

  it('rejects switching to a membership the account does not own', async () => {
    const multi = await t.login('multi@tatame.dev');
    const foreign = await t.login('aluno@tatame.dev');
    const res = await t
      .http()
      .post('/v1/auth/switch')
      .set(bearer(multi.accessToken))
      .send({ membershipId: foreign.memberships[0].id });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('authz.forbidden_role');
  });

  it('defaults platform staff to the platform membership', async () => {
    const owner = await t.login('owner@tatame.dev');
    expect(owner.memberships).toHaveLength(1);
    expect(owner.memberships[0].type).toBe('platform');
    const me = await t.http().get('/v1/auth/me').set(bearer(owner.accessToken));
    expect(me.body.activeRole).toBe('owner');
    expect(me.body.academy).toBeNull();
  });

  it('logout revokes the session server-side (refresh family dead)', async () => {
    const body = await t.login('aluno@tatame.dev');
    const logout = await t.http().post('/v1/auth/logout').set(bearer(body.accessToken));
    expect(logout.status).toBe(204);

    const refresh = await t
      .http()
      .post('/v1/auth/refresh')
      .send({ refreshToken: body.refreshToken, transport: 'body' });
    expect(refresh.status).toBe(401);
    expect(refresh.body.code).toBe('auth.token_expired');
  });

  it('logout-all revokes every session of the account', async () => {
    const one = await t.login('responsavel@tatame.dev');
    const two = await t.login('responsavel@tatame.dev');

    const res = await t.http().post('/v1/auth/logout-all').set(bearer(two.accessToken));
    expect(res.status).toBe(204);

    for (const session of [one, two]) {
      const refresh = await t
        .http()
        .post('/v1/auth/refresh')
        .send({ refreshToken: session.refreshToken, transport: 'body' });
      expect(refresh.status).toBe(401);
    }
  });

  it('rejects missing/garbage bearer tokens with stable codes', async () => {
    const missing = await t.http().get('/v1/auth/me');
    expect(missing.status).toBe(401);
    expect(missing.body.code).toBe('auth.unauthenticated');

    const garbage = await t.http().get('/v1/auth/me').set(bearer('not-a-jwt'));
    expect(garbage.status).toBe(401);
    expect(garbage.body.code).toBe('auth.token_expired');
  });
});
