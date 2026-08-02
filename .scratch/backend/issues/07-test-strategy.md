# Backend test strategy (unit + e2e)

Type: grilling
Blocked by: 01, 04

## Question

What is the backend testing strategy? Decide: the unit-vs-e2e split (what deserves unit tests — domain logic like graduation progress, billing status transitions — vs what is covered by e2e API tests), the e2e harness (Nest testing module vs real HTTP against a dockerized Postgres; per-test DB isolation strategy), how multi-tenant and RBAC boundaries are systematically tested (cross-tenant leak tests, professor-cannot-see-money tests — BOSS review checklist items), how Stripe and Resend are faked (mocks vs Stripe test clocks/CLI), fixture/seed conventions, and the definition of "tested" that the root README checklist requires before a feature box may be checked.
