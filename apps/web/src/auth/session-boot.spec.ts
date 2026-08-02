/**
 * Session boot (web-04): one silent cookie refresh before any guarded route
 * renders — success fills the session from /auth/me, failure lands anon.
 * MSW at the fetch layer: the real client + middleware run.
 */
import {
  HttpResponse,
  defaultHandlers,
  problemResponse,
  rawHttp as mswHttp,
} from '@tatame/shared/testing';
import { server } from '../test/setup';
import { boot, logout, useAuth } from './auth-store';
import { getAccessToken } from './token';
import { renderHook } from '@testing-library/react';

describe('session boot', () => {
  it('silent refresh success → authed with the bootstrap session', async () => {
    server.use(...defaultHandlers());

    const state = await boot();

    expect(state.status).toBe('authed');
    expect(state.session?.user.email).toBe('admin@tatame.dev');
    expect(getAccessToken()).toBe('test-access-token');

    const { result } = renderHook(() => useAuth());
    expect(result.current.status).toBe('authed');
  });

  it('silent refresh failure → anon (no session, no token)', async () => {
    server.use(
      mswHttp.post('http://localhost/v1/auth/refresh', () =>
        problemResponse(401, 'auth.token_expired'),
      ),
    );

    const state = await boot();

    expect(state.status).toBe('anon');
    expect(state.session).toBeNull();
    expect(getAccessToken()).toBeNull();
  });

  it('refresh ok but bootstrap failure → anon (fails closed)', async () => {
    server.use(
      // Overrides precede defaults — msw matches in registration order.
      mswHttp.get('http://localhost/v1/auth/me', () =>
        problemResponse(401, 'auth.token_expired'),
      ),
      ...defaultHandlers(),
    );

    const state = await boot();

    expect(state.status).toBe('anon');
  });

  it('logout completes locally even when the revoke call fails', async () => {
    server.use(...defaultHandlers());
    await boot();

    server.use(
      mswHttp.post('http://localhost/v1/auth/logout', () => HttpResponse.error()),
    );

    await logout();

    const { result } = renderHook(() => useAuth());
    expect(result.current.status).toBe('anon');
    expect(getAccessToken()).toBeNull();
  });
});
