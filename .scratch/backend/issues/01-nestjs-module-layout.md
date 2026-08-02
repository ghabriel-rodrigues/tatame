# NestJS module/domain layout

Type: grilling
Status: resolved

## Question

How should the NestJS application be organized into modules/domains? Decide: the module list (e.g. auth, orgs/tenancy, users, turmas, attendance, graduation, events, billing, plans, store, notifications, invites, platform-admin), whether to layer domain/application/infrastructure inside each module or keep flat NestJS convention (controller/service/repository), where cross-cutting concerns live (tenant context, RBAC guards, validation pipes, Stripe/Resend clients), how the six persona surfaces map onto modules (shared modules + persona-scoped controllers vs per-persona modules), and the dependency rules between modules that nx boundaries will later enforce.

## Answer

Answered as BOSS from the charter (`agents/boss.md`). Wiki pages consulted: `LLM_WIKI/raw/skills/nestjs/rules/arch-feature-modules.md` (feature-module organization, CRITICAL), `arch-module-sharing.md` (singleton sharing, `@Global()` only for config/logging/db), `arch-use-events.md` (event-emitter for cross-domain side effects), `arch-avoid-circular-deps.md` (events or shared module to break cycles), `api-versioning.md` (consumed by ticket 04).

### Decision: modular monolith, one Nest app, domain feature modules

One NestJS application (`apps/api` in the nx workspace). No microservices, no separate app per persona — six persona surfaces share one domain model and one Postgres; splitting would relitigate a fixed decision (Node+NestJS monorepo) and multiply the 4-client parity burden.

**Module tree** (`apps/api/src/`):

```
src/
├── modules/
│   ├── identity/       # users, roles, sessions, invites (public convite flow controllers live here)
│   ├── tenancy/        # academies (tenant CRUD, status, white-label config), platform (SaaS-owner surface, impersonation)
│   ├── enrollment/     # students, guardians (1→N children), classes (turmas)
│   ├── attendance/     # check-ins, live codes, manual roll call
│   ├── graduation/     # belts, degrees, immutable history, per-academy rules (data-driven, non-BJJ-ready)
│   ├── billing/        # BOTH plan levels (platform→academy, academy→student), charges, Stripe webhooks
│   ├── events/         # events + registrations (per-child confirmation)
│   ├── store/          # products, orders (payment via billing)
│   ├── notifications/  # in-app feed + email fan-out (Resend seam); listener-only module
│   └── reports/        # read-only aggregations for admin/platform dashboards
├── common/             # cross-cutting, no domain logic: guards (auth, rbac, tenant), pipes, exception filters,
│                       # interceptors, decorators (@CurrentUser, @CurrentTenant), problem+json filter (ticket 04)
├── infra/              # shared adapter modules: database (repository base + ORM wiring), stripe (client),
│                       # resend (client), config, logger. Each a dedicated exported module (arch-module-sharing).
└── app.module.ts
```

Naming: `enrollment` over `students` because it owns the student↔guardian↔turma triangle; `tenancy` owns both academy CRUD and the platform surface because they are two views of the same tenant lifecycle (Ativa/Trial/Inadimplente/Suspensa).

### Internal layout per module: flat Nest convention + repository seam

`<module>/{<module>.module.ts, controllers/, services/, repositories/, dto/, entities/, events/}`. **No** domain/application/infrastructure layering inside modules — full hexagonal is ceremony this team size doesn't pay back, and the wiki's CRITICAL guidance is feature-module organization, not onion layers. The one mandatory seam is the **repository class per aggregate** (services never touch the ORM directly): the database map's ORM choice (database ticket 01, still open) must stay swappable behind `repositories/` without touching services. Entities folder holds ORM models and stays private to the module; only repositories and DTOs cross the module boundary via exported services.

### Persona mapping: shared domain modules + persona-scoped controllers

Per-persona modules are rejected — they would duplicate domain logic six ways and guarantee drift. Instead each domain module exposes multiple controllers, one per persona surface that touches it, with route prefixes making the audience explicit:

- `attendance/controllers/`: `student-checkin.controller.ts` (`/v1/me/check-ins`), `professor-live.controller.ts` (`/v1/professor/live-codes`), `admin-attendance.controller.ts` (`/v1/admin/attendance`).
- RBAC guard + route prefix together enforce the surface (professor controllers never expose money — charter rule; billing module simply has no professor controller).
- Platform-persona controllers live in the module that owns the data (`tenancy/controllers/platform-academies.controller.ts`, `billing/controllers/platform-plans.controller.ts`), under `/v1/platform/*`.
- Public convite flow: unauthenticated controllers in `identity` (`/v1/public/invites/:token`), guarded by token validity not sessions.

### packages/shared: contracts are generated, not hand-shared

- The API contract for all 4 clients is the **OpenAPI spec** (ticket 04), generated from the server DTOs. Server DTOs (class-validator classes) live inside `apps/api` and are never imported by clients.
- `packages/api-client`: **generated** TS client (from the spec) consumed by web + RN. Kotlin/Swift generate into their own app trees from the same spec artifact.
- `packages/shared`: only hand-written cross-runtime invariants that are not API shapes — role-name constants, permission keys, well-known event/error type codes. Keep it near-empty; anything that smells like a DTO goes through the spec instead.

### Cross-module communication rules (future nx/eslint boundaries)

1. **Foundation modules** (`identity`, `tenancy`, `infra/*`, `common`) may be imported by any domain module. `enrollment` may additionally be imported by `attendance`, `graduation`, `billing`, `events`, `store` (they all reference students/turmas).
2. **Peer domain → peer domain direct service calls are forbidden for side effects.** Cross-domain reactions go through `@nestjs/event-emitter` domain events, declared in the emitting module's `events/` folder: `attendance.checkin.recorded` → graduation progress counter; `billing.charge.paid` / `billing.academy.suspended` → notifications + tenancy status; `identity.invite.accepted` → enrollment; `events.registration.confirmed` → billing charge creation.
3. **Synchronous cross-domain reads** are allowed only via an explicitly exported query service (`exports:` of the owning module), never by importing another module's repository or entity.
4. `notifications` imports no peer domain — it is listener-only (arch-use-events pattern). `reports` reads via exported query services only.
5. `@Global()` reserved for `infra/config` and `infra/logger` exactly (arch-module-sharing warning).
6. Tenant context: request-scoped tenant resolution via middleware + AsyncLocalStorage in `common`, populated from the authenticated session (ticket 02) — no module passes `academyId` parameters around by hand.

### Implications for tickets 02/03

- **02 (authn)**: lives in `identity` (sessions, invites) + `common/guards`; public invite endpoints already have a home; impersonation ("entrar como admin") is an `identity` session concern with audit events consumed by `tenancy/platform`.
- **03 (authz)**: RBAC guard in `common`, role/permission data owned by `identity`, tenant scoping from the AsyncLocalStorage context; persona-scoped controllers give the guard a static route-level surface to bind permissions to.
