# Wayfinder map: NestJS backend architecture

Label: wayfinder:map

## Destination

A locked NestJS architecture spec: module/domain layout, authentication and authorization approach, API contract style, validation conventions, testing strategy, Stripe and Resend integration seams, and notification delivery — clear enough that feature work (starting with authentication + authorization, the fixed first feature) can begin without further architectural decisions.

## Notes

- Domain: multi-tenant SaaS backend serving six persona surfaces (Aluno, Professor, Admin, Responsável, Plataforma, public Convite flow). Business rules in `agents/boss.md`; product handoff in `/Users/gupy/Desktop/design_handoff_jiujitsu_app/README.md`.
- **This project runs wayfinder AFK**: grilling tickets are answered by the BOSS charter (`agents/boss.md`); only genuinely undecidable questions escalate to the human.
- Skills to consult: `/Users/gupy/LLM_WIKI/raw/skills/nestjs/` and `/Users/gupy/LLM_WIKI/raw/skills/node/`.
- Fixed decisions (do not relitigate): Node + NestJS + TypeScript, Postgres, Stripe (payments), Resend (transactional email), nx + pnpm monorepo. Clients: React web + 3 mobile implementations (Expo RN, Kotlin, Swift) consuming the same API.
- The database map (`.scratch/database/`) owns schema decisions; this map consumes them (notably the ORM choice and tenant-isolation strategy). The infra map (`.scratch/infra/`) owns nx layout and docker.
- All shell commands via `rtk` prefix.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- Modular monolith, one Nest app: 10 domain feature modules under `src/modules/` (identity, tenancy, enrollment, attendance, graduation, billing, events, store, notifications, reports) + `common/` + `infra/`; flat module layout with repository seam (ORM-agnostic until database ticket 01); persona surfaces = persona-scoped controllers inside shared domain modules; cross-domain side effects via event-emitter, sync reads via exported query services only; client contracts generated from OpenAPI, `packages/shared` minimal — [issues/01-nestjs-module-layout.md](issues/01-nestjs-module-layout.md)
- REST + OpenAPI 3.0.x generated from `@nestjs/swagger` (CLI plugin over class-validator DTOs, committed spec artifact); clients: openapi-typescript/openapi-fetch (web+RN), openapi-generator kotlin/jvm-retrofit2 (Android), apple/swift-openapi-generator (iOS); URI versioning `/v1`, RFC 9457 problem+json errors with stable `code` registry, offset pagination `{ data, meta:{page,limit,total} }` — [issues/04-api-contract-style.md](issues/04-api-contract-style.md)

## Not yet specified

- Notification delivery pipeline detail (in-app feed vs push vs email fan-out, scheduling of automatic notifications) — sharp once module layout and Resend integration land.
- Background job/queue strategy (billing reminders, invite expiry, attendance streak computation) — depends on module layout and whether Stripe webhooks cover billing timing.
- File/asset storage for event banners, academy logos, product photos, and rendered certificates — no provider decided; needs its own research once module seams exist.
- Rate limiting, brute-force protection on login/check-in codes, and abuse controls — depends on the authn design.
- Observability (structured logging, error tracking, request tracing) — depends on module layout and CI/deploy decisions in the infra map.
- ~~API versioning and client-compatibility policy across 4 client apps~~ — versioning convention decided in ticket 04; remaining pipeline + compatibility policy graduated into `issues/08-openapi-codegen-pipeline.md`.
- Realtime for the professor live-attendance screen — graduated into `issues/09-realtime-live-attendance.md` (REST decision made the gap sharp).

## Out of scope

- Chat/comunicados features — per handoff design backlog.
- Real geolocation verification for check-in — handoff backlog; v1 accepts the method flag without server-side geo validation.
- Multi-unit academy support — per handoff design backlog.
- Non-BJJ martial-arts surfaces — v1 scope is jiu-jitsu only (data-driven graduation handled in the database map).
- Frontend architecture (web/mobile) — separate efforts per the delivery order; this map stops at the API boundary.

## Cross-effort dependencies

- NestJS module layout should not lock persistence-layer details before the database map's ORM choice (database ticket 01) resolves.
- Stripe integration architecture consumes the money/billing model (database ticket 05).
