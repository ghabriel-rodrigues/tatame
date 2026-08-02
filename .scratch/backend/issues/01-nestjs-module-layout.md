# NestJS module/domain layout

Type: grilling

## Question

How should the NestJS application be organized into modules/domains? Decide: the module list (e.g. auth, orgs/tenancy, users, turmas, attendance, graduation, events, billing, plans, store, notifications, invites, platform-admin), whether to layer domain/application/infrastructure inside each module or keep flat NestJS convention (controller/service/repository), where cross-cutting concerns live (tenant context, RBAC guards, validation pipes, Stripe/Resend clients), how the six persona surfaces map onto modules (shared modules + persona-scoped controllers vs per-persona modules), and the dependency rules between modules that nx boundaries will later enforce.
