# Authorization design (RBAC, tenant scoping, impersonation)

Type: grilling
Status: resolved
Blocked by: 02

## Question

What is the authorization design? Decide: the RBAC guard strategy in NestJS (roles/permissions model, decorators + guards, per-persona role set including platform roles Owner/Suporte/Financeiro), how tenant scoping is injected and enforced on every request (consistent with the database map's tenant-isolation strategy), hard rules such as "professor has no financial access" and guardian-only access to own dependents, enforcement of academy status (suspension blocks access; delinquency → read-only mode), and the platform "entrar como admin" impersonation flow — how a platform user assumes an academy-admin context, how the impersonated token is marked, and how every impersonated action is audited.

## Answer

Answered as BOSS from the charter (`agents/boss.md`). Wiki page consulted: `LLM_WIKI/raw/skills/nestjs/rules/security-use-guards.md` (global guards + declarative metadata decorators, `@Public()` override pattern). Consumes ticket 02's token claims (`sub/sid/mem/ten/rol/imp`) and db-02's RLS/`withTenant` decision.

### Decision: layered global guard chain + metadata decorators; RLS as the isolation backstop

**Roles model.** Two disjoint role sets, both enumerated in `packages/shared` (per ticket 01):

- Academy roles (per membership, per tenant): `aluno | professor | admin | responsavel`.
- Platform roles (membership with `ten: null`): `owner | support | finance`.

A request carries exactly ONE active role — the `rol` claim of the verified token (ticket 02). Multi-persona users switch via `/v1/auth/switch`; guards never union roles across memberships.

**Global guard chain**, registered in order via `APP_GUARD` (order = registration order):

1. **`JwtAuthGuard`** — verifies the bearer JWT (`@Public()` bypass for login/refresh/reset/invite endpoints and Stripe webhooks). On success it populates the request context in `nestjs-cls` (AsyncLocalStorage, store opened by the CLS middleware per ticket 01): `{ userId, sessionId, membershipId, tenantId, role, impersonatorId? }`. This CLS store is the single source `TenantDb.withTenant` (db-02) reads to `SET LOCAL app.tenant_id` — no handler ever passes `academyId` by hand, and an unset context fails closed at the RLS layer.
2. **`AcademyStatusGuard`** — skipped for platform tokens (`ten: null`) and `@Public()` routes. Resolves academy status via the tenancy module's exported query service (in-process TTL cache, 30 s — status changes are rare and platform-driven):
   - `Ativa`/`Trial` → pass.
   - `Inadimplente` (read-only mode) → allow `GET/HEAD`; reject mutating methods with `403 code: "tenant.read_only"` — EXCEPT routes marked `@BypassReadOnly()` (paying the overdue bill must stay possible: aluno/responsável wallet payment endpoints and the admin SaaS-billing endpoints carry it).
   - `Suspensa` → reject everything with `403 code: "tenant.suspended"` except `GET /v1/auth/me` and `POST /v1/auth/logout` (clients need to render the blocking screen and sign out — rn-04 alignment).
   - Sessions are NOT revoked by status changes (ticket 02); reactivation is instant.
3. **`RolesGuard`** — reads `@Roles(...roles)` metadata (handler overrides class). **Default deny**: a non-`@Public()` route with no roles metadata → 403; routes intentionally open to any authenticated user (e.g. `/v1/auth/me`, `/v1/auth/switch`) carry `@AnyRole()`. Denial → `403 code: "authz.forbidden_role"`. Persona-scoped controllers (ticket 01) put `@Roles` at class level, so the persona surface and the role bind one-to-one: `/v1/professor/*` controllers are `@Roles('professor')`, `/v1/admin/*` → `@Roles('admin')`, `/v1/platform/*` → platform roles (`finance` only on billing/repasses controllers; `owner` on team/integrations).
4. **`PermissionsGuard`** — reads `@RequiresPermission(key)` metadata; only present on the **toggleable subset** (below). Resolves the toggle from `academy_permissions` via a cached service; missing row = code default. Denial → `403 code: "authz.permission_disabled"`.

**Hard rules vs toggles.** Hard rules are structural, not data: the billing module simply HAS no professor controller (ticket 01), so "professor has no financial access" cannot be toggled on — the toggleable `professor.payments.view_class` (below) only unlocks a read-only paid/overdue status flag on the professor's own class-roster endpoint, never amounts, academy financials, or the billing surface. Guardian-only-own-dependents and aluno-only-own-data are **ownership checks, not guard checks**: `/v1/me/*` and `/v1/responsavel/*` services filter by `ctx.userId` (`guardian_id = ?`, `student.user_id = ?`) inside the tenant-scoped `withTenant` transaction; a foreign dependent id is a 404, not 403 (no existence leak). Ticket 07 must cover both with e2e tests.

### Toggleable permissions (`academy_permissions`) — the admin-17 screen

Table (tenant-scoped, RLS): `academy_permissions(tenant_id, role, permission_key, enabled, updated_by, updated_at)`, unique `(tenant_id, role, permission_key)`; absent row = default. Keys (constants in `packages/shared`; PT-BR labels are client copy):

| Key | Handoff label | Default |
|---|---|---|
| `professor.attendance.record` | registrar presença | on |
| `professor.graduation.update` | atualizar graduações | on |
| `professor.payments.view_class` | ver pagamentos das turmas | **off** |
| `professor.invites.create` | gerar convite | on |
| `professor.events.create` | criar eventos | **off** |
| `aluno.checkin.self` | check-in | on |
| `aluno.agenda.view` | agenda | on |
| `aluno.store.access` | loja | on |
| `responsavel.dependents.register` | cadastrar dependentes | on |
| `responsavel.payments.pay` | pagar | on |
| `responsavel.events.confirm` | confirmar eventos | on |

Everything else is role-fixed (admin/platform surfaces are never toggleable). `GET /v1/auth/me` returns the resolved toggle map for the active membership (ticket 02) so clients hide disabled surfaces; the server-side guard remains the enforcement. Admin management endpoint: `GET/PUT /v1/admin/permissions` (tenancy module, `@Roles('admin')`).

### Impersonation ("entrar como admin")

- **Mint**: `POST /v1/platform/academies/:id/impersonate` — tenancy module platform controller, `@Roles('owner','support')` (`finance` cannot impersonate). Flow, in one unit of work: (1) write the impersonation audit record (platform-pool global table, db ticket 06: impersonator, target academy, session id, started_at), (2) create a NEW session with `impersonator_user_id` set (ticket 02 sessions table) and a **1 h absolute cap** (`expires_at`; access tokens stay 15 min, refresh allowed within the hour), (3) return the token pair. Claims: `ten = target academy`, `rol: "admin"`, `imp: true`, `act: { sub: impersonatorUserId }` (RFC 8693 actor-claim style).
- **RLS still tenant-scoped** (db-02): the impersonated session runs on the regular `tatame_app` pool with `app.tenant_id = target` — the support user sees exactly what the academy admin sees, never more. The platform pool is not involved after minting.
- **Banner**: clients read `imp: true` (and `act.sub`) from the token / `me` response and render the persistent "você está como admin de X" banner. Ending impersonation = `POST /v1/auth/logout` on the impersonated session; the client's platform session was never touched (separate token pair, kept client-side — noted for web-04).
- **Audit of actions**: a global `AuditInterceptor` in `common` logs every **mutating** request (method, path, resource ids, outcome) when `impersonatorId` is present in CLS, appended to the audit log (shape owned by db ticket 06). Reads are not logged in v1 (volume; the session start/end records already bound the window).
- **Restrictions**: an `imp` token is rejected on `/v1/auth/switch`, `/v1/auth/password/*`, `/v1/auth/totp/*`, and the impersonate endpoint itself (no chaining) → `403 code: "authz.impersonation_restricted"` (small guard clause inside `JwtAuthGuard`'s CLS step or a dedicated `@DenyImpersonated()` on those handlers — implementer's choice, codes fixed here).

### Problem+json codes added to the registry (ticket 04)

`authz.forbidden_role`, `authz.permission_disabled`, `authz.impersonation_restricted`, `tenant.suspended`, `tenant.read_only`.

### Enforcement meta-test (mirrors db-02's RLS meta-test)

A CI test reflects over all registered routes and asserts every handler is `@Public()` OR covered by `@Roles`/`@AnyRole` — new endpoints cannot ship without an explicit authz stance. Second assertion: no route under `/v1/professor/*` is served by the billing module.

### Implications

- **05 (Stripe)**: webhook endpoints `@Public()` + signature verification (never bearer); payment-creation endpoints carry `@BypassReadOnly()`; repasse withholding for delinquents is billing-module logic, not a guard.
- **06 (Resend)**: optional "impersonation started" notification to the academy owner is a product decision — not in v1 scope; no other coupling.
- **07 (tests)**: mandatory e2e — professor hitting any `/v1/admin/*` or billing route → 403; toggle off → `authz.permission_disabled`; guardian fetching a foreign dependent → 404; suspended academy → 403 except me/logout; read-only blocks POST but not `@BypassReadOnly` payment; impersonated mutation writes an audit row; `imp` token on `/v1/auth/switch` → 403; plus the route-metadata meta-test above.
- **08 (codegen)**: `securitySchemes.bearerAuth` + per-tag persona slices already decided in 04; the 403 code registry above must land in the committed spec's error-schema docs.
