import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

describe('tenant status: suspension blocks, delinquency is read-only, reactivation is instant', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.setAcademyStatus('bravo-bjj', 'trial');
    await t.close();
  });

  it('suspended academy: everything 403 tenant.suspended except /me and logout', async () => {
    const admin = await t.login('admin.bravo@tatame.dev');
    await t.setAcademyStatus('bravo-bjj', 'suspended');

    const blockedRead = await t
      .http()
      .get('/v1/admin/permissions')
      .set(bearer(admin.accessToken));
    expect(blockedRead.status).toBe(403);
    expect(blockedRead.body.code).toBe('tenant.suspended');

    const blockedWrite = await t
      .http()
      .post('/v1/invites')
      .set(bearer(admin.accessToken))
      .send({ kind: 'student' });
    expect(blockedWrite.status).toBe(403);
    expect(blockedWrite.body.code).toBe('tenant.suspended');

    // Bootstrap keeps working so clients can render the blocking screen…
    const me = await t.http().get('/v1/auth/me').set(bearer(admin.accessToken));
    expect(me.status).toBe(200);
    expect(me.body.academy.status).toBe('suspended');

    // …and the user can still sign out.
    const logout = await t
      .http()
      .post('/v1/auth/logout')
      .set(bearer(admin.accessToken));
    expect(logout.status).toBe(204);
  });

  it('sessions survive suspension: reactivation restores access without re-login', async () => {
    await t.setAcademyStatus('bravo-bjj', 'trial');
    const admin = await t.login('admin.bravo@tatame.dev');

    await t.setAcademyStatus('bravo-bjj', 'suspended');
    const blocked = await t
      .http()
      .get('/v1/admin/permissions')
      .set(bearer(admin.accessToken));
    expect(blocked.status).toBe(403);

    await t.setAcademyStatus('bravo-bjj', 'active');
    const restored = await t
      .http()
      .get('/v1/admin/permissions')
      .set(bearer(admin.accessToken));
    expect(restored.status).toBe(200); // same token, no re-login
  });

  it('delinquent academy: reads pass, mutations 403 tenant.read_only', async () => {
    const admin = await t.login('admin.bravo@tatame.dev');
    await t.setAcademyStatus('bravo-bjj', 'delinquent');

    const read = await t
      .http()
      .get('/v1/admin/permissions')
      .set(bearer(admin.accessToken));
    expect(read.status).toBe(200);

    const write = await t
      .http()
      .put('/v1/admin/permissions')
      .set(bearer(admin.accessToken))
      .send({
        entries: [{ role: 'professor', key: 'events.create', allowed: false }],
      });
    expect(write.status).toBe(403);
    expect(write.body.code).toBe('tenant.read_only');

    const invite = await t
      .http()
      .post('/v1/invites')
      .set(bearer(admin.accessToken))
      .send({ kind: 'student' });
    expect(invite.status).toBe(403);
    expect(invite.body.code).toBe('tenant.read_only');

    // Auth flows are unaffected (public/@AllowSuspended surface).
    const me = await t.http().get('/v1/auth/me').set(bearer(admin.accessToken));
    expect(me.status).toBe(200);
  });

  it('status never leaks across tenants: alpha stays fully functional', async () => {
    await t.setAcademyStatus('bravo-bjj', 'suspended');
    const alphaAdmin = await t.login('admin@tatame.dev');
    const res = await t
      .http()
      .get('/v1/admin/permissions')
      .set(bearer(alphaAdmin.accessToken));
    expect(res.status).toBe(200);
  });
});
