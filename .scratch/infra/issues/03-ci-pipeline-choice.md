# CI pipeline choice

Type: research
Status: resolved
Blocked by: 01

## Question

Which CI platform and pipeline shape should the monorepo use? Research GitHub Actions (a `.github/` directory already exists in the repo) vs alternatives in the nx context: nx-affected-based pipelines (lint, typecheck, unit, e2e with a Postgres service container), remote caching options (Nx Cloud yes/no), pipeline layout (single workflow with affected targets vs per-app workflows), and how the pipeline stays fast as web + 3 mobile apps accumulate. Recommend the platform and the initial workflow set for the API-first phase.

## Answer

Resolved as BOSS (AFK). Inputs: infra-01 (natives outside the nx graph → path-filtered
lanes), db-01 (drizzle-kit migrations, Testcontainers), backend-04/08 (committed
OpenAPI spec at `packages/api-contract/openapi.json` + freshness gate).

### Platform: GitHub Actions

The repo will live on GitHub (BOSS default; `.github/` already exists). GHA gives native
path filters, free macOS runners for the iOS lane, first-class pnpm/nx caching actions,
and the largest action ecosystem. GitLab CI / CircleCI / Buildkite offer no advantage
that justifies a second platform account for a GitHub-hosted repo. Not relitigated
further.

### Nx Cloud: no (for now)

The existing `.github/workflows/ci.yml` is the nx template file: npm-based, wired to Nx
Cloud (`nx start-ci-run --distribute-on=...`, `nx record`, `nx fix-ci`). **It gets
replaced** — it would fail on this pnpm workspace and depends on an external service we
haven't signed up for. Rationale for skipping Nx Cloud in the API-first phase: solo-dev
repo, small graph, no cross-machine cache pressure; GH Actions caching (pnpm store +
`nx affected` scoping) keeps CI fast without an external dependency or token. Revisit
trigger: TS-lane wall time consistently > ~10 min or a second regular contributor.

### Workflow layout: one file per toolchain lane

```
.github/workflows/
├── ci.yml              # TS lane — everything inside the nx graph (api, web,
│                       #   mobile-rn, design-system, shared, db, api-contract)
├── mobile-android.yml  # path-filtered: apps/mobile-android/** (+ the workflow file)
└── mobile-ios.yml      # path-filtered: apps/mobile-ios/** (+ the workflow file)
```

Per infra-01 the native apps are invisible to `nx affected`, so path filters are the
only correct trigger for them — this is the deciding argument for per-lane files over
one mega-workflow. Netlify web deploy is NOT a workflow here (ticket 04 owns it; Netlify
builds on its own infrastructure). Expo EAS build lanes stay fog (map).

### ci.yml (TS lane) — API-first phase

- **Triggers**: `pull_request` + `push` to `main`. `concurrency` group per ref with
  `cancel-in-progress: true`.
- **Shared setup** (repeated per job): checkout `fetch-depth: 0`; pnpm via corepack
  (pin `packageManager` in root package.json); `actions/setup-node@v5` node 24 with
  `cache: 'pnpm'`; `pnpm install --frozen-lockfile`; `nrwl/nx-set-shas` to set the
  affected base (main for PRs, last successful run for pushes).
- **Job `main`**: `pnpm nx format:check` then
  `pnpm nx affected -t lint typecheck test build`. Integration/DB tests get Postgres
  from **Testcontainers** (per db-01/backend-07) using the ubuntu runner's Docker
  daemon — no `services:` Postgres container in the workflow, one less env divergence.
  `e2e` joins the target list only when the first e2e project exists.
- **Job `migrations`** (drift gate): `pnpm drizzle-kit check` (conflicting-migration
  detection) + `pnpm drizzle-kit generate` followed by
  `git diff --exit-code packages/db/drizzle` — fails when the Drizzle schema changed
  without a committed migration. Cheap enough to run unconditionally; scope it with
  `nx affected` plumbing only if it ever matters.
- **Job `openapi`** (spec freshness, per backend-08 which owns implementing the emit
  target): run the api spec-emit target, then
  `git diff --exit-code packages/api-contract/openapi.json` — fails when controllers
  changed but the committed spec wasn't regenerated.
- Jobs run in **parallel**; the duplicated ~40s pnpm setup is the accepted price for
  three independent failure signals (extract a composite setup action under
  `.github/actions/setup-pnpm/` when a fourth job appears).

### mobile-android.yml

`ubuntu-latest`; `actions/setup-java` (temurin, **JDK 17**);
`gradle/actions/setup-gradle` (Gradle + wrapper caching); `./gradlew build` (assemble +
unit tests). No emulator/instrumented tests in v1. Created when `apps/mobile-android`
starts (infra-01: natives arrive later per delivery order).

### mobile-ios.yml

`macos-15`; install **XcodeGen** via Homebrew; `xcodegen generate` (project.yml is the
committed source of truth, `.xcodeproj` gitignored); `xcodebuild build test -scheme
Tatame -destination 'platform=iOS Simulator,name=iPhone 16'` with
`CODE_SIGNING_ALLOWED=NO` (no signing in CI v1). Created when `apps/mobile-ios` starts.
Signing/TestFlight = mobile-CI fog.

### Staying fast as apps accumulate

1. `nx affected` keeps the TS lane sub-linear in repo size — a mobile-rn-only PR never
   builds the api.
2. Path filters keep native lanes at zero cost unless their trees change.
3. EAS/store-release pipelines stay out of the PR critical path (fog).
4. Escalation ladder when `main` slows: split test/build into parallel jobs → composite
   setup action → Nx Cloud remote cache (the revisit trigger above).
