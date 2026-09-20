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
import {
  makeAuthSession,
  makeMeResponse,
  type MeFixtureOptions,
  type SessionFixtureOptions,
} from './fixtures.js';
import {
  makeEnrollmentRegistry,
  type EnrollmentRegistryFixture,
} from './enrollment-fixtures.js';
import { makeGraduationRules } from './graduation-fixtures.js';
import {
  makeAdminOverview,
  makePlanCatalog,
  makeRepasses,
} from './billing-fixtures.js';
import { makeAdminCalendar, type CalendarResponse } from './agenda-fixtures.js';
import {
  makeAdminEventList,
  makeAdminEventRegistrations,
  type AdminEvent,
  type AdminEventRegistrationsResponse,
} from './events-fixtures.js';
import {
  makeAdminStoreOrderBoard,
  makeAdminStoreProductList,
  makeStoreCategoryList,
  makeStoreOverview,
  type AdminStoreOrderFixture,
  type AdminStoreProductFixture,
  type StoreCategoryFixture,
  type StoreOverview,
} from './store-fixtures.js';
import {
  makeNotificationFeed,
  type NotificationFixture,
} from './notifications-fixtures.js';
import { makeAdminAcademy, makePermissionMatrix } from './config-fixtures.js';
import { makeAdminReport, makeReportCsvBody } from './reports-fixtures.js';
import {
  makePlatformAcademyDetail,
  makePlatformAcademyList,
  makePlatformIntegrations,
  makePlatformOverview,
  makePlatformPlanCatalog,
  makePlatformTeam,
} from './platform-fixtures.js';
import type {
  AcademyPlan,
  AdminReport,
  AdminReportSlug,
  AdminAcademyResponse,
  PlatformAcademyDetail,
  PlatformAcademyListResponse,
  PlatformIntegrationsResponse,
  PlatformOverviewResponse,
  PlatformPlanCatalogResponse,
  PlatformTeamResponse,
  AdminBillingOverview,
  GraduationEntry,
  GraduationRuleRow,
  PermissionMatrixResponse,
  RepassesResponse,
  UpdateAcademyRequest,
  UpdatePermissionsRequest,
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

export function createTestHttp(
  baseUrl: string = TEST_API_ORIGIN,
): OpenApiHttpHandlers<paths> {
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
  const data: EnrollmentRegistryFixture = {
    ...makeEnrollmentRegistry(),
    ...registry,
  };

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
    http.get('/v1/admin/billing/overview', ({ response }) =>
      response(200).json(overview),
    ),
    http.get('/v1/admin/billing/plans', ({ response }) =>
      response(200).json({ plans }),
    ),
  ];
}

/**
 * Happy-path handler for the platform repasse read model (BIL.15) —
 * plataforma-09-faithful default with the Retido delinquent-academy row.
 */
export interface PlatformConsoleHandlerOptions {
  overview?: PlatformOverviewResponse;
  academies?: PlatformAcademyListResponse;
  /** Detail payload per academy id; the shared default when omitted. */
  detail?: Record<string, PlatformAcademyDetail>;
  plans?: PlatformPlanCatalogResponse;
  team?: PlatformTeamResponse;
  integrations?: PlatformIntegrationsResponse;
}

/**
 * Happy-path GET handlers for the plataforma console (PLT.10-14, spec 012).
 * Mutations stay per-test via `server.use(...)`.
 */
export function platformConsoleHandlers(
  options: PlatformConsoleHandlerOptions = {},
) {
  const academies = options.academies ?? makePlatformAcademyList();
  const detail = options.detail;
  return [
    http.get('/v1/platform/overview', ({ response }) =>
      response(200).json(options.overview ?? makePlatformOverview()),
    ),
    http.get('/v1/platform/academies', ({ response }) =>
      response(200).json(academies),
    ),
    http.get('/v1/platform/academies/{id}', ({ response, params }) => {
      const id = String(params.id);
      const found =
        detail?.[id] ??
        (() => {
          const row = academies.academies.find(
            (candidate) => candidate.id === id,
          );
          return row ? makePlatformAcademyDetail(row) : undefined;
        })();
      if (!found) {
        return response.untyped(problemResponse(404, 'resource.not_found'));
      }
      return response(200).json(found);
    }),
    http.get('/v1/platform/plans', ({ response }) =>
      response(200).json(options.plans ?? makePlatformPlanCatalog()),
    ),
    http.get('/v1/platform/team', ({ response }) =>
      response(200).json(options.team ?? makePlatformTeam()),
    ),
    http.get('/v1/platform/integrations', ({ response }) =>
      response(200).json(options.integrations ?? makePlatformIntegrations()),
    ),
  ];
}

export function repassesHandlers(data?: RepassesResponse) {
  const body = data ?? makeRepasses();
  return [
    http.get('/v1/platform/billing/repasses', ({ response }) =>
      response(200).json(body),
    ),
  ];
}

/**
 * Happy-path handler for the admin console calendar (AGD.4, spec 007) —
 * admin-14-faithful weekday recurrence buckets, `events` always empty.
 */
export function adminCalendarHandlers(data?: CalendarResponse) {
  const body = data ?? makeAdminCalendar();
  return [
    http.get('/v1/admin/calendar', ({ response }) => response(200).json(body)),
  ];
}

export interface AdminEventsHandlerOptions {
  /** Card catalog for GET /admin/events (admin-13 default when omitted). */
  events?: AdminEvent[];
  /** Inscritos payload per event id (shared default when omitted). */
  registrations?: Record<string, AdminEventRegistrationsResponse>;
  /** Responsável select options (fresh enrollment registry when omitted). */
  professors?: EnrollmentRegistryFixture['professors'];
}

/**
 * Happy-path GET handlers for the admin events console (EVT.9, spec 008):
 * card list + inscritos view, plus the professors list the responsável
 * select resolves from. Mutations stay per-test via `server.use(...)`.
 */
export function adminEventsHandlers(options: AdminEventsHandlerOptions = {}) {
  const events = options.events ?? makeAdminEventList();
  const registrations = options.registrations ?? {};
  const professors = options.professors ?? makeEnrollmentRegistry().professors;

  return [
    http.get('/v1/admin/events', ({ response }) =>
      response(200).json({ events }),
    ),
    http.get('/v1/admin/events/{id}/registrations', ({ params, response }) =>
      response(200).json(
        registrations[params.id] ?? makeAdminEventRegistrations(),
      ),
    ),
    http.get('/v1/admin/professors', ({ response }) =>
      response(200).json({ professors }),
    ),
  ];
}

export interface AdminStoreHandlerOptions {
  /** Loja tiles payload (admin-03 default when omitted). */
  overview?: StoreOverview;
  /** "Categorias da loja" chips (admin-03 default when omitted). */
  categories?: StoreCategoryFixture[];
  /** Produto rows (admin-03 default when omitted). */
  products?: AdminStoreProductFixture[];
  /** Pedidos board — pending never belongs here (admin-04 default). */
  orders?: AdminStoreOrderFixture[];
}

/**
 * Happy-path GET handlers for the admin Loja console (STO.8-9, spec 009):
 * overview tiles, category chips, product rows and the pedidos board.
 * Mutations stay per-test via `server.use(...)`.
 */
export function adminStoreHandlers(options: AdminStoreHandlerOptions = {}) {
  const overview = options.overview ?? makeStoreOverview();
  const categories = options.categories ?? makeStoreCategoryList();
  const products = options.products ?? makeAdminStoreProductList();
  const orders = options.orders ?? makeAdminStoreOrderBoard();

  return [
    http.get('/v1/admin/store/overview', ({ response }) =>
      response(200).json(overview),
    ),
    http.get('/v1/admin/store/categories', ({ response }) =>
      response(200).json({ categories }),
    ),
    http.get('/v1/admin/store/products', ({ response }) =>
      response(200).json({ products }),
    ),
    http.get('/v1/admin/store/orders', ({ response }) =>
      response(200).json({ orders }),
    ),
  ];
}

export interface NotificationsHandlerOptions {
  /** Feed rows, newest first (NOT.2-shaped mixed feed when omitted). */
  notifications?: NotificationFixture[];
  /** Badge count (unread rows in the feed when omitted). */
  unreadCount?: number;
  /** The membership's notifications_enabled flag (true when omitted). */
  settingsEnabled?: boolean;
}

/**
 * Happy-path handlers for the notifications read API (NOT.7, spec 010):
 * feed list, unread-count badge, read-all/read-one and the settings pair.
 * Per-test overrides (read-all spies, mutated counts) via `server.use(...)`.
 */
export function notificationsHandlers(
  options: NotificationsHandlerOptions = {},
) {
  const notifications = options.notifications ?? makeNotificationFeed();
  const unreadCount =
    options.unreadCount ?? notifications.filter((row) => !row.readAt).length;
  const enabled = options.settingsEnabled ?? true;

  return [
    http.get('/v1/notifications', ({ response }) =>
      response(200).json({ notifications, nextCursor: null }),
    ),
    http.get('/v1/notifications/unread-count', ({ response }) =>
      response(200).json({ count: unreadCount }),
    ),
    http.post('/v1/notifications/read-all', ({ response }) =>
      response(200).json({ updated: unreadCount }),
    ),
    http.post('/v1/notifications/{id}/read', ({ params, response }) => {
      const found = notifications.find((row) => row.id === params.id);
      if (!found)
        return response.untyped(problemResponse(404, 'resource.not_found'));
      return response(200).json({
        notification: {
          ...found,
          readAt: found.readAt ?? new Date().toISOString(),
        },
      });
    }),
    http.get('/v1/notifications/settings', ({ response }) =>
      response(200).json({ enabled }),
    ),
    http.put('/v1/notifications/settings', async ({ request, response }) => {
      const body = (await request.json()) as { enabled: boolean };
      return response(200).json({ enabled: body.enabled });
    }),
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
        rules: Array<{
          beltId: string;
          lessonsPerDegree: number;
          enabled: boolean;
        }>;
      };
      const byBelt = new Map(body.rules.map((entry) => [entry.beltId, entry]));
      return response(200).json({
        rules: rules.map((row) => {
          const entry = byBelt.get(row.beltId);
          return entry
            ? {
                ...row,
                lessonsPerDegree: entry.lessonsPerDegree,
                enabled: entry.enabled,
              }
            : row;
        }),
      });
    }),
    http.get('/v1/admin/students/{id}/graduations', ({ params, response }) =>
      response(200).json({ graduations: histories[params.id] ?? [] }),
    ),
  ];
}

export interface AdminReportsHandlerOptions {
  /** JSON payload per slug (spec-013-faithful defaults when omitted). */
  reports?: Partial<Record<AdminReportSlug, AdminReport>>;
  /** CSV body per slug (BOM + semicolon default when omitted). */
  csv?: Partial<Record<AdminReportSlug, string>>;
}

/**
 * Happy-path handlers for the admin reports surface (REP.9, spec 013): the
 * JSON read model echoing the requested month, and the CSV download with the
 * contract's Content-Disposition filename (`<slug>-<YYYY-MM>.csv`). Negative
 * paths stay per-test via `server.use(...)`.
 */
export function adminReportsHandlers(options: AdminReportsHandlerOptions = {}) {
  return [
    http.get('/v1/admin/reports/{report}', ({ params, request, response }) => {
      const month = new URL(request.url).searchParams.get('month') ?? undefined;
      const body =
        options.reports?.[params.report] ??
        makeAdminReport(params.report, month);
      return response(200).json(body);
    }),
    http.get(
      '/v1/admin/reports/{report}/csv',
      ({ params, request, response }) => {
        const month =
          new URL(request.url).searchParams.get('month') ?? '2026-07';
        const body =
          options.csv?.[params.report] ?? makeReportCsvBody(params.report);
        return response.untyped(
          new HttpResponse(body, {
            status: 200,
            headers: {
              'Content-Type': 'text/csv; charset=utf-8',
              'Content-Disposition': `attachment; filename="${params.report}-${month}.csv"`,
            },
          }),
        );
      },
    ),
  ];
}

export interface AdminConfigHandlerOptions {
  /** `/admin/academy` document (brand-null default when omitted). */
  academy?: AdminAcademyResponse;
  /** Permission matrix + counts (registry defaults when omitted). */
  matrix?: PermissionMatrixResponse;
}

/**
 * Happy-path handlers for the admin config surface (CFG.9-11, spec 011):
 * academy identity GET/PUT (PUT echoes the submitted document) and the
 * permissions matrix GET/PUT (PUT merges the entries over the rows).
 * Negative paths stay per-test via `server.use(...)`.
 */
export function adminConfigHandlers(options: AdminConfigHandlerOptions = {}) {
  const academy = options.academy ?? makeAdminAcademy();
  const matrix = options.matrix ?? makePermissionMatrix();

  return [
    http.get('/v1/admin/academy', ({ response }) =>
      response(200).json(academy),
    ),
    http.put('/v1/admin/academy', async ({ request, response }) => {
      const body = (await request.json()) as UpdateAcademyRequest;
      return response(200).json({
        ...academy,
        name: body.name,
        brand: body.brand,
        autoNotificationsEnabled: body.autoNotificationsEnabled,
      });
    }),
    http.get('/v1/admin/permissions', ({ response }) =>
      response(200).json(matrix),
    ),
    http.put('/v1/admin/permissions', async ({ request, response }) => {
      const body = (await request.json()) as UpdatePermissionsRequest;
      const byKey = new Map(
        body.entries.map((e) => [`${e.role}:${e.key}`, e.allowed]),
      );
      return response(200).json({
        ...matrix,
        permissions: matrix.permissions.map((row) => {
          const next = byKey.get(`${row.role}:${row.key}`);
          return next === undefined ? row : { ...row, allowed: next };
        }),
      });
    }),
  ];
}
