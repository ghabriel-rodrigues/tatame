# API contract style

Type: research + grilling
Status: resolved

## Question

What API contract style should the backend expose to its four clients (React web, Expo RN, Kotlin, Swift) — REST + OpenAPI (with generated typed clients per platform) or a tRPC-like end-to-end-typed approach? Research the options in the NestJS context (OpenAPI decorators + codegen for TS/Kotlin/Swift vs ts-rest/tRPC-style, which only benefits the TS clients), then decide — including validation conventions (class-validator vs zod DTOs), error-response shape, and pagination/filtering conventions. Note that Kotlin and Swift native clients make platform-neutral contracts (OpenAPI) structurally attractive; the decision must serve all four clients equally.

## Answer

Decision by BOSS (charter bias confirmed by research). Wiki page consulted: `LLM_WIKI/raw/skills/nestjs/rules/api-versioning.md`; validation pages `security-validate-all-input.md`/`api-use-pipes.md` family assumed (class-validator + global ValidationPipe is the Nest-native path).

### Decision: REST + OpenAPI generated from `@nestjs/swagger`

The contract is a committed OpenAPI 3.0.x document generated from the NestJS app (`@nestjs/swagger` decorators + its CLI plugin, which infers schemas and required/optional from the class-validator DTOs, keeping one source of truth). The spec artifact is the interface all four clients build against.

**Rejected alternatives:**
- **tRPC / ts-rest**: end-to-end types only reach the two TS clients; Kotlin and Swift would need a hand-maintained parallel contract — guaranteed drift across the exact clients where parity is hardest. Violates "serve all four clients equally".
- **GraphQL**: schema is platform-neutral, but adds resolver/N+1 discipline, complicates RBAC-per-field on a 6-persona surface, and Kotlin/Swift codegen (Apollo) is heavier than REST codegen for a CRUD-shaped domain. No client need (dashboards are fixed screens, not ad-hoc queries) justifies the cost.
- **Nestia**: attractive (OpenAPI 3.1 from pure types) but a smaller ecosystem bet; `@nestjs/swagger` is first-party and sufficient.

### Validated toolchain (spec → clients)

| Target | Tool | Notes |
|---|---|---|
| Spec | `@nestjs/swagger` + CLI plugin | Emits OpenAPI 3.0.x; spec committed at `packages/api-contract/openapi.json`; CI check regenerates and fails on diff |
| Web + RN (TS) | `openapi-typescript` + `openapi-fetch` | Types-only generation, zero-runtime-bloat fetch wrapper; wraps cleanly in TanStack Query; output → `packages/api-client` |
| Kotlin (Android) | `openapi-generator` generator `kotlin`, library `jvm-retrofit2` + kotlinx-serialization | Mature template; avoid the `multiplatform`/ktor templates (pinned to dated Ktor, known datetime issues) — the Android app is native JVM, doesn't need KMP |
| Swift (iOS) | `apple/swift-openapi-generator` (SPM build plugin) | First-party Apple; supports OpenAPI 3.0 and 3.1, so the 3.0.x spec is safe |

All three generators consume 3.0.x, so we pin the spec to 3.0.x until every consumer is proven on 3.1. Codegen wiring (nx targets, CI freshness check) is split into ticket 08.

### Conventions

- **Validation**: class-validator + class-transformer DTOs with a global `ValidationPipe({ whitelist: true, transform: true })`. zod/nestjs-zod rejected: the swagger CLI plugin reads class-validator natively; two schema languages = drift.
- **Versioning**: NestJS built-in URI versioning (`VersioningType.URI`, `defaultVersion: '1'`) → all routes `/v1/...`. URI (not header) because generated native clients and support debugging see the version in every URL. Breaking changes require a new `@Version` route, per the wiki page's deprecation-header pattern.
- **Error envelope**: RFC 9457 `application/problem+json` via one global exception filter. Shape: `{ type, title, status, detail, instance, code, errors? }` — `code` is a stable machine string from a shared registry (see `packages/shared`, ticket 01), `errors` is the field-level array on 422. All clients branch on `status` + `code`, never on `title` text (which may be localized later).
- **Pagination**: offset-based, `?page=1&limit=20` (max 100), envelope `{ data: T[], meta: { page, limit, total } }` on every list endpoint. Chosen over cursor: admin tables (MUI DataGrid) want totals and page jumps, and one uniform convention across 4 generated clients beats per-endpoint optimality. If a hot feed ever needs cursors, it's an additive per-endpoint change.
- **Misc**: JSON only; camelCase fields; timestamps ISO-8601 UTC; money as integer cents + currency (defers to database ticket 05); IDs opaque strings.

### Implications for tickets 02/03

- **02 (authn)**: auth is `Authorization: Bearer` declared as OpenAPI `securitySchemes.bearerAuth` so every generated client gets a first-class auth hook (Apple and Retrofit generators both support middleware/interceptor auth injection). Login/refresh/invite endpoints live under `/v1/auth/*` and `/v1/public/*`; 401 uses the problem+json envelope with `code: "auth.invalid_credentials" | "auth.token_expired"` so clients can distinguish re-login from refresh.
- **03 (authz)**: 403 problem+json with stable `code` per denial class (e.g. `authz.forbidden_role`, `tenant.suspended`, `tenant.read_only` for the delinquency read-only mode — charter rule). Persona surfaces appear as OpenAPI tags (`aluno`, `professor`, `admin`, `responsavel`, `platform`, `public`), which lets each client generate only the slice it needs.

Sources: [apple/swift-openapi-generator](https://github.com/apple/swift-openapi-generator), [openapi-generator kotlin generator docs](https://github.com/OpenAPITools/openapi-generator/blob/master/docs/generators/kotlin.md), [Speakeasy: OpenAPI with NestJS](https://www.speakeasy.com/openapi/frameworks/nestjs/), [openapi2ktor (ktor template caveats)](https://github.com/dshatz/openapi2ktor).
