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
- Audit/immutability: **append-only via no-UPDATE/DELETE grants+policies for both roles + `forbid_mutation()` trigger backstop on `attendances`/`student_graduations`/`audit_logs`; corrections = void annotation for attendance (`attendance_revoke` SECURITY DEFINER seam: professor same-day, admin later, always audited; re-check-in = new row, unique goes partial `WHERE revoked_at IS NULL`) and compensation rows for graduation (`kind='revocation'` + `reverses_graduation_id`, admin-only); audit_logs shape/seam from AUTH (0003–0005) reused unchanged — new action codes `graduation.awarded/revoked`, `attendance.recorded_manual/revoked`, self check-ins not audited; retention forever (LGPD = pseudonymize metadata)** — [issues/06-audit-immutability-history.md](issues/06-audit-immutability-history.md)
- Money/billing model: **two-stage provider decision — v1 SIMULATED driver (deterministic Pix/boleto payloads, "simular pagamento" settlement), stage 2 Stripe Connect destination charges (repasses/retention native), swap migration-free via nullable provider columns + `payment_provider` enum (`simulated`,`stripe`); tables: `academy_plans` (amount_cents, recurrence chips monthly/quarterly/semiannual/yearly, due_day CHECK 1–28 with UI chips 5/10/15), `charges` (per-origin composite FKs plan/event/order + exactly-one CHECK, status open/paid/overdue/canceled/refunded with overdue derived + lazily flipped, partial unique (tenant,student,plan,period_start) as materialization idempotency key, guardian bill-to), `payments` (attempt lifecycle, provider_payment_id + provider_data jsonb for QR/copia-e-cola/linha-digitável, receipt_url, full-refund columns), `payment_mandates` (card recurrence), `billing_customers` (Stripe Customer per paying user per academy, empty in v1); additive: `academies.provider_account_id`, `academy_subscriptions.provider_*`, `platform_plans.fee_bps`; delinquency = two uncoupled derivations (student = open past-due charge exists, derived; academy = subscription past_due → status delinquent, platform-driven); repasses = read-model query only in v1 (gross − fee_bps, withheld flag when delinquent)** — [issues/05-money-billing-model.md](issues/05-money-billing-model.md)
- Core entity model: **~35 tables in 4 scoping classes — tenant-RLS (memberships, students/guardians, classes/schedules/enrollments/sessions/checkin_codes/attendances, graduation_rules + student_graduations, events/registrations, academy_plans/charges/payments, store, notifications, invites), platform-global (academies, platform_users, platform_plans, academy_subscriptions), shared catalogs (martial_arts, belt_ladders, belts), auth-global (users, credentials, sessions, refresh_tokens, password_reset_tokens; self/membership policies + SECURITY DEFINER fns for pre-auth lookups). uuid v7 PKs app-generated, snake_case plural, composite `(tenant_id, parent_id)` FKs for hard same-tenant integrity, pgEnum for closed sets vs catalog tables for data-driven sets; auth-critical tables fully columned for the auth phase** — [issues/03-core-entity-model.md](issues/03-core-entity-model.md)

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
