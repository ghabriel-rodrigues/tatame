import {
  auditLogs,
  credentials,
  platformUsers,
  sessions,
  users,
  withPlatform,
} from '@tatame/db';
import { hashDevPassword } from '@tatame/db/testing';
import { and, eq, isNotNull } from 'drizzle-orm';
import { authenticator } from 'otplib';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, DEV_PASSWORD, type TestApp } from './support/test-app.js';

describe('impersonation (entrar como admin) + platform TOTP', () => {
  let t: TestApp;
  let alphaId: string;

  beforeAll(async () => {
    t = await createTestApp();
    alphaId = await t.academyIdBySlug('alpha-jj');

    // Seed a finance platform user (dev fixtures cover owner + support only).
    const secretHash = await hashDevPassword(DEV_PASSWORD);
    await withPlatform(t.platformDb.db, async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({ email: 'finance@tatame.dev', fullName: 'Fin Financeiro' })
        .returning({ id: users.id });
      await tx.insert(credentials).values({ userId: user!.id, secretHash });
      await tx.insert(platformUsers).values({ userId: user!.id, role: 'finance' });
    });
  });

  afterAll(async () => {
    await t.close();
  });

  it('owner mints an audited, 1-hour, actor-claimed admin session', async () => {
    const owner = await t.login('owner@tatame.dev');
    const res = await t
      .http()
      .post(`/v1/platform/academies/${alphaId}/impersonate`)
      .set(bearer(owner.accessToken));
    expect(res.status).toBe(201);
    expect(res.body.accessToken).toBeTruthy();
    expect(res.body.refreshToken).toBeTruthy(); // body always — platform cookie untouched
    expect(res.body.academy.slug).toBe('alpha-jj');

    // Audit row for the session start.
    const audit = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.tenantId, alphaId), eq(auditLogs.action, 'impersonation.started'))),
    );
    expect(audit.length).toBeGreaterThanOrEqual(1);
    expect(audit[0]!.impersonatorUserId).toBeTruthy();

    // 1-hour absolute session cap.
    const impSessions = await withPlatform(t.platformDb.db, (tx) =>
      tx.select().from(sessions).where(isNotNull(sessions.impersonatorUserId)),
    );
    expect(impSessions).toHaveLength(1);
    const ttlMs = impSessions[0]!.expiresAt!.getTime() - Date.now();
    expect(ttlMs).toBeGreaterThan(55 * 60 * 1000);
    expect(ttlMs).toBeLessThanOrEqual(60 * 60 * 1000);

    // The impersonated session sees exactly what the admin sees.
    const me = await t.http().get('/v1/auth/me').set(bearer(res.body.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.activeRole).toBe('admin');
    expect(me.body.academy.id).toBe(alphaId);
    expect(me.body.impersonation.isImpersonated).toBe(true);
    expect(me.body.impersonation.impersonatorUserId).toBeTruthy();
  });

  it('audits every mutating action performed under impersonation', async () => {
    const owner = await t.login('owner@tatame.dev');
    const grant = await t
      .http()
      .post(`/v1/platform/academies/${alphaId}/impersonate`)
      .set(bearer(owner.accessToken));

    const mutation = await t
      .http()
      .put('/v1/admin/permissions')
      .set(bearer(grant.body.accessToken))
      .send({ entries: [{ role: 'professor', key: 'events.create', allowed: true }] });
    expect(mutation.status).toBe(200);

    const audit = await withPlatform(t.platformDb.db, (tx) =>
      tx
        .select()
        .from(auditLogs)
        .where(and(eq(auditLogs.tenantId, alphaId), eq(auditLogs.action, 'PUT /v1/admin/permissions'))),
    );
    expect(audit.length).toBeGreaterThanOrEqual(1);
    expect(audit[0]!.impersonatorUserId).toBeTruthy();
  });

  it('impersonated tokens are rejected on switch/TOTP/impersonate/logout-all', async () => {
    const owner = await t.login('owner@tatame.dev');
    const grant = await t
      .http()
      .post(`/v1/platform/academies/${alphaId}/impersonate`)
      .set(bearer(owner.accessToken));
    const impToken = grant.body.accessToken as string;

    const attempts: Array<[string, string, object?]> = [
      ['post', '/v1/auth/switch', { membershipId: '00000000-0000-7000-8000-000000000000' }],
      ['post', '/v1/auth/totp/setup'],
      ['post', '/v1/auth/totp/enable', { code: '123456' }],
      ['post', `/v1/platform/academies/${alphaId}/impersonate`],
      ['post', '/v1/auth/logout-all'],
    ];
    for (const [method, path, body] of attempts) {
      const res = await (t.http() as any)[method](path).set(bearer(impToken)).send(body ?? {});
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.code).toBe('authz.impersonation_restricted');
    }

    // Ending impersonation is a plain logout of the impersonated session.
    const logout = await t.http().post('/v1/auth/logout').set(bearer(impToken));
    expect(logout.status).toBe(204);

    // The platform session was never touched.
    const me = await t.http().get('/v1/auth/me').set(bearer(owner.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.activeRole).toBe('owner');
  });

  it('support can impersonate; finance cannot; unknown academy is a 404', async () => {
    const support = await t.login('suporte@tatame.dev');
    const ok = await t
      .http()
      .post(`/v1/platform/academies/${alphaId}/impersonate`)
      .set(bearer(support.accessToken));
    expect(ok.status).toBe(201);

    const finance = await t.login('finance@tatame.dev');
    const denied = await t
      .http()
      .post(`/v1/platform/academies/${alphaId}/impersonate`)
      .set(bearer(finance.accessToken));
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('authz.forbidden_role');

    const missing = await t
      .http()
      .post('/v1/platform/academies/00000000-0000-7000-8000-000000000000/impersonate')
      .set(bearer(support.accessToken));
    expect(missing.status).toBe(404);
  });

  it('academy admins cannot impersonate (platform surface only)', async () => {
    const admin = await t.login('admin@tatame.dev');
    const res = await t
      .http()
      .post(`/v1/platform/academies/${alphaId}/impersonate`)
      .set(bearer(admin.accessToken));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('authz.forbidden_role');
  });

  it('platform TOTP: setup → enable → login requires the code (recovery works once)', async () => {
    const support = await t.login('suporte@tatame.dev');

    const setup = await t.http().post('/v1/auth/totp/setup').set(bearer(support.accessToken));
    expect(setup.status).toBe(200);
    expect(setup.body.secret).toBeTruthy();
    expect(setup.body.otpauthUri).toContain('otpauth://totp/');
    const secret = setup.body.secret as string;

    const badEnable = await t
      .http()
      .post('/v1/auth/totp/enable')
      .set(bearer(support.accessToken))
      .send({ code: '000000' });
    expect(badEnable.status).toBe(400);
    expect(badEnable.body.code).toBe('auth.mfa_invalid_code');

    const enable = await t
      .http()
      .post('/v1/auth/totp/enable')
      .set(bearer(support.accessToken))
      .send({ code: authenticator.generate(secret) });
    expect(enable.status).toBe(200);
    expect(enable.body.recoveryCodes).toHaveLength(10);
    const recoveryCode = enable.body.recoveryCodes[0] as string;

    // Login now yields a challenge instead of tokens.
    const challenged = await t
      .http()
      .post('/v1/auth/login')
      .send({ email: 'suporte@tatame.dev', password: DEV_PASSWORD, transport: 'body' });
    expect(challenged.status).toBe(202);
    expect(challenged.body.mfaRequired).toBe(true);
    expect(challenged.body.accessToken).toBeUndefined();
    const challengeToken = challenged.body.challengeToken as string;

    const wrongCode = await t
      .http()
      .post('/v1/auth/login/totp')
      .send({ challengeToken, code: '999999', transport: 'body' });
    expect(wrongCode.status).toBe(401);
    expect(wrongCode.body.code).toBe('auth.mfa_invalid_code');

    const completed = await t
      .http()
      .post('/v1/auth/login/totp')
      .send({ challengeToken, code: authenticator.generate(secret), transport: 'body' });
    expect(completed.status).toBe(200);
    expect(completed.body.accessToken).toBeTruthy();

    // Recovery codes are single-use.
    const challenge2 = await t
      .http()
      .post('/v1/auth/login')
      .send({ email: 'suporte@tatame.dev', password: DEV_PASSWORD, transport: 'body' });
    const viaRecovery = await t
      .http()
      .post('/v1/auth/login/totp')
      .send({ challengeToken: challenge2.body.challengeToken, code: recoveryCode, transport: 'body' });
    expect(viaRecovery.status).toBe(200);

    const challenge3 = await t
      .http()
      .post('/v1/auth/login')
      .send({ email: 'suporte@tatame.dev', password: DEV_PASSWORD, transport: 'body' });
    const replayRecovery = await t
      .http()
      .post('/v1/auth/login/totp')
      .send({ challengeToken: challenge3.body.challengeToken, code: recoveryCode, transport: 'body' });
    expect(replayRecovery.status).toBe(401);
  });

  it('TOTP endpoints are platform-only (academy roles get 403)', async () => {
    const admin = await t.login('admin@tatame.dev');
    const res = await t.http().post('/v1/auth/totp/setup').set(bearer(admin.accessToken));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('authz.forbidden_role');
  });
});
