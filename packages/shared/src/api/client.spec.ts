/**
 * Auth middleware contract (web-03): bearer injection, single-flight 401
 * refresh with exactly one replay, and onAuthLost on refresh failure.
 * Pure fetch fakes — no MSW needed at this seam.
 */
import { describe, expect, it, vi } from 'vitest';
import { createApiClient, type AuthAdapter } from './client.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeAdapter(overrides: Partial<AuthAdapter> = {}): AuthAdapter {
  return {
    getAccessToken: () => 'initial-token',
    refresh: vi.fn(async () => 'refreshed-token'),
    onAuthLost: vi.fn(),
    ...overrides,
  };
}

describe('createApiClient auth middleware', () => {
  it('attaches the bearer header from the token source', async () => {
    const seen: string[] = [];
    const client = createApiClient({
      baseUrl: 'http://api.test',
      auth: makeAdapter(),
      fetch: async (request) => {
        seen.push(request.headers.get('Authorization') ?? '');
        return jsonResponse(200, { ok: true });
      },
    });

    await client.GET('/v1/auth/me');
    expect(seen).toEqual(['Bearer initial-token']);
  });

  it('replays a 401 exactly once after a successful refresh', async () => {
    let token = 'stale-token';
    const calls: Array<{ auth: string | null }> = [];
    const adapter = makeAdapter({
      getAccessToken: () => token,
      refresh: vi.fn(async () => {
        token = 'fresh-token';
        return token;
      }),
    });
    const client = createApiClient({
      baseUrl: 'http://api.test',
      auth: adapter,
      fetch: async (request) => {
        calls.push({ auth: request.headers.get('Authorization') });
        if (request.headers.get('Authorization') === 'Bearer stale-token') {
          return jsonResponse(401, { code: 'auth.token_expired', status: 401 });
        }
        return jsonResponse(200, { ok: true });
      },
    });

    const { response } = await client.GET('/v1/auth/me');

    expect(response.status).toBe(200);
    expect(calls).toEqual([
      { auth: 'Bearer stale-token' },
      { auth: 'Bearer fresh-token' },
    ]);
    expect(adapter.refresh).toHaveBeenCalledTimes(1);
  });

  it('single-flights concurrent 401 refreshes', async () => {
    let token = 'stale-token';
    let refreshCount = 0;
    const adapter = makeAdapter({
      getAccessToken: () => token,
      refresh: vi.fn(async () => {
        refreshCount += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        token = 'fresh-token';
        return token;
      }),
    });
    const client = createApiClient({
      baseUrl: 'http://api.test',
      auth: adapter,
      fetch: async (request) =>
        request.headers.get('Authorization') === 'Bearer fresh-token'
          ? jsonResponse(200, { ok: true })
          : jsonResponse(401, { code: 'auth.token_expired', status: 401 }),
    });

    const [a, b, c] = await Promise.all([
      client.GET('/v1/auth/me'),
      client.GET('/v1/auth/me'),
      client.GET('/v1/auth/me'),
    ]);

    expect(refreshCount).toBe(1);
    expect([a.response.status, b.response.status, c.response.status]).toEqual([
      200, 200, 200,
    ]);
  });

  it('emits onAuthLost and returns the original 401 when refresh fails', async () => {
    const adapter = makeAdapter({
      refresh: vi.fn(async () => null),
    });
    const client = createApiClient({
      baseUrl: 'http://api.test',
      auth: adapter,
      fetch: async () =>
        jsonResponse(401, { code: 'auth.token_expired', status: 401 }),
    });

    const { response } = await client.GET('/v1/auth/me');

    expect(response.status).toBe(401);
    expect(adapter.onAuthLost).toHaveBeenCalledTimes(1);
    expect(adapter.refresh).toHaveBeenCalledTimes(1);
  });

  it('never refreshes on the credential endpoints themselves', async () => {
    const adapter = makeAdapter({ getAccessToken: () => null });
    const client = createApiClient({
      baseUrl: 'http://api.test',
      auth: adapter,
      fetch: async () =>
        jsonResponse(401, { code: 'auth.invalid_credentials', status: 401 }),
    });

    const { response } = await client.POST('/v1/auth/login', {
      body: { email: 'x@y.dev', password: 'nope' },
    });

    expect(response.status).toBe(401);
    expect(adapter.refresh).not.toHaveBeenCalled();
    expect(adapter.onAuthLost).not.toHaveBeenCalled();
  });
});
