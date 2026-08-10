/**
 * AUTH test helpers (rn-07): contract-typed fixtures (local mirror of
 * `@tatame/shared/testing` — that entry pulls msw, which the RN jest env
 * does not run) plus a tiny route-matching fetch mock for the shared
 * openapi-fetch client.
 */

import type { MeResponse, MembershipView } from '@tatame/shared';

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

let membershipCounter = 0;

export function makeMembership(overrides: Partial<MembershipView> = {}): MembershipView {
  membershipCounter += 1;
  return {
    id: `018f0000-0000-7000-8000-${membershipCounter.toString(16).padStart(12, '0')}`,
    type: 'academy',
    role: 'student',
    tenantId: '018f0000-0000-7000-8000-00000000a1fa',
    academyName: 'Alpha Jiu-Jitsu',
    academySlug: 'alpha-jj',
    academyStatus: 'active',
    status: 'active',
    ...overrides,
  };
}

export interface MeFixtureOptions {
  role?: MeResponse['activeRole'];
  academyStatus?: string;
  memberships?: MembershipView[];
  fullName?: string;
  /** Resolved toggle map from /auth/me (e.g. `dependents.register`). */
  permissions?: Record<string, boolean>;
}

export function makeMe(options: MeFixtureOptions = {}): MeResponse {
  const role = options.role ?? 'student';
  const memberships = options.memberships ?? [makeMembership({ role })];
  const first = memberships[0];
  if (!first) throw new Error('makeMe needs at least one membership');
  return {
    user: {
      id: '018f0000-0000-7000-8000-0000000000a1',
      email: 'aluno@tatame.dev',
      fullName: options.fullName ?? 'Lucas Almeida',
      phone: null,
      avatarUrl: null,
      locale: 'pt-BR',
    },
    memberships,
    activeMembershipId: first.id,
    activeRole: role,
    academy:
      first.type === 'academy'
        ? {
            id: '018f0000-0000-7000-8000-00000000a1fa',
            name: 'Alpha Jiu-Jitsu',
            slug: 'alpha-jj',
            status: options.academyStatus ?? 'active',
            logoUrl: null,
            theme: null,
          }
        : null,
    permissions: options.permissions ?? {},
    impersonation: { isImpersonated: false },
  };
}

/* ------------------------------------------------------------------ */
/* Fetch mock                                                          */
/* ------------------------------------------------------------------ */

export function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function problem(status: number, code: string): Response {
  return new Response(JSON.stringify({ status, code, title: code }), {
    status,
    headers: { 'Content-Type': 'application/problem+json' },
  });
}

export interface MockedRequest {
  method: string;
  path: string;
  /** URL query string including the leading `?` (empty when none). */
  search: string;
  body: unknown;
  authorization: string | null;
}

export type FetchHandler = (
  request: MockedRequest,
) => Response | Promise<Response> | null | undefined;

/**
 * NOT.8/9 baseline: the persona home headers (bell unread count) and perfis
 * (settings switch) now always query the notifications endpoints. Tests not
 * about notifications get quiet defaults — no dot, switch on — unless their
 * handler answers first.
 */
function notificationDefaults(method: string, path: string): Response | null {
  if (method === 'GET' && path === '/v1/notifications/unread-count') {
    return json(200, { count: 0 });
  }
  if (method === 'GET' && path === '/v1/notifications/settings') {
    return json(200, { enabled: true });
  }
  return null;
}

/**
 * Installs a global fetch mock understanding both call shapes the session
 * layer uses: `fetch(Request)` (shared client) and `fetch(url, init)`
 * (raw body refresh). Unmatched requests throw — tests declare every call
 * (the notifications baseline above being the one standing default).
 */
export function installFetchMock(handler: FetchHandler): jest.Mock {
  const impl = jest.fn(async (input: Request | string, init?: RequestInit) => {
    const isRequest = typeof input !== 'string';
    const url = isRequest ? input.url : input;
    const method = (init?.method ?? (isRequest ? input.method : 'GET')).toUpperCase();
    const authorization = isRequest
      ? input.headers.get('authorization')
      : (new Headers(init?.headers).get('authorization') ?? null);
    let raw: string | undefined;
    if (isRequest) {
      raw = await input.clone().text();
    } else if (typeof init?.body === 'string') {
      raw = init.body;
    }
    let body: unknown;
    if (raw) {
      try {
        body = JSON.parse(raw);
      } catch {
        body = raw;
      }
    }
    const parsed = new URL(url, 'http://localhost:3000');
    const path = parsed.pathname;
    const response =
      (await handler({ method, path, search: parsed.search, body, authorization })) ??
      notificationDefaults(method, path);
    if (!response) throw new Error(`Unhandled request: ${method} ${path}`);
    return response;
  });
  globalThis.fetch = impl as unknown as typeof fetch;
  return impl;
}
