# Tenant isolation strategy

Type: research
Status: resolved

## Question

How should tenant (academy) isolation be enforced in Postgres — row-level security (RLS) with a per-request tenant setting, disciplined `tenant_id` columns enforced at the application layer, or a hybrid? Evaluate: safety against cross-tenant leaks (a BOSS non-negotiable), interaction with the candidate ORMs (connection pooling vs `SET LOCAL`, RLS support), the platform persona's legitimate cross-tenant access (MRR views, academies CRUD, "entrar como admin" impersonation), suspension/read-only enforcement for delinquent academies, and testability.

## Answer

**Decision: single schema + `tenant_id` column on every tenant-scoped table + Postgres RLS enforced via a transaction-local session variable (`app.tenant_id`), with a separate platform DB role that bypasses RLS.** App-layer `tenant_id` filtering remains as defense-in-depth, not as the enforcement mechanism.

### Mechanism

- **Two runtime DB roles, two pools** (plus a migrations-only owner role):
  - `tatame_app` — no `BYPASSRLS`; all tenant-persona traffic (aluno, professor, admin, responsavel, invite). All tenant tables get `ENABLE` + `FORCE ROW LEVEL SECURITY` and a policy: `USING (tenant_id = current_setting('app.tenant_id', true)::uuid)` (plus matching `WITH CHECK`). With the GUC unset, `current_setting(..., true)` yields NULL and the policy matches nothing — **fails closed**.
  - `tatame_platform` — `BYPASSRLS`, used exclusively by the platform module (MRR aggregates, academies CRUD, SaaS billing). Explicit grant surface: only the platform NestJS module gets this pool injected; every handler behind the platform-role guard + audit interceptor.
- **Impersonation ("entrar como admin") does NOT use the platform role**: it mints a tenant-scoped context (sets `app.tenant_id` to the target academy) over the regular `tatame_app` pool, after writing the audit record. The impersonator sees exactly what the academy admin sees — RLS keeps enforcing.
- **Pool safety**: the GUC is always set with `set_config('app.tenant_id', $1, true)` / `SET LOCAL` as the first statement inside a transaction — transaction-scoped, so connections return to the pool clean; this is the pattern that stays correct under PgBouncer transaction pooling. Never plain `SET`.
- **Suspension / delinquency read-only**: enforced at the application layer (NestJS guard reading `academy.status`), not in RLS policies — keeps policies single-purpose (isolation) and fast; blocking access vs read-only is a business rule that changes, policies shouldn't. `academy.status` lives on the academies table (ticket 03).

### Interaction with ticket 01 (Drizzle) — NestJS request lifecycle pattern

1. Auth guard resolves JWT → `nestjs-cls` (AsyncLocalStorage) stores `{ tenantId, userId, personaRole }` per request.
2. A `TenantDb` service exposes `withTenant<T>(fn: (tx) => Promise<T>)`: opens `db.transaction`, runs `select set_config('app.tenant_id', ..., true)`, then `fn(tx)`. Repositories/services **only ever receive the `tx` handle**, never the raw `tatame_app` pool — bypassing tenancy becomes structurally hard, not a code-review hope.
3. Platform module gets a distinct `PlatformDb` provider bound to the `tatame_platform` pool; it is not exported to tenant feature modules.
4. Drizzle declares roles and policies in schema (`pgRole`, `pgPolicy`, `.enableRLS()`); policy SQL lands in reviewed migrations (`drizzle-kit generate --custom` where needed).
5. Performance: composite indexes leading with `tenant_id`; measured RLS overhead in the low single-digit percent range at millions of rows.

### Testability

- Testcontainers Postgres, migrations applied, connect as `tatame_app`: seed two academies, set `app.tenant_id` for A, assert zero visibility of B's rows (read and write paths, `WITH CHECK` included); assert unset GUC returns nothing.
- A CI meta-test queries `pg_catalog` (`pg_class.relrowsecurity`, `relforcerowsecurity`, `pg_policies`) asserting every table carrying `tenant_id` has RLS enabled+forced and a policy — new tables can't silently ship unprotected.

### Rejected

- **App-layer `tenant_id` discipline only**: one forgotten `where` clause = cross-tenant leak; fails the BOSS non-negotiable of hard isolation.
- **Schema-per-tenant**: for ~100s of academies, migration fan-out, pool fragmentation, and painful cross-tenant platform queries (MRR, academies list); operational cost rejected per BOSS.
- **Policy-based platform bypass on a single role** (OR `app.is_platform` GUC in every policy): keeps one pool but a single mis-set GUC anywhere in tenant code grants global read; a physically separate role+pool with `BYPASSRLS` confines cross-tenant capability to the platform module's injection boundary.

### Implications for ticket 03 (core entity model)

- Every tenant-scoped table: `tenant_id uuid NOT NULL REFERENCES academies(id)` + RLS policy declared next to the table in Drizzle schema; uniqueness constraints are composite with `tenant_id` (e.g. check-in unique per class-occurrence per student *within* the academy).
- Global (non-RLS or platform-only) tables: `academies` itself, platform plans, platform team users/roles, shared graduation ruleset defaults, audit log of impersonation.
- Child tables reachable only through a tenant parent still carry their own `tenant_id` (RLS must not depend on joins).
- Cross-tenant aggregates (MRR) are plain queries over the platform pool — no extra read models needed yet.

Sources: [Postgres RLS production pattern for multi-tenant SaaS](https://theroadtoenterprise.com/blog/postgres-rls-multi-tenant-saas), [PgBouncer transaction pooling + SET LOCAL](https://multi-tenant-saas.com/tenant-aware-data-routing-query-scoping/connection-pooling-in-multi-tenant-systems/pgbouncer-transaction-pooling-for-multi-tenant-saas/), [RLS in practice (fail-closed, admin bypass)](https://queryplane.com/blog/postgres-row-level-security-in-practice/), [Drizzle RLS docs](https://orm.drizzle.team/docs/rls), LLM wiki: `/Users/gupy/LLM_WIKI/raw/skills/supabase/supabase-postgres-best-practices/references/security-rls-basics.md`, `security-rls-performance.md`.
