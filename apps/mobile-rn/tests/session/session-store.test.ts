/**
 * Session store (AUTH.18): cold-start silent refresh, refresh rejection vs
 * network failure, single-flight 401 through the shared client in the RN
 * runtime, logout wipe (revoke + secure-store + queryClient.clear()), and
 * the AUTH.19 gate/read-only derivations.
 */

import * as SecureStore from 'expo-secure-store';
import { apiClient, queryClient } from '../../src/session/api';
import {
  boot,
  isReadOnly,
  isSuspended,
  logout,
  resolveGate,
  sessionTestApi,
  type SessionState,
} from '../../src/session/session-store';
import { getAccessToken } from '../../src/session/token';
import { setRefreshToken } from '../../src/session/token-store';
import {
  installFetchMock,
  json,
  makeMe,
  makeMembership,
  problem,
} from '../helpers/session';

const secure = SecureStore as unknown as {
  __store: Map<string, string>;
  __reset: () => void;
};

describe('session-store', () => {
  beforeEach(() => {
    secure.__reset();
    sessionTestApi.reset();
    queryClient.clear();
    jest.clearAllMocks();
  });

  it('boot without a stored token lands anon without network calls', async () => {
    const fetchMock = installFetchMock(() => null);
    const state = await boot();
    expect(state.status).toBe('anon');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('boot silently refreshes, rotates the stored token and bootstraps /me', async () => {
    await setRefreshToken('rt-1');
    const me = makeMe();
    const seen: string[] = [];
    installFetchMock(({ method, path, body, authorization }) => {
      seen.push(`${method} ${path}`);
      if (method === 'POST' && path === '/v1/auth/refresh') {
        expect(body).toEqual({ transport: 'body', refreshToken: 'rt-1' });
        return json(200, {
          accessToken: 'at-1',
          accessExpiresIn: 900,
          refreshToken: 'rt-2',
        });
      }
      if (method === 'GET' && path === '/v1/auth/me') {
        expect(authorization).toBe('Bearer at-1');
        return json(200, me);
      }
      return null;
    });

    const state = await boot();
    expect(state.status).toBe('authed');
    expect(state.session?.user.fullName).toBe('Lucas Almeida');
    expect(secure.__store.get('tatame.refreshToken')).toBe('rt-2');
    expect(getAccessToken()).toBe('at-1');
    expect(seen).toEqual(['POST /v1/auth/refresh', 'GET /v1/auth/me']);
  });

  it('a rejected refresh (revoked session) clears the stored token', async () => {
    await setRefreshToken('rt-dead');
    installFetchMock(({ path }) =>
      path === '/v1/auth/refresh' ? problem(401, 'auth.token_expired') : null,
    );
    const state = await boot();
    expect(state.status).toBe('anon');
    expect(secure.__store.size).toBe(0);
  });

  it('a network failure at boot keeps the stored token (offline is not revocation)', async () => {
    await setRefreshToken('rt-1');
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    const state = await boot();
    expect(state.status).toBe('anon');
    expect(secure.__store.get('tatame.refreshToken')).toBe('rt-1');
  });

  it('single-flights concurrent 401s: one refresh, both requests replayed', async () => {
    sessionTestApi.seed({ status: 'authed', session: makeMe() }, 'at-stale');
    await setRefreshToken('rt-1');
    let refreshCalls = 0;
    const me = makeMe();
    installFetchMock(({ method, path, authorization }) => {
      if (method === 'POST' && path === '/v1/auth/refresh') {
        refreshCalls += 1;
        return json(200, {
          accessToken: 'at-new',
          accessExpiresIn: 900,
          refreshToken: 'rt-2',
        });
      }
      if (method === 'GET' && path === '/v1/auth/me') {
        if (authorization !== 'Bearer at-new')
          return problem(401, 'auth.token_expired');
        return json(200, me);
      }
      return null;
    });

    const [a, b] = await Promise.all([
      apiClient.GET('/v1/auth/me'),
      apiClient.GET('/v1/auth/me'),
    ]);
    expect(refreshCalls).toBe(1);
    expect(a.data).toBeTruthy();
    expect(b.data).toBeTruthy();
    expect(secure.__store.get('tatame.refreshToken')).toBe('rt-2');
  });

  it('logout revokes server-side and wipes everything locally', async () => {
    sessionTestApi.seed({ status: 'authed', session: makeMe() });
    await setRefreshToken('rt-1');
    const clearSpy = jest.spyOn(queryClient, 'clear');
    let revoked = false;
    installFetchMock(({ method, path }) => {
      if (method === 'POST' && path === '/v1/auth/logout') {
        revoked = true;
        return json(200, { ok: true });
      }
      return null;
    });

    await logout();
    expect(revoked).toBe(true);
    expect(secure.__store.size).toBe(0);
    expect(getAccessToken()).toBeNull();
    expect(clearSpy).toHaveBeenCalled();
    expect(resolveGate({ status: 'anon', session: null })).toBe('login');
  });

  it('logout completes locally even when the revoke call fails', async () => {
    sessionTestApi.seed({ status: 'authed', session: makeMe() });
    await setRefreshToken('rt-1');
    globalThis.fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;

    await logout();
    expect(secure.__store.size).toBe(0);
    expect(getAccessToken()).toBeNull();
  });

  describe('gate + status derivations (AUTH.19)', () => {
    const authed = (
      state: Partial<Parameters<typeof makeMe>[0]>,
    ): SessionState => ({
      status: 'authed',
      session: makeMe(state),
    });

    it.each([
      ['student', 'aluno'],
      ['professor', 'professor'],
      ['guardian', 'responsavel'],
    ] as const)('%s routes to the %s shell', (role, gate) => {
      expect(resolveGate(authed({ role }))).toBe(gate);
    });

    it.each(['admin', 'owner', 'support', 'finance'] as const)(
      '%s is a web-only persona (console-only)',
      (role) => {
        const memberships = [
          role === 'admin'
            ? makeMembership({ role })
            : makeMembership({
                role,
                type: 'platform',
                tenantId: null,
                academyName: null,
              }),
        ];
        expect(resolveGate(authed({ role, memberships }))).toBe('console-only');
      },
    );

    it('suspended academy blocks every role behind the suspended screen', () => {
      const state = authed({ role: 'student', academyStatus: 'suspended' });
      expect(isSuspended(state.session)).toBe(true);
      expect(resolveGate(state)).toBe('suspended');
    });

    it('delinquent academy sets the read-only flag but keeps the shell', () => {
      const state = authed({ role: 'student', academyStatus: 'delinquent' });
      expect(isReadOnly(state.session)).toBe(true);
      expect(resolveGate(state)).toBe('aluno');
    });

    it('anon and booting resolve to login', () => {
      expect(resolveGate({ status: 'anon', session: null })).toBe('login');
      expect(resolveGate({ status: 'booting', session: null })).toBe('login');
    });
  });
});
