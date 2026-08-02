# ORM & migration tool choice

Type: research
Status: resolved

## Question

Which ORM/query-builder and migration tool should Tatame use with Postgres inside NestJS — TypeORM, Prisma, Drizzle, or Kysely? Compare NestJS integration quality, migration workflow (generation, review, CI execution), TypeScript type-safety, multi-tenant ergonomics (e.g. per-request tenant scoping, RLS compatibility), transaction support, and long-term maintenance risk. Recommend one and define the migration workflow it implies.

## Answer

**Decision: Drizzle ORM + drizzle-kit migrations** (driver: `node-postgres` Pool), schema in a shared workspace package (e.g. `packages/db`) so NestJS and any tooling consume one source of truth.

### Why Drizzle (per weighted criteria)

- **First-class SQL migrations**: `drizzle-kit generate` emits plain, reviewable `.sql` files; custom SQL (RLS policies, triggers, grants) is added via `drizzle-kit generate --custom` into the same numbered stream. No proprietary DSL between us and Postgres DDL.
- **RLS / session-variable compatibility (the deciding criterion)**: Drizzle has native RLS constructs in schema (`pgRole`, `pgPolicy`, `.enableRLS()`), and its `db.transaction()` API cleanly supports `SET LOCAL app.tenant_id = ...` as the first statement of every tenant-scoped transaction — the exact production pattern for RLS behind a shared pool. Prisma's equivalent is a client extension that wraps every query in an implicit batch transaction; the official `prisma-client-extensions` row-level-security example is explicitly labeled not production-ready and conflicts with explicit `$transaction()` usage.
- **NestJS integration**: no official `@nestjs/drizzle`, but a custom `DrizzleModule` (global provider exposing `db` from a factory) is ~30 lines and composes naturally with `nestjs-cls`/`AsyncLocalStorage` for per-request tenant context (needed by ticket 02). Non-issue in practice.
- **Type safety**: full inference from the TS schema (select/insert types per table), on par with Kysely, better than TypeORM, without Prisma's codegen step.
- **Testability**: real-Postgres tests via Testcontainers or PGlite; because Drizzle is a thin layer over SQL, RLS policies are testable through the same client the app uses (set the session var, assert visibility).
- **Maturity**: v1 stable, dominant in new TS/SaaS project adoption as of 2025-2026; SQL-first design means low lock-in risk (worst case, queries are already SQL-shaped).

### Rejected

- **Prisma**: RLS story not proven clean (extension-based, transaction-wrapping caveats, "example only" warning) — fails the BOSS bar; heavier runtime and a schema DSL between us and Postgres.
- **TypeORM**: best-known NestJS integration but weakest type safety of the four, noisy migration generator, long-standing maintenance/quality concerns.
- **Kysely**: excellent types and zero magic, but no schema definition or migration autogeneration (all migrations hand-written) and no relational layer — more glue for no RLS advantage over Drizzle.

### Migration workflow (defined)

1. Edit TS schema in `packages/db/src/schema/*` (tables, enums, `pgPolicy`/`pgRole` declarations live next to tables).
2. `rtk pnpm drizzle-kit generate` produces a numbered `.sql` in `packages/db/drizzle/`; for RLS policies, grants, and triggers use `drizzle-kit generate --custom` and hand-write the SQL.
3. Every migration `.sql` is reviewed in PR like code. No `drizzle-kit push`/sync in shared envs (`push` allowed for local scratch DBs only).
4. Apply: programmatic `migrate()` step in CI/deploy (and on local boot via a script), never at app runtime import.
5. Tests run migrations against a Testcontainers Postgres so schema + policies stay verified.

### Implications for ticket 03 (core entity model)

- Entity model is expressed as Drizzle `pgTable` definitions in `packages/db`, not NestJS decorators — entities are plain inferred types; services receive the `db` instance.
- Prefer Postgres-native constructs Drizzle exposes directly: `pgEnum` for closed enums, lookup tables where BOSS requires data-driven extensibility (graduation), composite unique indexes (e.g. check-in uniqueness) declared in schema.
- Every tenant-scoped table must carry `tenant_id` (see ticket 02) and declare its RLS policy alongside the table definition.

Sources: [Drizzle RLS docs](https://orm.drizzle.team/docs/rls), [Prisma RLS client extension example](https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security), [Postgres RLS for multi-tenant SaaS production pattern](https://theroadtoenterprise.com/blog/postgres-rls-multi-tenant-saas), [Drizzle vs Prisma 2026](https://makerkit.dev/blog/tutorials/drizzle-vs-prisma), [ORM tier list 2026](https://www.pkgpulse.com/blog/prisma-vs-drizzle-vs-kysely-typescript-orm-tier-list), LLM wiki: `/Users/gupy/LLM_WIKI/raw/skills/nestjs/rules/db-use-migrations.md`, `db-use-transactions.md`, `/Users/gupy/LLM_WIKI/raw/skills/supabase/supabase-postgres-best-practices/references/security-rls-basics.md`.
