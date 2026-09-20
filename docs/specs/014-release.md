# 014 — Release Readiness (Phase 14)

Status: ready-for-agent
Personas covered: all six (infrastructure phase — no new product surface)

Follows the to-spec template. Infra truth: `.scratch/infra/issues/03-ci-pipeline-choice.md` (resolved: GitHub Actions, no Nx Cloud, one workflow per toolchain lane), `.scratch/infra/issues/05-env-secret-handling.md` (resolved: per-app `.env` taxonomy, secrets stores per environment), `.scratch/infra/issues/04-netlify-web-deploy.md` (resolved inline by BOSS in this spec — see Implementation Decisions), `.scratch/web/issues/01-build-tooling-vite-nx.md` (route-level code-split decision, never applied), `.scratch/web/issues/07-testing-strategy.md` (Playwright smoke lane, `apps/web-e2e` never created). Design truth: the 79 handoff screenshots at `/Users/gupy/Desktop/design_handoff_jiujitsu_app/` and spec 002 (Quicksand everywhere; Android `Type.kt` ships a recorded `FontFamily.Default` placeholder, iOS ships the `.system(design: .rounded)` approximation).

**Charter constraints this spec operates under (non-negotiable):** the repository has **no git remote by user decision**, and choosing/creating one is the human's call alone — nothing in this phase pushes anywhere or assumes any host or organization. CI workflows are therefore _authored as files_ in this phase and only become live pipelines after the human picks a host and pushes. Every external account (git host, Netlify, Expo/EAS, Apple, Google, production API/Postgres hosting, live Stripe keys, Resend domain) is human-gated: machine work stops at the artifact/runbook boundary.

## Problem Statement

Thirteen phases shipped a feature-complete product across four clients, and none of it can reach a user. There is no working CI (the checked-in `ci.yml` is still the untouched nx template: npm-based, wired to an Nx Cloud account that doesn't exist — it would fail on the first run of this pnpm workspace), no deploy configuration for the web app Netlify is supposed to host, no release documentation, and a drawer of recorded debts that all become release blockers the moment a real user appears:

- **Quicksand never reached the natives.** Android's `Type.kt` maps the whole Lumira type scale onto `FontFamily.Default` with a `TODO(DS)`; iOS approximates with `.system(design: .rounded)`. Both were recorded as acceptable during feature phases; a store release with the wrong typeface on every screen is not pixel-perfect, it's a different product.
- **The web bundle is one chunk.** web-01 decided route-level `React.lazy` at the persona-surface boundary so the public Convite flow never downloads console code — the decision was recorded and never applied; `routes.tsx` still imports every page statically.
- **The Playwright smoke lane exists only on paper.** web-07 specified `apps/web-e2e` with ~6 specs covering what MSW structurally cannot prove (real cookie/refresh loop, real proxy wiring); the project was never generated.
- **`api:typecheck` and `api:build` race on `dist/`.** Typecheck's `tsc -b` writes `outDir: dist` (plus its tsbuildinfo) while webpack builds into the same `dist` — run in parallel by `nx affected -t typecheck build` they corrupt each other's output. CI would be flaky on day one.
- **Nobody has looked at the real apps against the handoff in one sitting.** Fidelity was reviewed per-feature; a release needs one deliberate pass on real devices/simulators against the 79 screenshots.
- **There is no runbook.** When the human creates the accounts, every provider step (Netlify site, EAS project, store listings, Stripe webhook, Resend domain, DNS) is undocumented tribal knowledge.

## Solution

Split release readiness along the only line that matters here: **what the machine can finish alone** versus **what only the human can do** (accounts, money, the git remote).

**(A) Machine-doable** — author the three CI workflow files exactly per infra-03 (correcting the OpenAPI path to where the spec actually lives), fix the `dist/` race so those workflows can ever be green, write `netlify.toml` with the SPA fallback and an `/api` proxy placeholder (this resolves infra-04, decision recorded below), create `apps/web-e2e` with the six web-07 smoke specs running against the docker-compose stack, apply the web-01 code-split, land real Quicksand on both natives, run one honest device visual pass over the core flows of every persona against the handoff screenshots (file everything, fix the P0s), and write `docs/RELEASE.md` — the exact per-provider steps the human runs once accounts exist.

**(B) Human-gated** — a checklist of the eight account/decision gates, each rendered unchecked with a "(humano)" marker: git host + first push, Netlify site + env vars, API+Postgres production host (shortlist with BR-latency criteria and a BOSS recommendation below — the call is the human's), Stripe live mode + webhook, Resend domain, EAS account + builds, App Store / Play Console, DNS/domínio.

When (A) is done, the product is release-ready in the only sense the machine can deliver: every artifact, workflow, config and document exists and is verified locally; each item in (B) is a sit-down task with its runbook page already written.

## User Stories

1. As the maintainer, I want `ci.yml` replaced with the pnpm/nx-affected pipeline infra-03 decided, so that the first push to a remote gets a green, meaningful CI run instead of an Nx Cloud error.
2. As the maintainer, I want the migrations drift gate in CI, so that a Drizzle schema change without its committed migration can never land silently.
3. As the maintainer, I want the OpenAPI freshness gate in CI, so that controllers and the committed spec (`packages/shared/src/api/openapi.json`) can never disagree.
4. As the maintainer, I want `api:typecheck` and `api:build` writing to separate output directories, so that `nx affected -t typecheck build` is deterministic locally and in CI.
5. As the maintainer, I want a path-filtered Android workflow (Gradle assemble + unit tests), so that native Android regressions surface on PRs that touch that tree — and only those.
6. As the maintainer, I want a path-filtered iOS workflow (macOS runner, XcodeGen + xcodebuild, no signing), so that the Swift app builds and tests on PRs without any signing secret existing yet.
7. As the maintainer, I want `netlify.toml` committed with build command, publish dir, SPA fallback and security headers, so that connecting the Netlify site is configuration-free on the Netlify side.
8. As the maintainer, I want the `/api` proxy redirect present as an explicit placeholder in `netlify.toml`, so that pointing the web app at the production API is a one-line edit when the API host exists.
9. As the maintainer, I want the web production env contract documented (`VITE_API_URL`, `VITE_STRIPE_PUBLISHABLE_KEY` per deploy context), so that Netlify UI setup is a transcription job, not archaeology.
10. As the maintainer, I want `apps/web-e2e` with the six web-07 smoke specs green against the docker-compose stack, so that the real cookie/refresh loop and proxy wiring — the things MSW can't see — are proven before any deploy.
11. As a Convite visitor on a phone, I want the public invite flow to download only its own code, so that signup on mobile data is fast (web-01 code-split, finally applied).
12. As an admin or plataforma user, I want console code split from the public surfaces, so that neither persona pays for the other's bundle.
13. As an Aluno on Android, I want every screen rendered in Quicksand, so that the app matches the handoff and its web/iOS siblings.
14. As an Aluno on iOS, I want real Quicksand instead of the rounded-system approximation, so that typography parity across the four clients is actual, not approximate.
15. As BOSS, I want one recorded device visual pass over auth + home + check-in flows for every persona on Android emulator, iOS simulator and web, so that fidelity is verified against the 79 screenshots as a release gate, not per-feature memory.
16. As BOSS, I want every mismatch from that pass filed in a fix-list with P0/P1 triage and the P0s fixed in this phase, so that the pass produces action, not vibes.
17. As the human owner, I want `docs/RELEASE.md` with exact per-provider steps, so that each account I create comes with its finished setup recipe.
18. As the human owner, I want the human-gated items listed as an explicit unchecked checklist with "(humano)" markers, so that my remaining work is enumerated and nothing hides inside "done" machine items.
19. As the human owner, I want an API+Postgres hosting shortlist judged on BR latency, cost and Stripe-webhook reachability with a recommendation, so that my decision is informed but stays mine.
20. As a future contributor, I want all of this to work without any assumption about which git host or organization the repo lands on, so that the user's remote decision is never pre-empted.

## Implementation Decisions

### Section A — machine-doable

#### A.1 CI workflow files (authored now, live after the human's push)

Implements infra-03 verbatim, with one correction to reality: the committed OpenAPI spec lives at `packages/shared/src/api/openapi.json` (emitted by the `api:openapi` target), not the `packages/api-contract/` path the ticket text guessed — the workflow gates the real path.

- **`.github/workflows/ci.yml`** (replaces the nx template file): triggers `pull_request` + `push` to `main`; per-ref `concurrency` with `cancel-in-progress`; shared setup per job (checkout `fetch-depth: 0`, corepack pnpm with `packageManager` pinned in root `package.json`, `actions/setup-node` node 24 + pnpm cache, `pnpm install --frozen-lockfile`, `nrwl/nx-set-shas`). Three parallel jobs: **`main`** — `pnpm nx format:check` then `pnpm nx affected -t lint typecheck test build`, integration/DB tests using Testcontainers Postgres on the runner's Docker daemon (no `services:` container); **`migrations`** — `drizzle-kit check` + `drizzle-kit generate` + `git diff --exit-code packages/db/drizzle`; **`openapi`** — run `nx run api:openapi` + `git diff --exit-code packages/shared/src/api/openapi.json`. A fourth job **`web-smoke`** runs the Playwright lane (A.4) when web/shared/api are affected: compose Postgres up, migrations + seed, API up, `nx e2e web-e2e` against the built artifact; Playwright browsers cached.
- **`.github/workflows/mobile-android.yml`**: `paths: apps/mobile-android/**` + the workflow file; `ubuntu-latest`, temurin JDK 17, `gradle/actions/setup-gradle`, `./gradlew build`. No emulator/instrumented tests in v1.
- **`.github/workflows/mobile-ios.yml`**: `paths: apps/mobile-ios/**` + the workflow file; `macos-15`, Homebrew XcodeGen, `xcodegen generate`, `xcodebuild build test` against an iPhone simulator destination with `CODE_SIGNING_ALLOWED=NO`. Signing/TestFlight stay fog until RLS.H6/H7.
- **Verification without a remote**: workflows can't run here by definition. The gate is `actionlint` clean on all three files plus every command in them executed locally in sequence (the `main` job's command list run verbatim on the workspace). Honest limit, recorded: first live run happens after RLS.H1.

#### A.2 Fix the `api:typecheck` × `api:build` dist race

`apps/api/tsconfig.app.json` moves typecheck output out of webpack's territory: `outDir` → `out-tsc/app` (matching the `out-tsc/vitest` convention already used by `tsconfig.spec.json`), `tsBuildInfoFile` alongside it; webpack keeps `dist/` exclusively. Any nx `outputs`/cache entries and `.gitignore` follow. Gate: `nx run-many -t typecheck build --projects=api` repeated runs are clean and non-interfering.

#### A.3 Netlify deploy wiring — resolves infra-04 (BOSS, AFK)

Recorded here as the ticket's answer; the ticket file gets the resolution and the map gets its decision line.

- **`netlify.toml` at repo root**: `[build]` with `base = "."`, `command = "pnpm nx build web"`, `publish = "apps/web/dist"`; Node 24 via `[build.environment]`.
- **SPA fallback**: `/* → /index.html 200` — required for a React Router SPA on Netlify.
- **`/api` proxy redirect placeholder**: an explicit, commented `[[redirects]]` block `from = "/api/*"` → `to = "<PRODUCTION_API_ORIGIN>/api/:splat"`, `status = 200`, activated by uncommenting + filling the origin when RLS.H3 lands. Until then production builds rely on `VITE_API_URL` (per infra-05 §4); the placeholder documents the same-origin-proxy option that avoids CORS entirely.
- **Security headers** on `/*`: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, and long-lived immutable caching for `/assets/*` (Vite's hashed output). CSP is deferred until the API origin is known (recorded).
- **Build model**: Netlify builds from the repo (its own infrastructure), _not_ a CI-built artifact — per infra-03, deploy stays out of GitHub Actions; per web-07, Netlify never runs tests. Deploy previews per PR come free once the site is linked; previews point at whatever `VITE_API_URL` the `deploy-preview` context sets (initially nothing → previews are UI-only; recorded, revisit with staging fog).
- **Env contract documented in `docs/RELEASE.md`** (not in the toml): per deploy context — `production`: `VITE_API_URL`, `VITE_STRIPE_PUBLISHABLE_KEY` (live publishable); `deploy-preview`/`branch-deploy`: test-mode equivalents or unset. `VITE_*` only; server secrets never enter Netlify (infra-05 §5).

#### A.4 Playwright smoke lane — pays web-07

`apps/web-e2e` generated via `@nx/playwright`, wired into `nx affected`. Exactly the six specs web-07 scoped, nothing more: login happy path (real refresh cookie set), silent-refresh page reload stays logged in, guarded-route redirect for anonymous, wrong-persona redirect, logout revocation (reload lands on `/login`), Convite invalid-token error state. Runs against `vite preview` (built artifact) + the real NestJS API + compose Postgres with the seeded fixture set (platform user, admin, aluno). No MSW. Target < 5 min. New features still do _not_ get e2e by default — the lane grows only when a flow crosses a boundary MSW can't see (web-07 rule restated).

#### A.5 Web route-level code-split — pays web-01

`routes.tsx` moves every page behind `React.lazy` at the persona-surface boundary (`/admin`, `/plataforma`, `/convite` + public auth pages), with `Suspense` fallbacks at the surface shells. Literal dynamic-import paths only, no barrels, direct design-system entry imports (the web-01 rules). No `manualChunks` tuning without a bundle report. Gate: build output shows per-surface chunks; loading the Convite route in a fresh session fetches no admin/plataforma chunk (asserted in a smoke spec or verified in the visual pass network tab).

#### A.6 Quicksand on the natives — pays the spec-002 debts

- **Source of truth**: Quicksand static TTFs (Light/Regular/Medium/SemiBold/Bold) from the upstream OFL release; the OFL license file is committed next to the fonts on both platforms.
- **Android**: font files into `app/src/main/res/font/` (`quicksand_light` … `quicksand_bold`), `QuicksandFamily` in `Type.kt` becomes the real `FontFamily(Font(...))` set, the `TODO(DS)` dies. Weight mapping preserved exactly — only the family changes.
- **iOS**: TTFs as resources of the `DesignSystem` SPM package (`.process` resources), registered at app start via `CTFontManagerRegisterFontsForURL` from the package bundle (SPM resources are invisible to `UIAppFonts`); a `Typography` helper exposes `Font.custom("Quicksand", …)` per weight/size and every `.system(design: .rounded)` usage in DesignSystem/Features migrates to it.
- Gate on both: a debug screen/preview rendering the type scale, checked in the visual pass; grep-clean for `FontFamily.Default` (Android) and `design: .rounded` (iOS) in app code.

#### A.7 Device visual pass — honest scope

- **Stack**: compose Postgres + seeded API on host, web dev server, Android emulator (AVD), iOS simulator, RN via Expo on one of the above.
- **Scope — deliberately not all 79 screens**: the core flows per persona — login/auth, home/dashboard, and check-in end-to-end (aluno check-in against professor live code) — plus the Convite public flow, compared side-by-side against the corresponding handoff screenshots. A full 79-screen pixel pass is recorded as **ongoing QA**, not a phase gate: per web-07's rationale, fidelity on a theme-engine product is reviewed by humans over time, not frozen in one heroic sitting.
- **Output**: `docs/qa/visual-pass-014.md` fix-list — one row per mismatch (surface, screen, screenshot ref, description, P0/P1). **P0** = wrong token/color/typeface, broken layout, missing element the handoff shows; **P1** = spacing/radius/nuance drift. P0s are fixed inside this phase (RLS.11); P1s stay filed for ongoing QA.

#### A.8 Release runbook — `docs/RELEASE.md`

One page per provider, written so the human executes top-to-bottom once the account exists: git host (create repo — host/org is the **user's choice**, the runbook names no default — add remote, push, watch the three workflows go live, add Actions secrets when any are needed); Netlify (create site, link repo, `netlify.toml` is picked up, set per-context env vars per A.3, custom domain + HTTPS); API+Postgres host (per the H3 decision: provision, set the zod-validated env per infra-05, run migrations with the `tatame_owner` role, point the Netlify `/api` proxy or `VITE_API_URL` at it, register the Stripe webhook URL); Stripe (live keys into the host's secret store, webhook endpoint + `STRIPE_WEBHOOK_SECRET`, publishable key into Netlify/EAS); Resend (domain verification DNS records, `RESEND_FROM_EMAIL` flip); EAS (account, project link, `eas env` secrets, preview/production build profiles); App Store / Play Console (accounts, bundle ids matching the committed apps, signing, first internal-testing builds); DNS (domain, Netlify records, Resend records, API host records). Each page ends with a "verify" step.

### Section B — human-gated (accounts, money, the remote)

These are decisions and accounts only the human can create. The machine's contribution is A.8's runbook; each item below renders in the Delivery Checklist as an unchecked box marked **(humano)**.

- **H1 — git host + push.** Pick the host/organization (user's decision alone; this spec and the runbook are host-agnostic beyond GitHub Actions requiring GitHub — if the human picks another host, infra-03's platform choice reopens as a ticket, recorded). Push; the three workflows activate.
- **H2 — Netlify.** Create the site, link the repo, set per-context env vars.
- **H3 — API + Postgres production host.** BOSS shortlist on the recorded criteria (cost, BR latency, Stripe-webhook reachability, fit for the existing `apps/api/Dockerfile` artifact + managed Postgres): **Fly.io** (runs the container in the São Paulo region — the only shortlist member with BR compute; managed Postgres available), **Railway** (best DX, no BR region), **Render** (simple, no BR region), **Neon** (Postgres only — pairs with a container host), **Supabase** (Postgres in São Paulo — used purely as managed Postgres, ignoring the rest). **BOSS recommendation: Fly.io in GRU for the API container, with Fly managed Postgres — single vendor, BR latency for both hops; Supabase São Paulo Postgres is the fallback pairing if its managed offering disappoints.** The choice is the human's; the runbook page is written against the recommendation with a note on what changes per alternative.
- **H4 — Stripe.** Live-mode activation, live keys into the API host's secret store, webhook endpoint + secret, publishable key to the clients' stores.
- **H5 — Resend.** Domain verification (DNS), production from-address.
- **H6 — Expo/EAS.** Account, project, secrets, first preview + production builds (EAS release lanes stay out of PR CI per infra-03; wiring beyond the runbook is future work, recorded).
- **H7 — App Store + Play Console.** Developer accounts, app records, signing, first internal-testing uploads for the two native apps (and the RN app via EAS Submit if chosen).
- **H8 — DNS/domínio.** Domain purchase and the records the other pages emit.

## Testing Decisions

- This phase's "tests" are mostly gates on infrastructure, held to the same doctrine: verify externally observable behavior. Workflows: `actionlint` + every job's command list executed verbatim locally (the honest maximum without a remote). Dist race: repeated parallel `typecheck`+`build` runs clean. Netlify: `pnpm nx build web` produces `apps/web/dist` with `index.html` (the publish contract); toml validated by Netlify's schema (linter) — live validation lands with H2.
- The Playwright suite **is** product testing: the six specs are the deliverable and their green run against the compose stack is the gate; they join `nx affected` so CI runs them from day one of H1. Prior art: none (first e2e project) — web-07's spec list is the contract.
- Code-split: existing Vitest route/RBAC suites must stay green unchanged (lazy wrapping is behavior-invisible); bundle-shape assertion per A.5.
- Quicksand: existing native unit/snapshot-free tests stay green; verification is the A.6 grep gates + the visual pass (typography is exactly the kind of fidelity web-07 assigned to human review, not screenshot CI).
- Visual pass: the fix-list document is the test artifact; P0 closure is re-verified on device before the box is checked.

## Out of Scope

- **Anything requiring an account that doesn't exist** — pushing to any remote, creating Netlify/EAS/store/hosting accounts, live Stripe keys, DNS. Section B enumerates them; the machine stops at artifacts + runbook.
- **Choosing the git host or organization** — user's decision, never pre-empted.
- **Staging/preview backend environments** (what deploy previews point at) — map fog, depends on H3; previews stay UI-only until then, recorded.
- **Scheduled jobs / cron runner** (billing materialization + dunning) — backend map defers to API hosting; sharp after H3.
- **Deploy-time migration execution wiring** — hangs on H3 (drift _check_ is in CI now; `migrate()` at deploy is the H3 runbook's job).
- **EAS build/submit CI lanes, store signing in CI, TestFlight/Play release automation** — after H6/H7.
- **Nx Cloud, CSP header, `manualChunks` tuning, screenshot-diff CI** — each declined with recorded revisit triggers (infra-03, A.3, A.5, web-07).
- **The full 79-screen pixel-by-pixel pass** — core flows only this phase; the rest is ongoing QA per A.7.
- **RN Quicksand work** — the Expo app already loads Quicksand; only the natives carry the debt.

## Further Notes

- This phase pays four recorded debts by name: infra-03's template-`ci.yml` replacement, web-01's code-split, web-07's smoke lane, spec 002's native typefaces — and resolves infra-04 inline (ticket + map updated with this spec as the answer of record).
- The OpenAPI freshness gate uses the spec's real committed path (`packages/shared/src/api/openapi.json`); infra-03's ticket text predates the emit target landing in `packages/shared`.
- Checking a box in the root README remains the only ticket-closing; the checklist below is mirrored there. H-boxes stay unchecked until the human does the thing — a runbook page existing is RLS.12, not RLS.H*.

## Delivery Checklist

- [ ] RLS.1 Fix the `api:typecheck` × `api:build` dist race — typecheck `outDir` → `out-tsc/app` (tsbuildinfo included), webpack keeps `dist/` exclusively; repeated parallel runs clean
- [ ] RLS.2 CI: replace the template `.github/workflows/ci.yml` per infra-03 — pnpm/node 24 setup, `nx-set-shas`, concurrency; parallel jobs `main` (format check + `nx affected -t lint typecheck test build`, Testcontainers Postgres), `migrations` (drizzle-kit check + generate + git-diff drift gate), `openapi` (`nx run api:openapi` + git-diff on `packages/shared/src/api/openapi.json`), `web-smoke` (compose stack + seeded fixtures + `nx e2e web-e2e`); `actionlint` clean + all commands verified locally (live run waits on RLS.H1)
- [ ] RLS.3 CI: `.github/workflows/mobile-android.yml` — path-filtered `apps/mobile-android/**`, JDK 17 temurin, setup-gradle, `./gradlew build`
- [ ] RLS.4 CI: `.github/workflows/mobile-ios.yml` — path-filtered `apps/mobile-ios/**`, macos-15, XcodeGen generate, `xcodebuild build test` with `CODE_SIGNING_ALLOWED=NO`
- [ ] RLS.5 Web deploy: `netlify.toml` (base/command/publish, SPA fallback `/* → /index.html 200`, security + caching headers, commented `/api/*` proxy redirect placeholder) + production env contract documented per deploy context (`VITE_*` only) — resolves infra-04, ticket + map updated
- [ ] RLS.6 Web: route-level code-split per web-01 — `React.lazy` at the persona-surface boundary with `Suspense` fallbacks, literal import paths, per-surface chunks verified (Convite fetches no console code); existing route/RBAC suites green unchanged
- [ ] RLS.7 Web e2e: `apps/web-e2e` via `@nx/playwright` with the six web-07 smoke specs (login happy path, silent-refresh reload, anon guard redirect, wrong-persona redirect, logout revocation, Convite invalid token) green against `vite preview` + compose API/Postgres with seeded fixtures, wired into `nx affected`
- [ ] RLS.8 Android: real Quicksand — OFL TTFs in `res/font`, `Type.kt` `QuicksandFamily` real (weights preserved), `FontFamily.Default` placeholder gone, license committed
- [ ] RLS.9 iOS: real Quicksand — TTFs as DesignSystem SPM resources with runtime registration, `Font.custom` typography helper, all `design: .rounded` usages migrated, license committed
- [ ] RLS.10 Device visual pass — compose+seed stack, Android emulator + iOS simulator + web + RN: auth, home/dashboard and check-in flows per persona plus Convite, compared against the handoff screenshots; findings filed as `docs/qa/visual-pass-014.md` with P0/P1 triage (full 79-screen pass recorded as ongoing QA, not a phase gate)
- [ ] RLS.11 Visual pass P0 fixes — every P0 mismatch from RLS.10 fixed and re-verified on device; P1s remain filed
- [ ] RLS.12 `docs/RELEASE.md` runbook — per-provider step-by-step (git host + push, Netlify, API/Postgres host per H3, Stripe live + webhook, Resend domain, EAS, App Store/Play Console, DNS), each page ending in a verify step; host-agnostic where the choice is the human's
- [ ] RLS.H1 (humano) Pick the git host/organization and push — the user's decision alone; workflows go live on first push
- [ ] RLS.H2 (humano) Create the Netlify site, link the repo, set per-context env vars (`VITE_API_URL`, `VITE_STRIPE_PUBLISHABLE_KEY`)
- [ ] RLS.H3 (humano) Choose the API + Postgres production host — shortlist Fly.io / Railway / Render / Neon / Supabase on BR latency, cost, Stripe reachability; BOSS recommends Fly.io (GRU) + Fly managed Postgres, Supabase São Paulo Postgres as fallback; provision + secrets + migrations per runbook
- [ ] RLS.H4 (humano) Stripe live mode — live keys in the API host secret store, webhook endpoint + secret registered, publishable key to Netlify/EAS
- [ ] RLS.H5 (humano) Resend — domain verification DNS records, production from-address
- [ ] RLS.H6 (humano) Expo/EAS — account, project link, `eas env` secrets, first preview + production builds
- [ ] RLS.H7 (humano) App Store + Play Console — developer accounts, app records, signing, first internal-testing uploads
- [ ] RLS.H8 (humano) DNS/domínio — domain purchase, Netlify + Resend + API host records
