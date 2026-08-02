/**
 * Schema-typed MSW handlers (web-07). Written with openapi-msw against the
 * committed `schema.d.ts` — the same drift-checked artifact the client uses,
 * so mocks cannot silently diverge from the backend contract. Default
 * happy-path handlers here; per-test overrides via `server.use(...)`.
 */
import { HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { createOpenApiHttp, type OpenApiHttpHandlers } from 'openapi-msw';
import type { paths } from '../schema.js';
import type { ApiProblem } from '../errors.js';
import { makeAuthSession, makeMeResponse, type MeFixtureOptions, type SessionFixtureOptions } from './fixtures.js';

/**
 * Single-source msw re-exports: consumers (web/RN test suites) must import
 * msw values through this module so handler/server class identities always
 * match (mixing per-package msw type resolutions breaks `server.use`).
 */
export { HttpResponse };
export { http as rawHttp } from 'msw';

/**
 * Identity-free facade over msw's SetupServer. TS checks msw handler classes
 * nominally (protected members), and the class identity differs between the
 * consuming app's resolution and this package's — `unknown` at the `use`
 * boundary sidesteps that; handlers are already fully typed at creation.
 */
export interface TestServer {
  listen(options?: { onUnhandledRequest?: 'error' | 'warn' | 'bypass' }): void;
  resetHandlers(): void;
  close(): void;
  use(...handlers: unknown[]): void;
}

/** node interception server — one per vitest project (web-07). */
export function setupTestServer(): TestServer {
  return setupServer() as unknown as TestServer;
}

/** jsdom origin — web tests create their client with this baseUrl. */
export const TEST_API_ORIGIN = 'http://localhost';

export function createTestHttp(baseUrl: string = TEST_API_ORIGIN): OpenApiHttpHandlers<paths> {
  return createOpenApiHttp<paths>({ baseUrl });
}

/** Typed handler namespace for the default origin. */
export const http = createTestHttp();

/** problem+json body helper for negative-path overrides. */
export function problemResponse(
  status: number,
  code: string,
  detail?: string,
): HttpResponse<ApiProblem> {
  const body: ApiProblem = {
    type: `https://tatame.app/problems/${code}`,
    title: code,
    status,
    detail,
    code,
  };
  return HttpResponse.json(body, {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

export interface DefaultHandlerOptions {
  session?: SessionFixtureOptions;
  me?: MeFixtureOptions;
}

/**
 * Happy-path defaults: login succeeds for the seeded admin persona, silent
 * refresh works, `/auth/me` returns the bootstrap, logout succeeds.
 */
export function defaultHandlers(options: DefaultHandlerOptions = {}) {
  const session = makeAuthSession(options.session);
  const me = makeMeResponse(
    options.me ?? {
      memberships: session.memberships,
      activeMembershipId: session.activeMembershipId,
      user: session.user,
    },
  );

  return [
    http.post('/v1/auth/login', ({ response }) => response(200).json(session)),
    http.post('/v1/auth/refresh', ({ response }) =>
      response(200).json({
        accessToken: session.accessToken,
        accessExpiresIn: session.accessExpiresIn,
      }),
    ),
    http.get('/v1/auth/me', ({ response }) => response(200).json(me)),
    http.post('/v1/auth/switch', ({ response }) =>
      response(200).json({
        accessToken: 'switched-access-token',
        accessExpiresIn: 900,
        activeMembershipId: session.activeMembershipId,
      }),
    ),
    http.post('/v1/auth/logout', ({ response }) => response(204).empty()),
  ];
}
