# Authorization design (RBAC, tenant scoping, impersonation)

Type: grilling
Blocked by: 02

## Question

What is the authorization design? Decide: the RBAC guard strategy in NestJS (roles/permissions model, decorators + guards, per-persona role set including platform roles Owner/Suporte/Financeiro), how tenant scoping is injected and enforced on every request (consistent with the database map's tenant-isolation strategy), hard rules such as "professor has no financial access" and guardian-only access to own dependents, enforcement of academy status (suspension blocks access; delinquency → read-only mode), and the platform "entrar como admin" impersonation flow — how a platform user assumes an academy-admin context, how the impersonated token is marked, and how every impersonated action is audited.
