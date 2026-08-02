# Web testing strategy

Type: grilling
Status: resolved
Blocked by: 01

## Question

What is the testing strategy for the web app? Decide: unit/component runner (Vitest + React Testing Library under nx — aligns with the Vite build decision); API mocking approach (MSW, ideally generated from the same OpenAPI spec as the client); what deserves component tests vs E2E (Playwright?) given BOSS's rule that a README checklist box only gets checked with working, tested code; how RBAC/persona boundaries are tested (professor must never see financial data); visual/design-fidelity checks against the pixel-perfect handoff (screenshot tests worth it or not); and where tests run (nx targets, CI on GitHub Actions vs Netlify build).

## Answer

**Resolved AFK by BOSS charter. Cross-effort caveat:** the infra CI ticket (`.scratch/infra/issues/03-ci-pipeline-choice.md`) was unresolved when this closed. This ticket **assumes GitHub Actions with nx-affected pipelines** (a `.github/` dir already exists; web ticket 03 already presumes a CI drift check) — if infra rules otherwise, only the "where it runs" section changes, not the test pyramid.

**Runners:**
- **Unit/component: Vitest + React Testing Library**, already scaffolded by ticket 01 (`--unitTestRunner=vitest`; `test` block in `vite.config.ts`, jsdom environment, nx-inferred `test` target). One config drives dev, build, and tests — no Jest, no second transform pipeline.
- **E2E: Playwright**, as a separate nx project `apps/web-e2e` added via `@nx/playwright` when the first auth slice lands (ticket 01 deliberately generated with `--e2eTestRunner=none`; do not retrofit Cypress).

**API mocking: MSW at the fetch layer, typed from the same OpenAPI schema.** MSW intercepts at the network level, so `openapi-fetch` + all ticket 03 middleware (auth adapter, 401 single-flight, error normalization) run for real in tests — nothing is stubbed inside the client. Handlers are written with **`openapi-msw`**, which types `http.get("/path", …)` params/bodies/responses against the committed `packages/shared/src/api/schema.d.ts` — the same drift-checked artifact the client uses, so mocks cannot diverge silently from the backend contract. Layout: shared handler factories + default happy-path handlers in `packages/shared/src/api/testing/` (reusable by web and RN tests); per-test overrides via `server.use(...)`. **Rejected:** stubbing the generated client or TanStack Query hooks directly (tests implementation, not behavior; skips the middleware we most need covered), and hand-rolled fetch mocks (untyped, drift-prone).

**Test seams — what gets tested where (the pyramid):**
1. **Route/page-level component tests (the bulk).** Render a real router surface (`createMemoryRouter` over the actual route objects) inside real providers (fresh `QueryClient` per test, retry off; auth store seeded) against MSW. Assert what the user sees — not hook internals, not query keys, not component instances. A shared `renderRoute(path, { session, handlers })` helper owns the provider stack and auth-store seeding. This is where feature acceptance criteria live: a README checklist box needs its user stories expressed as these tests.
2. **Plain Vitest unit tests** only for pure logic with real branching: post-login redirect priority rule (ticket 04), invalidation lists, formatters/error normalization. No component "renders without crashing" tests.
3. **RBAC/persona boundaries — mandatory suite per guarded surface.** For each of `/admin/*` and `/plataforma/*`: anon → redirected to `/login?next=…`; wrong-persona session → redirected to own surface; correct persona → shell renders; impersonation session → `/admin` renders WITH banner, `/plataforma` stays denied. Plus MSW-level negative checks that RBAC-sensitive pages render the error state on 403 (backend is the real enforcer; web must fail visibly, not blankly). The professor-financial rule is a backend + mobile concern (professor has no web surface per ticket 02) — recorded here so it is not assumed covered by web tests.
4. **Playwright e2e — thin smoke lane only**, reserved for what MSW structurally cannot prove: the real cookie/refresh loop and the real proxy wiring. Initial suite (~6 specs, target < 5 min): login happy path (real refresh cookie set), silent-refresh page reload stays logged in, guarded-route redirect for anon, wrong-persona redirect, logout revocation (reload lands on `/login`), Convite invalid-token error state. Runs against `vite preview` (built artifact) + the real NestJS API and Postgres from docker-compose with a seeded auth fixture set (one platform user, one admin, one aluno-only). No MSW in e2e. Every new feature does NOT get an e2e test by default — it gets route-level MSW tests; e2e grows only when a flow crosses a boundary MSW can't see.

**Visual/design-fidelity: no screenshot-diff CI initially.** Pixel-perfection against the handoff is verified by human review against the 79 screenshots during feature review (BOSS checklist item 4), plus assertions that components use Lumira tokens (lintable: no hardcoded colors) rather than pixel snapshots. Rationale: screenshot tests on a theme-engine app (white-label palette derivation) are flake factories that freeze the theme, not the fidelity. Revisit only if visual regressions actually recur — then as Playwright screenshots of 3-4 stable pages, not per-component.

**Where it runs:**
- Local/nx: `nx test web` (Vitest), `nx e2e web-e2e` (Playwright), both wired into `nx affected`.
- **CI = GitHub Actions** *(assumption pending infra 03)*: PR pipeline runs `nx affected -t lint typecheck test build` + the `generate-api` drift check (ticket 03); the Playwright smoke lane runs on PRs when `web`/`shared`/`api` are affected, with the API + Postgres as docker-compose services and a seed step. **Netlify does not run tests** — it only builds and deploys; a deploy must never be the place a test fails first.
- Checklist gate (BOSS rule): a web feature's README box is checked only when its route-level tests exist and pass in CI, RBAC suite covers any new guarded route, and the smoke lane is green.
