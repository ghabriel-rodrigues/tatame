# Tenant isolation strategy

Type: research

## Question

How should tenant (academy) isolation be enforced in Postgres — row-level security (RLS) with a per-request tenant setting, disciplined `tenant_id` columns enforced at the application layer, or a hybrid? Evaluate: safety against cross-tenant leaks (a BOSS non-negotiable), interaction with the candidate ORMs (connection pooling vs `SET LOCAL`, RLS support), the platform persona's legitimate cross-tenant access (MRR views, academies CRUD, "entrar como admin" impersonation), suspension/read-only enforcement for delinquent academies, and testability.
