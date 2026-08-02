# Networking & API client

Type: research
Status: resolved
Blocked by: 01

## Question

Which HTTP stack talks to the NestJS backend: plain URLSession + Codable (async/await, custom thin client) vs Alamofire — is Alamofire worth the dependency in an async/await world? Cover error modeling, request building/interception (auth header injection, refresh hooks), and testability (URLProtocol stubbing). Also evaluate OpenAPI codegen for Swift from the backend's spec (apple/swift-openapi-generator with URLSession transport, vs openapi-generator's swift5, vs hand-written DTOs) — generated-code ergonomics, Codable fidelity, and how regeneration is versioned inside the Xcode/SPM setup. Recommend the stack and the codegen workflow.

## Answer

Resolved by BOSS (AFK, charter + ticket 01 + backend ticket 04). The backend contract is already fixed: REST + OpenAPI 3.0.x committed at `packages/api-contract/openapi.json`, `apple/swift-openapi-generator` already validated as the Swift consumer (`.scratch/backend/issues/04-api-contract-style.md`).

### Decision: apple/swift-openapi-generator as SPM build plugin, URLSession transport, zero third-party deps

All of it lives in `Packages/TatameAPI` (per ticket 01).

1. **HTTP stack: URLSession via `swift-openapi-urlsession` transport.** Alamofire is **rejected**: on an iOS 17 floor with async/await URLSession, Alamofire's remaining value (request chaining, reachability, response validation DSL) is either built-in or trivially thin, and it would violate the zero-third-party-deps bias for no capability we lack. The Apple OpenAPI packages (`swift-openapi-runtime`, `swift-openapi-urlsession`, generator plugin) are first-party Apple and don't count against that bias the way community deps do.
2. **Codegen: SPM build plugin, generation at build time** (BOSS bias confirmed):
   - `OpenAPIGenerator` build plugin attached to the `TatameAPI` target; inputs are `Sources/TatameAPI/openapi.json` + `Sources/TatameAPI/openapi-generator-config.yaml` (`generate: [types, client]`). Generated code lands in the build dir — never in git.
   - **Cross-world sync**: the plugin needs the spec inside the target, but the source of truth is `packages/api-contract/openapi.json` in the nx world. The **committed artifact crossing the boundary is the spec copy**, not generated Swift: a documented sync step (`rtk cp packages/api-contract/openapi.json apps/mobile-ios/Packages/TatameAPI/Sources/TatameAPI/openapi.json`, wrapped in a tiny script + README note) refreshes it as a normal reviewed diff. This honors the same principle as Android's committed `LumiraTokens.kt` and our committed `DesignTokens.swift` — *the Xcode build never depends on an nx target having run* — while keeping generated sources out of git. Committing thousands of lines of generated client would add review noise without adding hermeticity: the committed spec already provides it.
   - **Slice filtering**: the generator config's `filter` limits generation to the tags this app needs (`auth`, `public`, `aluno`, `professor`, `responsavel` — persona tags fixed by backend ticket 04), keeping generated surface and build time down. Admin/platform tags excluded until scope changes.
   - `openapi-generator`'s `swift5`/`swift6` generator rejected (community templates, URLSession-callback-era ergonomics, worse Swift 6 concurrency fit); hand-written DTOs rejected (guaranteed drift across 4 clients — the exact failure the contract decision exists to prevent).
   - **Fallback, pre-agreed**: if the plugin proves flaky in practice (trust-prompt friction is handled: CI passes `-skipPackagePluginValidation`, humans click "Trust & Enable" once), we switch to the same generator invoked as a **command plugin with committed output** — config and spec are identical, so the fallback is a mechanical change recorded as a map amendment, not a re-decision.
3. **Client architecture inside TatameAPI**:
   - Generated `Client` is wrapped, never exposed: `TatameAPI` exports **repository implementations** conforming to protocols declared in `TatameCore` (dependency direction from ticket 01: `TatameAPI → TatameCore`; features import the protocol, the app composes the concrete). Features never see `Components.Schemas.*` types — repositories map them to domain models in `TatameCore`. Mapping is thin and boring by design.
   - One `TatameClientFactory` builds the `Client` with `URLSessionTransport` + middleware stack + server URL from build configuration (dev/staging/prod via `.xcconfig`, wired in `project.yml`).
4. **Auth middleware** (`ClientMiddleware` from `swift-openapi-runtime`):
   - `AuthMiddleware.intercept` injects `Authorization: Bearer <access>` from an in-memory token store, calls `next`, and on **401 + `code: "auth.token_expired"`** (problem+json contract from backend ticket 04) performs **retry-once**: await refresh, re-inject, replay the request. Any other 401 (`auth.invalid_credentials`) propagates as session-invalid → logout path (ticket 04's scope).
   - **`TokenRefreshCoordinator` is an actor** providing single-flight refresh: concurrent 401s `await` the same in-flight refresh `Task` instead of stampeding the refresh endpoint; refresh failure fails all waiters and signals session death once. Swift 6 strict concurrency makes the actor the natural (and compiler-enforced) shape.
   - Token placement (primitive fixed here, lifecycle is ticket 04's): **access token in memory only** (inside the actor); **refresh token in Keychain** with `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` (not synced, not restored to new devices). Keychain access code lives in `TatameCore` (per ticket 01), consumed by the coordinator.
5. **Error mapping — one typed `ApiError`**, thrown by every repository:
   - `ProblemDetails: Decodable` mirrors the backend envelope `{ type, title, status, detail, instance, code, errors? }`.
   - `enum ApiError: Error { case unauthorized(code: String); case forbidden(code: String); case validation(fields: [FieldError]); case notFound(code: String); case conflict(code: String); case server(status: Int, code: String?); case network(URLError); case decoding(Error); case unknown(status: Int) }` — branching is always on HTTP status + stable `code` string (registry from `packages/shared`), never on `title` text, per the contract. Tenant-state codes (`tenant.suspended`, `tenant.read_only`) surface through `forbidden(code:)` so ticket 04 can route them to the blocked/read-only UX.
   - A single `ErrorMappingMiddleware`/helper converts generated `.undocumented` responses and transport errors into `ApiError`, so features handle exactly one error type.
6. **Testability**: primary seam is **`ClientTransport`** — a `MockTransport` (canned `HTTPResponse`/`HTTPBody` per operation) injected in place of `URLSessionTransport` lets middleware, refresh single-flight, and error mapping be tested as plain Swift Testing package tests, fully deterministic, no app boot, no URLProtocol machinery. URLProtocol stubbing is **not needed** (that technique targets the URLSession layer we no longer hand-roll); keep it only if we ever must test `URLSessionTransport` configuration itself. Feature-level tests fake the repository protocol instead (ticket 06/07 territory).

### Implications

- **Ticket 04 (auth)**: consumes `AuthMiddleware` + `TokenRefreshCoordinator` as given; decides session restoration, academy binding, logout/suspension UX, and how session state reaches SwiftUI. The Keychain primitive (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`, device-only) is fixed here and must not be relitigated there.
- **Ticket 07 (testing)**: `MockTransport` + repository-protocol fakes are the two networking seams the pyramid builds on.
- **Ticket 08 (CI)**: build must run `rtk xcodebuild ... -skipPackagePluginValidation`; add a freshness check diffing the spec copy against `packages/api-contract/openapi.json`.
