# nx project layout & module boundaries

Type: grilling
Status: resolved

## Question

What is the nx workspace layout and boundary ruleset? Decide: the `apps/` list (api, web, mobile-rn; whether Kotlin and Swift native apps live inside the nx workspace as projects, beside it in the repo, or in dedicated directories with their own tooling), the `packages/`/`libs/` taxonomy (design-system, shared types/API contracts, domain libs, config presets), naming and tagging conventions, the `@nx/enforce-module-boundaries` tag rules (e.g. apps may not import each other; design-system depends on nothing app-specific; API contract types shared to TS clients only), and pnpm workspace vs nx project inference conventions.

## Answer

Answered by BOSS from the charter (fixed decisions: nx + pnpm monorepo; NestJS API; React+Vite web; Expo RN; Kotlin/Swift native; single design-system package).

### 1. Directory layout (final)

```
/Users/gupy/apps/tatame
├── apps/
│   ├── api/              # NestJS (@nx/nest). Backend map owns its internal module layout.
│   ├── web/              # React + Vite (@nx/react, bundler=vite). MUI skinned by design-system.
│   ├── mobile-rn/        # Expo React Native (@nx/expo).
│   ├── mobile-android/   # Kotlin, own Gradle project. OUTSIDE the nx task graph.
│   └── mobile-ios/       # Swift, own Xcode project. OUTSIDE the nx task graph.
├── packages/
│   ├── design-system/    # @tatame/design-system — Lumira tokens, theme engine
│   │                     #   (3-color white-label palette), MUI theme, RN theme primitives.
│   └── shared/           # @tatame/shared — API contracts: DTO/enum types, zod-or-class
│                         #   validators as decided by the backend map, generated OpenAPI types.
├── docker-compose.yml    # root-level (ticket 02 owns its evolution)
└── docs/specs/           # to-spec specs, indexed in root README checklist
```

No `libs/` directory: the nx TS preset already uses `packages/`, and two libraries do not
justify a deeper taxonomy. Domain libs (e.g. graduation rules engine) are NOT created now;
if one earns extraction later it lands in `packages/` with the same tagging scheme —
premature slicing of the NestJS API into nx libs is explicitly rejected; the backend map
owns internal module layout inside `apps/api`.

### 2. Native apps outside the nx graph

`apps/mobile-android` and `apps/mobile-ios` live in the repo (one clone = whole product,
matching the README parity checklist) but are invisible to nx and pnpm by construction:
they contain no `package.json` and no `project.json`, so pnpm's `apps/*` glob and nx
project inference both skip them. Rules:

- Own build systems: Gradle wrapper (`./gradlew`) and Xcode project respectively. Their
  toolchains are never invoked by nx targets in the API-first phase.
- Each keeps its own `README.md` (build/run instructions); the root README checklist is
  the single parity tracker across the 4 clients (charter rule 6).
- Optional later: a thin `project.json` with `nx:run-commands` wrapping `./gradlew
  assembleDebug` / `xcodebuild` so `nx run mobile-android:build` works and CI lanes are
  uniform. Deferred until mobile CI lands (see map fog); do not add now.
- They consume `@tatame/shared` conceptually (same specs, same OpenAPI source of truth)
  but never via node_modules — Kotlin/Swift types come from the same OpenAPI document
  via their own generators, wired when those apps start.

This settles the map's fog item "How Kotlin and Swift projects sit inside (or beside)
the nx workspace" — graduated here, removed from fog.

### 3. Module-boundary rules (@nx/enforce-module-boundaries)

Two tag dimensions, assigned at generation time:

| Project                 | Tags                        |
|-------------------------|-----------------------------|
| apps/api                | `type:app`, `scope:api`     |
| apps/web                | `type:app`, `scope:client`  |
| apps/mobile-rn          | `type:app`, `scope:client`  |
| packages/design-system  | `type:lib`, `scope:design`  |
| packages/shared         | `type:lib`, `scope:shared`  |

depConstraints (ESLint flat config at root, rule active once @nx/eslint is installed
with the first generated app):

- `scope:api`     → may depend only on `scope:shared`. The API never imports
                    design-system or any client code.
- `scope:client`  → may depend on `scope:shared` and `scope:design`.
- `scope:design`  → may depend on nothing internal (tokens/UI need no DTOs; keeps the
                    design system portable to RN and, as a token export, to native apps).
- `scope:shared`  → may depend on nothing internal (leaf; contracts import no one).
- `type:app`      → may never be imported by anyone (apps are not importable; apps never
                    import apps).

Net effect: shared is the only package both sides touch; frontend code can never leak
into the API and vice versa.

### 4. Plugins to adopt

Now: keep exactly what the template has — `@nx/js/typescript` inference plugin. The
empty workspace is sufficient; nothing else is installed until it has a consumer.

At generation time (per delivery order, API first):
- `@nx/nest` when generating `apps/api`
- `@nx/react` + `@nx/vite` when generating `apps/web`
- `@nx/expo` when generating `apps/mobile-rn`
- `@nx/eslint` arrives with the first app; that is when the boundary rules in §3 are
  written down and enforced.

No Nx Cloud / remote-caching decision here — that belongs to ticket 03.

### 5. Naming & import paths

- npm scope `@tatame`: `@tatame/design-system`, `@tatame/shared`. Apps are
  `@tatame/api`, `@tatame/web`, `@tatame/mobile-rn` (private, never published).
- Rename the template root package `@org/source` → `@tatame/source` and the
  `customConditions` entry in `tsconfig.base.json` to match (`@tatame/source`), since
  the TS preset resolves workspace source via that condition.
- nx project names = directory names (`api`, `web`, `mobile-rn`, `design-system`,
  `shared`).

### 6. pnpm + TS project-references conventions (kept as-is)

- pnpm workspaces (`packages/*`, `apps/*`) are the source of the dependency graph: an
  app depends on a package by declaring `"@tatame/shared": "workspace:*"` in its
  `package.json`; nx infers the project graph from that. No `paths` aliases in
  tsconfig — resolution goes through package.json exports + the custom condition.
- TypeScript project references stay: `tsconfig.base.json` is `composite` with
  `emitDeclarationOnly`; each package ships `tsconfig.lib.json`; apps/packages list
  their workspace deps under `references`; root `tsconfig.json` aggregates. `typecheck`
  and `build` targets come from the `@nx/js/typescript` plugin already configured.

### Implications for open tickets

- **02 (docker)**: only `apps/api` is a containerization candidate; web/mobile-rn dev
  servers run on host; native apps are irrelevant to compose. Compose file stays at
  repo root.
- **03 (CI)**: `nx affected` covers api/web/mobile-rn/design-system/shared. Because the
  native apps are outside the graph, CI needs path-filtered lanes
  (`apps/mobile-android/**`, `apps/mobile-ios/**`) for Gradle/Xcode when those apps
  start — nx affected will not see them.
- **05 (env)**: per-app env files live in each app directory; `packages/*` are
  env-free by the boundary rules (config is injected by apps); native apps use their
  own mechanisms (Gradle properties / xcconfig), documented separately.
