# Dependency injection: Hilt vs Koin

Type: grilling
Blocked by: 01
Status: resolved

## Question

Hilt or Koin (or manual DI) for the Android app? Weigh: compile-time safety vs startup/runtime resolution, KSP processing cost in the chosen AGP/Kotlin setup, Compose + ViewModel integration (`hiltViewModel()` vs `koinViewModel()`), multi-module scaling if the Gradle layout is modular, testability (test doubles, instrumented test overrides), and team/agent ergonomics for a parity-driven codebase. Pick one and define the module/scope conventions.

## Answer

Decision by BOSS (AFK), per ticket 01's mandate to verify Hilt's toolchain compatibility first and weigh the single-module layout.

### Decision: Koin 4.1.x

**Hilt compatibility check (the ticket-01 precondition) — verified, and the finding argues against it.** Hilt/Dagger 2.59 (Jan 2026) added AGP 9 support via KSP, and 2.60.x is current — so Hilt is *admissible* on our AGP 9.0.1 / Kotlin 2.3.20 / KSP 2.3.6 stack. But the rollout record is the real signal: 2.59 shipped broken on AGP 9.0 (google/dagger#5099 — generated code referenced `ComponentTreeDeps` missing from the published runtime artifacts; community workaround was "downgrade to 2.58"), followed by rapid 2.59.1/2.59.2 patch releases. The Hilt Gradle plugin does bytecode transforms coupled to AGP internals, so **every future AGP/Kotlin/KSP bump on our deliberately-current toolchain re-runs that compatibility roulette**. Koin has no processor and no Gradle plugin — zero exposure to that failure class.

**Weighing (per the question's axes):**

- *Compile-time safety vs runtime resolution*: Hilt's graph validation at build time is its strongest card. Mitigation on Koin: `verify()` graph verification as a mandatory JVM unit test (Koin 4.x Module verification API) — same class of error caught pre-merge, just in the test phase instead of the compile phase. Bonus horizon: the Koin Compiler Plugin (1.0.0-RC1, Apr 2026) brings true compile-time checking of `get<T>()`/`koinViewModel<T>()` without codegen; adopt when stable, not at RC.
- *KSP processing cost*: Hilt adds a KSP round + plugin transform to every build of the single `:app` module (i.e., every build, always). Koin DSL adds zero build-time work. We deliberately skip **koin-annotations** too — the plain DSL keeps the KSP surface at exactly what ticket 01 shipped.
- *Compose/ViewModel*: parity — `koinViewModel()` (koin-androidx-compose, first-class in Koin 4.1 with Compose 1.8 alignment) vs `hiltViewModel()`. No winner.
- *Multi-module scaling*: Hilt's aggregation shines across many Gradle modules; ticket 01 fixed a **single `:app` module** (package-by-feature, split later) — the advantage is void today, and Koin scales to a later split fine (one Koin module per Gradle module).
- *Testability*: Koin test overrides are its home turf — `koin-test` with per-test module overrides, `loadKoinModules` for instrumented swaps, no `@UninstallModules`/component-rebuild ceremony. MockWebServer-backed fakes (ticket 07) slot in by overriding the network module's base URL/client.
- *Team/agent ergonomics*: Koin modules are plain Kotlin an agent can read and edit locally; no generated components, no "why is the binding missing" processor archaeology. For a parity-driven codebase mirroring the RN app, the lighter mental model wins.

**Rejected:** *Hilt* — admissible but all of its differentiating value (multi-module aggregation, compile-time graph) is either void (single module) or replicable (verify() test), while its costs (KSP round, AGP-coupled plugin with a fresh history of breakage) are certain. *Manual DI* — viable at this size but ViewModel factories, Compose plumbing, and test overrides accrete boilerplate that Koin eliminates for one small dependency.

### Conventions

- **Artifacts** (version catalog, Koin BOM 4.1.x): `koin-android`, `koin-androidx-compose`; tests: `koin-test-junit4` (JVM), `koin-android-test` (instrumented). No `koin-annotations`, no compiler plugin yet.
- **Bootstrap**: `startKoin { androidContext(...); modules(appModules) }` in `TatameApplication`. `appModules = coreModules + featureModules`, one flat list in `core/di/AppModules.kt`.
- **Module layout mirrors package-by-feature (ticket 01)**: `core/di/` hosts `networkModule` (Json, bare + authed OkHttp, Retrofit, generated API interfaces, `apiCall` wrapper — ticket 02), `sessionModule` (TokenStore impl, SessionTokenProvider, auth-state holder — ticket 04); each feature package owns `feature/<name>/di/<Name>Module.kt` (its ViewModels + feature-local repos).
- **Scope conventions**: `single` for stateless infra (network stack, stores, repositories); `viewModel { }` for every ViewModel; `factory` for per-use stateful helpers (e.g., a scan session, ticket 05). **No custom Koin scopes for the user session**: session lifecycle is modeled as state inside a `single` session holder (flow-based, reset on logout) — simpler than scope teardown and matches how auth state propagates to the UI (ticket 04).
- **Mandatory test**: a JVM unit test running Koin `verify()` over `appModules` — the graph-safety gate; ticket 07 records it as part of the "tested" definition for every feature slice.

### Implications

- **Ticket 04**: session holder = Koin `single` exposing a `StateFlow`; logout resets state, not the graph.
- **Ticket 05**: camera/scanner collaborators registered `factory` in `feature/checkin/di`.
- **Ticket 07**: `verify()` test mandatory; per-test overrides via koin-test module override; instrumented doubles via `loadKoinModules`; networking fakes = override network module against MockWebServer.
