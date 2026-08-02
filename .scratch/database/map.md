# Wayfinder map: Database schema design

Label: wayfinder:map

## Destination

A locked Postgres schema design for the full Tatame product — multi-tenant organizations, users + RBAC, turmas (classes), presenças (attendance), graduation history, events + registrations, cobranças (billing charges), 2-level plans (platform→academy, academy→student), notifications, store, and invite links — with the ORM/migration tooling chosen and the migration workflow defined.

## Notes

- Domain: multi-tenant SaaS for jiu-jitsu academy management. Business rules and personas live in `agents/boss.md`; backend entity inventory in the handoff README (`/Users/gupy/Desktop/design_handoff_jiujitsu_app/README.md`, State Management section).
- **This project runs wayfinder AFK**: grilling tickets are answered by the BOSS charter (`agents/boss.md`); only genuinely undecidable questions escalate to the human.
- Skills to consult: `/Users/gupy/LLM_WIKI/raw/skills/nestjs/` and `/Users/gupy/LLM_WIKI/raw/skills/node/`.
- Fixed decisions (do not relitigate): Postgres, NestJS backend, Stripe for payments. Delivery order is DB schema → backend → web → mobiles.
- Graduation model must stay data-driven so other belt-based martial arts (judo, karate) can be added later without schema rewrites — v1 UI/scope is jiu-jitsu only.
- All shell commands via `rtk` prefix.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- ORM/migrations: **Drizzle ORM + drizzle-kit SQL migrations** (node-postgres, schema in `packages/db`, RLS policies declared alongside tables, `migrate()` in CI) — [issues/01-orm-migration-tool-choice.md](issues/01-orm-migration-tool-choice.md)
- Tenant isolation: **single schema + `tenant_id` + Postgres RLS via transaction-local `app.tenant_id` (fail-closed), two DB roles/pools (`tatame_app` RLS-enforced, `tatame_platform` BYPASSRLS for platform module only); impersonation runs tenant-scoped over the app role; suspension/read-only enforced at app layer** — [issues/02-tenant-isolation-strategy.md](issues/02-tenant-isolation-strategy.md)

## Not yet specified

- Indexing and query-performance strategy — depends on the locked entity model and the read patterns the dashboards (admin financial overview, platform MRR) impose.
- Soft-delete vs hard-delete conventions per entity, and LGPD data-retention/erasure posture — depends on the core entity model and audit decisions.
- Storage shape for white-label theming config (3-color palette per academy) and notification preferences — sharp once the core entity model settles org-level settings.
- Migration rollout in CI (how migrations run across environments) — hangs on the migration tool choice here and the CI pipeline choice in the infra map.
- Reporting/read-model needs (admin's 5 CSV/PDF reports) — whether plain queries suffice or dedicated views/materializations are needed.

## Out of scope

- Multi-unit academies (one academy = one unit in v1) — per handoff design backlog.
- Chat/comunicados entities — per handoff design backlog.
- UI/scope for non-BJJ martial arts — only the *data-driven* graduation model is in scope; judo/karate rulesets are future efforts.
- Store inventory per size/variant — handoff backlog; v1 store tracks simple stock.
- Real geolocation check-in storage/verification — handoff backlog; v1 records the check-in method only.
