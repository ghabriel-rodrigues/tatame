import type { ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import type { ClsService } from 'nestjs-cls';
import { describe, expect, it } from 'vitest';
import type { AuthContext } from '../auth-context.js';
import {
  ALLOW_SUSPENDED_KEY,
  ANY_ROLE_KEY,
  BYPASS_READ_ONLY_KEY,
  PUBLIC_KEY,
  ROLES_KEY,
} from '../decorators.js';
import { ErrorCodes, ProblemException } from '../problem.js';
import type { AcademyStatusService } from '../../modules/identity/services/academy-status.service.js';
import { AcademyStatusGuard } from './academy-status.guard.js';
import { RolesGuard } from './roles.guard.js';

function fakeReflector(metadata: Record<string, unknown>): Reflector {
  return {
    getAllAndOverride: (key: string) => metadata[key],
  } as unknown as Reflector;
}

function fakeCls(ctx: Partial<AuthContext> | undefined): ClsService {
  return { get: () => ctx } as unknown as ClsService;
}

function fakeContext(method = 'GET'): ExecutionContext {
  return {
    getHandler: () => function handler() {},
    getClass: () => class Controller {},
    switchToHttp: () => ({ getRequest: () => ({ method }) }),
  } as unknown as ExecutionContext;
}

function expectProblem(fn: () => unknown, status: number, code: string): void {
  try {
    fn();
    expect.unreachable('expected a ProblemException');
  } catch (error) {
    expect(error).toBeInstanceOf(ProblemException);
    expect((error as ProblemException).getStatus()).toBe(status);
    expect((error as ProblemException).code).toBe(code);
  }
}

describe('RolesGuard (default deny)', () => {
  const ctx: Partial<AuthContext> = { role: 'professor' };

  it('rejects a non-public route with NO authz metadata', () => {
    const guard = new RolesGuard(fakeReflector({}), fakeCls(ctx));
    expectProblem(
      () => guard.canActivate(fakeContext()),
      403,
      ErrorCodes.AUTHZ_FORBIDDEN_ROLE,
    );
  });

  it('passes @Public routes without a context', () => {
    const guard = new RolesGuard(
      fakeReflector({ [PUBLIC_KEY]: true }),
      fakeCls(undefined),
    );
    expect(guard.canActivate(fakeContext())).toBe(true);
  });

  it('passes @AnyRole for any authenticated role', () => {
    const guard = new RolesGuard(
      fakeReflector({ [ANY_ROLE_KEY]: true }),
      fakeCls(ctx),
    );
    expect(guard.canActivate(fakeContext())).toBe(true);
  });

  it('never unions roles: active role must be in the allow-list', () => {
    const allowAdmin = fakeReflector({ [ROLES_KEY]: ['admin'] });
    const guard = new RolesGuard(allowAdmin, fakeCls(ctx));
    expectProblem(
      () => guard.canActivate(fakeContext()),
      403,
      ErrorCodes.AUTHZ_FORBIDDEN_ROLE,
    );

    const allowProfessor = fakeReflector({
      [ROLES_KEY]: ['professor', 'admin'],
    });
    expect(
      new RolesGuard(allowProfessor, fakeCls(ctx)).canActivate(fakeContext()),
    ).toBe(true);
  });
});

describe('AcademyStatusGuard', () => {
  const tenantCtx: Partial<AuthContext> = {
    tenantId: 'tenant-1',
    role: 'admin',
  };

  function makeGuard(status: string | null, metadata: Record<string, unknown>) {
    const statuses = {
      getStatus: async () => status,
    } as unknown as AcademyStatusService;
    return new AcademyStatusGuard(
      fakeReflector(metadata),
      fakeCls(tenantCtx),
      statuses,
    );
  }

  it('skips platform tokens (no tenant)', async () => {
    const statuses = {
      getStatus: async () => {
        throw new Error('must not be called');
      },
    } as unknown as AcademyStatusService;
    const guard = new AcademyStatusGuard(
      fakeReflector({}),
      fakeCls({ tenantId: null, role: 'owner' }),
      statuses,
    );
    await expect(guard.canActivate(fakeContext('POST'))).resolves.toBe(true);
  });

  it('active/trial pass untouched', async () => {
    await expect(
      makeGuard('active', {}).canActivate(fakeContext('POST')),
    ).resolves.toBe(true);
    await expect(
      makeGuard('trial', {}).canActivate(fakeContext('POST')),
    ).resolves.toBe(true);
  });

  it('suspended rejects everything except @AllowSuspended routes', async () => {
    await expect(
      makeGuard('suspended', {}).canActivate(fakeContext('GET')),
    ).rejects.toMatchObject({ code: ErrorCodes.TENANT_SUSPENDED });
    await expect(
      makeGuard('suspended', { [ALLOW_SUSPENDED_KEY]: true }).canActivate(
        fakeContext('GET'),
      ),
    ).resolves.toBe(true);
  });

  it('delinquent allows reads, rejects mutations with tenant.read_only', async () => {
    await expect(
      makeGuard('delinquent', {}).canActivate(fakeContext('GET')),
    ).resolves.toBe(true);
    await expect(
      makeGuard('delinquent', {}).canActivate(fakeContext('PUT')),
    ).rejects.toMatchObject({ code: ErrorCodes.TENANT_READ_ONLY });
  });

  it('delinquent mutation passes with @BypassReadOnly (payment routes)', async () => {
    await expect(
      makeGuard('delinquent', { [BYPASS_READ_ONLY_KEY]: true }).canActivate(
        fakeContext('POST'),
      ),
    ).resolves.toBe(true);
  });
});
