# Architecture pattern: MV vs MVVM vs TCA

Type: grilling
Status: resolved
Blocked by: 01

## Question

Which app architecture does the iOS codebase use: plain SwiftUI "MV" (views + observable model objects, Observation framework), classic MVVM (one ViewModel per screen), or TCA? Bias: **keep it simple** — this is a parity port of already-specified screens, not a greenfield design; weigh boilerplate cost, testability of the chosen testing strategy, Swift Concurrency fit (consult `twostraws__Swift-Concurrency-Agent-Skill` and `twostraws__SwiftUI-Agent-Skill`), navigation state modeling for the persona shells (tab + stacked details + sheets), and how server state (fetch/cache/invalidate — TanStack-Query-like needs) is handled without a heavy framework. Pick one and define the per-screen conventions.

## Answer

Resolved by BOSS (AFK). Skill sources consulted: `efremidze__swift-architecture-skill` (selection guide + decision matrix), `Dimillian__Skills/swiftui-view-refactor` ("Default to MV, not MVVM"; `@State` for root `@Observable` models on iOS 17+), catalog priorities in `LLM_WIKI/wiki/tools/swift-agent-skills.md`.

### Decision: MV with `@Observable` feature models + per-shell router; repositories behind protocols; TCA and dogmatic MVVM rejected

**Why.** This app is a parity port of already-specified screens with an iOS 17 floor (Observation guaranteed, ticket 01) and CRUD-shaped server state. The selection guide's own matrix says it: state complexity is low–medium, strict unidirectional flow is not required, and TCA's payoffs (TestStore determinism, composed reducers) buy nothing here that plain models + protocol fakes don't, while costing a high learning curve and **the only third-party dependency in an otherwise zero-dep graph** — it does not clear the bar ticket 01 set. Classic one-ViewModel-per-screen MVVM is rejected as dogma: with fine-grained Observation, a mandatory ViewModel layer is ceremony on simple screens; the view-refactor skill's default (views as lightweight state expressions; reach for a model only when logic warrants) is our default too. What we keep from MVVM is its useful half: **when a screen has real logic, that logic lives in a plain observable class, not in the view.**

### Conventions

1. **Feature models.** `@MainActor @Observable final class <Feature>Model` — one per screen *flow* that has nontrivial logic (fetch + submit + validation), not one per screen by rule. Simple display screens use `@State` locals + a `.task` calling a repository directly. Models are owned by the view via `@State`, passed down explicitly, `@Bindable` where bindings are needed. No `ObservableObject`/`@Published` anywhere (iOS 17 floor).
2. **Where async work lives.** In feature models, launched from the view's `.task` / `.task(id:)` (auto-cancellation on disappear) or user-intent methods (`func submit() async`). Structured concurrency only; no detached tasks without a written reason. `@MainActor` models + `Sendable` repositories keep Swift 6 strict concurrency happy by construction (per swift-concurrency-pro/expert guidance: isolate UI state to the main actor, make crossing types Sendable).
3. **Server state (TanStack-Query-like needs) — deliberately minimal.** A small `Loadable<Value>` enum in `TatameCore` (`idle / loading / loaded(Value) / failed(ApiError)`) is the one convention for remote state in models; views switch over it for skeleton/error/content parity with the handoff. **No generalized cache/invalidation framework in v1**: repositories are async calls; where caching is actually needed (session, academy theme, belt ladder), the owning repository actor holds a session-scoped in-memory cache with explicit `refresh()`. If a real cross-screen invalidation need emerges, that's a new map ticket, not an ad-hoc framework.
4. **Navigation: one router per persona shell.** Each shell target (`AlunoShell`, `ProfessorShell`, `ResponsavelShell`) owns a `@MainActor @Observable final class <Shell>Router`: `tab: <Shell>Tab` (enum), one typed `path: [<Shell>Destination]` per tab bound to `NavigationStack`, and `sheet: <Shell>Sheet?` / `fullScreenCover` enums for modals. Destinations are value types (`Hashable` enums with payloads) — deep-link ready for the invite-flow fog item. The custom pill tab bar (DesignSystem) binds to `router.tab`; navigation is state, never imperative pushes. The app target's root composes: auth gate → role → shell router (ticket 01, decision 8).
5. **Dependency injection: protocols + SwiftUI environment, init-injection for models.** Repository protocols live in `TatameCore`, concrete implementations in `TatameAPI` (dependency direction fixed by tickets 01/02). The app composition root builds the client/repositories once and injects them via typed `@Entry` environment values; views read them with `@Environment` and pass them into feature-model initializers. **Models never read the environment themselves** — everything a model needs arrives through `init`, which is the testability seam.
6. **Testability (feeds ticket 07).** Feature models are plain classes over protocol fakes → Swift Testing unit tests per package, no UI boot, `await model.load()` then `#expect` on state. Routers are pure state → trivially testable. Networking tested at the `ClientTransport` seam (ticket 02). Views stay thin enough that view-level unit testing is not a required layer (ticket 07 decides snapshots/UI scope).
7. **File conventions per feature slice** (inside `Features/Sources/<Feature>/`): `<Feature>View.swift` (+ small subviews split per view-refactor skill), `<Feature>Model.swift` (when warranted), destinations added to the owning shell's router enums. No `Utils/`, no `Managers/` dumping grounds; shared logic graduates to `TatameCore` deliberately.

### Implications

- **Ticket 04 (auth)**: session state is a `@MainActor @Observable SessionStore` in `TatameCore`, injected via environment at the root — the auth gate and the suspension/read-only routing (`tenant.suspended` / `tenant.read_only` codes from ticket 02) switch on it. Fits convention 5 with zero new machinery.
- **Ticket 07 (testing)**: the pyramid's unit layer is fixed by conventions 6; ticket 07 decides coverage bar, snapshot/UI-test scope, and the CI wiring.
- **Guardrail**: any future "we need TCA/MVI" claim must name the concrete state-machine need (per the selection guide's flow, step 2) and lands as a map ticket — not a drive-by refactor.
