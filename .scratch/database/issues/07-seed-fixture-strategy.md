# Seed & fixture data strategy

Type: task
Blocked by: 03

## Question

Define the seed/fixture strategy for local dev and tests, now that the tooling is fixed (Drizzle + drizzle-kit, ticket 01) and isolation is RLS-based (ticket 02). Decide: a `drizzle-seed`-or-handwritten seed script in `packages/db` (idempotent, runs after `migrate()`), what the canonical local dataset contains (at least 2 academies to exercise RLS boundaries, all 6 personas, one full graduation ladder, sample turmas/presenças/cobranças), how test fixtures differ from dev seeds (per-test factories over the `withTenant` helper vs shared snapshot), and how seeds authenticate (must run as the migrations/owner role or per-tenant via `app.tenant_id` so `WITH CHECK` policies stay honest). Constraint: seed data must never be required in production migrations.
