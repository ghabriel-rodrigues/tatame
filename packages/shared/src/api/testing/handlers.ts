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
import { makeEnrollmentRegistry, type EnrollmentRegistryFixture } from './enrollment-fixtures.js';
import { makeGraduationRules } from './graduation-fixtures.js';
import { makeAdminOverview, makePlanCatalog, makeRepasses } from './billing-fixtures.js';
import type {
  AcademyPlan,
  AdminBillingOverview,
  GraduationEntry,
  GraduationRuleRow,
  RepassesResponse,
} from '../types.js';

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

/**
 * Happy-path GET handlers for the admin enrollment registry (ENR.13-16).
 * Pass a registry (or partial overrides over the screenshot-faithful default)
 * for per-test data; mutations stay per-test via `server.use(...)`.
 */
export function enrollmentHandlers(
  registry: Partial<EnrollmentRegistryFixture> = {},
) {
  const data: EnrollmentRegistryFixture = { ...makeEnrollmentRegistry(), ...registry };

  return [
    http.get('/v1/admin/students', ({ response }) =>
      response(200).json({ students: data.students }),
    ),
    http.get('/v1/admin/guardians', ({ response }) =>
      response(200).json({ guardians: data.guardians }),
    ),
    http.get('/v1/admin/professors', ({ response }) =>
      response(200).json({ professors: data.professors }),
    ),
    http.get('/v1/admin/classes', ({ response }) =>
      response(200).json({ classes: data.classes }),
    ),
    http.get('/v1/admin/classes/{id}', ({ params, response }) => {
      const detail = data.classDetails[params.id];
      if (!detail) {
        return response.untyped(problemResponse(404, 'resource.not_found'));
      }
      return response(200).json({ class: detail });
    }),
    http.get('/v1/admin/classes/{id}/sessions', ({ params, response }) =>
      response(200).json({ sessions: data.sessions[params.id] ?? [] }),
    ),
    // Régua defaults so belt selects (student/turma forms) resolve (GRD.14).
    http.get('/v1/admin/graduation-rules', ({ response }) =>
      response(200).json({ rules: makeGraduationRules() }),
    ),
    // Plan-catalog default so plan selects (student sheets) resolve (BIL.14).
    http.get('/v1/admin/billing/plans', ({ response }) =>
      response(200).json({ plans: makePlanCatalog() }),
    ),
  ];
}

export interface BillingHandlerOptions {
  /** Visão financeira payload (admin-02 default when omitted). */
  overview?: AdminBillingOverview;
  /** Plan catalog for GET /admin/billing/plans (seed default when omitted). */
  plans?: AcademyPlan[];
}

/**
 * Happy-path GET handlers for the admin billing surface (BIL.13-14):
 * overview aggregates + plan catalog. Mutations stay per-test via
 * `server.use(...)`.
 */
export function billingHandlers(options: BillingHandlerOptions = {}) {
  const overview = options.overview ?? makeAdminOverview();
  const plans = options.plans ?? makePlanCatalog();

  return [
    http.get('/v1/admin/billing/overview', ({ response }) => response(200).json(overview)),
    http.get('/v1/admin/billing/plans', ({ response }) => response(200).json({ plans })),
  ];
}

/**
 * Happy-path handler for the platform repasse read model (BIL.15) —
 * plataforma-09-faithful default with the Retido delinquent-academy row.
 */
export function repassesHandlers(data?: RepassesResponse) {
  const body = data ?? makeRepasses();
  return [
    http.get('/v1/platform/billing/repasses', ({ response }) => response(200).json(body)),
  ];
}

export interface GraduationHandlerOptions {
  /** Merged régua rows for GET /admin/graduation-rules (defaults when omitted). */
  rules?: GraduationRuleRow[];
  /** Graduation history per student id for GET /admin/students/:id/graduations. */
  histories?: Record<string, GraduationEntry[]>;
}

/**
 * Happy-path handlers for the admin graduation surface (GRD.13-14): régua
 * GET/PUT (PUT echoes the submitted values merged over the rows) and the
 * per-student history. Revoke stays per-test via `server.use(...)`.
 */
export function graduationHandlers(options: GraduationHandlerOptions = {}) {
  const rules = options.rules ?? makeGraduationRules();
  const histories = options.histories ?? {};

  return [
    http.get('/v1/admin/graduation-rules', ({ response }) =>
      response(200).json({ rules }),
    ),
    http.put('/v1/admin/graduation-rules', async ({ request, response }) => {
      const body = (await request.json()) as {
        rules: Array<{ beltId: string; lessonsPerDegree: number; enabled: boolean }>;
      };
      const byBelt = new Map(body.rules.map((entry) => [entry.beltId, entry]));
      return response(200).json({
        rules: rules.map((row) => {
          const entry = byBelt.get(row.beltId);
          return entry
            ? { ...row, lessonsPerDegree: entry.lessonsPerDegree, enabled: entry.enabled }
            : row;
        }),
      });
    }),
    http.get('/v1/admin/students/{id}/graduations', ({ params, response }) =>
      response(200).json({ graduations: histories[params.id] ?? [] }),
    ),
  ];
}
