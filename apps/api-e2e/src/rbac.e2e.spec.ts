import 'reflect-metadata';
import { ModulesContainer } from '@nestjs/core';
import { ANY_ROLE_KEY, PUBLIC_KEY, ROLES_KEY } from '@org/api';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bearer, createTestApp, type TestApp } from './support/test-app.js';

describe('rbac: guard chain layers + route-metadata meta-test', () => {
  let t: TestApp;

  beforeAll(async () => {
    t = await createTestApp();
  });

  afterAll(async () => {
    await t.close();
  });

  it('professor cannot reach any admin surface (RolesGuard)', async () => {
    const professor = await t.login('professor@tatame.dev');
    for (const [method, path] of [
      ['get', '/v1/admin/permissions'],
      ['put', '/v1/admin/permissions'],
    ] as const) {
      const res = await (t.http() as any)
        [method](path)
        .set(bearer(professor.accessToken))
        .send({});
      expect(res.status, `${method} ${path}`).toBe(403);
      expect(res.body.code).toBe('authz.forbidden_role');
    }
  });

  it('student and guardian cannot create invites (RolesGuard)', async () => {
    for (const email of ['aluno@tatame.dev', 'responsavel@tatame.dev']) {
      const session = await t.login(email);
      const res = await t
        .http()
        .post('/v1/invites')
        .set(bearer(session.accessToken))
        .send({ kind: 'student' });
      expect(res.status, email).toBe(403);
      expect(res.body.code).toBe('authz.forbidden_role');
    }
  });

  it('platform roles cannot reach academy admin surfaces (single active role)', async () => {
    const owner = await t.login('owner@tatame.dev');
    const res = await t
      .http()
      .get('/v1/admin/permissions')
      .set(bearer(owner.accessToken));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('authz.forbidden_role');
  });

  it('admin manages the toggle matrix; disabling a toggle blocks the professor with its own code', async () => {
    const admin = await t.login('admin@tatame.dev');
    const professor = await t.login('professor@tatame.dev');

    const matrix = await t
      .http()
      .get('/v1/admin/permissions')
      .set(bearer(admin.accessToken));
    expect(matrix.status).toBe(200);
    const inviteToggle = matrix.body.permissions.find(
      (p: any) => p.role === 'professor' && p.key === 'invites.create',
    );
    expect(inviteToggle.allowed).toBe(true); // seeded on

    // Toggle enabled: professor can create invites.
    const allowed = await t
      .http()
      .post('/v1/invites')
      .set(bearer(professor.accessToken))
      .send({ kind: 'student' });
    expect(allowed.status).toBe(201);
    expect(allowed.body.token).toBeTruthy();

    // Admin turns it off.
    const update = await t
      .http()
      .put('/v1/admin/permissions')
      .set(bearer(admin.accessToken))
      .send({
        entries: [{ role: 'professor', key: 'invites.create', allowed: false }],
      });
    expect(update.status).toBe(200);

    const denied = await t
      .http()
      .post('/v1/invites')
      .set(bearer(professor.accessToken))
      .send({ kind: 'student' });
    expect(denied.status).toBe(403);
    expect(denied.body.code).toBe('authz.permission_disabled');

    // Back on — configuration applies without token re-issue.
    await t
      .http()
      .put('/v1/admin/permissions')
      .set(bearer(admin.accessToken))
      .send({
        entries: [{ role: 'professor', key: 'invites.create', allowed: true }],
      });
    const restored = await t
      .http()
      .post('/v1/invites')
      .set(bearer(professor.accessToken))
      .send({ kind: 'student' });
    expect(restored.status).toBe(201);
  });

  it('rejects unknown toggle keys (hard rules cannot be enabled via toggles)', async () => {
    const admin = await t.login('admin@tatame.dev');
    const res = await t
      .http()
      .put('/v1/admin/permissions')
      .set(bearer(admin.accessToken))
      .send({
        entries: [
          { role: 'professor', key: 'billing.full_access', allowed: true },
        ],
      });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('validation.failed');
  });

  it('admin of academy A cannot manage academy B (tenant from token, not input)', async () => {
    const bravoAdmin = await t.login('admin.bravo@tatame.dev');
    const matrix = await t
      .http()
      .get('/v1/admin/permissions')
      .set(bearer(bravoAdmin.accessToken));
    expect(matrix.status).toBe(200);
    // Alpha seeded professor/events.create=true; Bravo also seeds it — flip
    // Bravo's and verify Alpha is untouched (tenant isolation through RLS).
    await t
      .http()
      .put('/v1/admin/permissions')
      .set(bearer(bravoAdmin.accessToken))
      .send({
        entries: [{ role: 'professor', key: 'events.create', allowed: false }],
      });

    const alphaAdmin = await t.login('admin@tatame.dev');
    const alphaMatrix = await t
      .http()
      .get('/v1/admin/permissions')
      .set(bearer(alphaAdmin.accessToken));
    const alphaEvents = alphaMatrix.body.permissions.find(
      (p: any) => p.role === 'professor' && p.key === 'events.create',
    );
    expect(alphaEvents.allowed).toBe(true);
  });

  it('serves the OpenAPI document at runtime with the bearer scheme', async () => {
    const res = await t.http().get('/docs-json');
    expect(res.status).toBe(200);
    expect(res.body.openapi).toMatch(/^3\./);
    expect(res.body.components.securitySchemes.bearer).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
    expect(Object.keys(res.body.paths)).toEqual(
      expect.arrayContaining([
        '/v1/auth/login',
        '/v1/auth/refresh',
        '/v1/auth/me',
        '/v1/public/invites/{token}',
        '/v1/public/invites/{token}/accept',
        '/v1/invites/{token}/accept',
        '/v1/admin/permissions',
        '/v1/platform/academies/{id}/impersonate',
      ]),
    );
  });

  it('META: every registered route is @Public or carries an explicit role stance', () => {
    const modulesContainer = t.app.get(ModulesContainer, { strict: false });
    const offenders: string[] = [];
    let routeCount = 0;

    for (const module of modulesContainer.values()) {
      for (const wrapper of module.controllers.values()) {
        const metatype = wrapper.metatype as (new () => unknown) | undefined;
        if (!metatype) continue;
        const prototype = metatype.prototype as Record<string, unknown>;
        for (const name of Object.getOwnPropertyNames(prototype)) {
          if (name === 'constructor') continue;
          const handler = prototype[name];
          if (typeof handler !== 'function') continue;
          // A route handler carries Nest's path+method metadata.
          const path = Reflect.getMetadata('path', handler);
          const method = Reflect.getMetadata('method', handler);
          if (path === undefined || method === undefined) continue;
          routeCount += 1;

          const isPublic =
            Reflect.getMetadata(PUBLIC_KEY, handler) ??
            Reflect.getMetadata(PUBLIC_KEY, metatype);
          const anyRole =
            Reflect.getMetadata(ANY_ROLE_KEY, handler) ??
            Reflect.getMetadata(ANY_ROLE_KEY, metatype);
          const roles =
            Reflect.getMetadata(ROLES_KEY, handler) ??
            Reflect.getMetadata(ROLES_KEY, metatype);

          const hasStance =
            isPublic === true ||
            anyRole === true ||
            (Array.isArray(roles) && roles.length > 0);
          if (!hasStance) offenders.push(`${metatype.name}.${name} (${path})`);
        }
      }
    }

    expect(routeCount).toBeGreaterThanOrEqual(17); // the identity surface
    expect(
      offenders,
      `routes without an authz stance: ${offenders.join(', ')}`,
    ).toEqual([]);
  });
});
