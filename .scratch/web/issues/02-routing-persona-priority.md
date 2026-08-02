# Routing and persona priority on web

Type: grilling
Status: open

## Question

Which personas does the web app serve, and how is routing structured? The handoff is mobile-first and every prototype is phone-framed — there is no desktop design. Decide: does web ship all 5 personas (Aluno, Professor, Admin, Responsável, Plataforma) + public Convite flow as responsive adaptations, or does it start with the desk-natural personas (Admin da academia + Plataforma) first and treat the phone-first personas as mobile-app territory initially? FLAG: this priority call is not settled by the charter and should be decided by BOSS — escalate to the human if the charter can't resolve it. Then decide: router library (React Router vs TanStack Router, given TanStack Query is fixed); URL structure for multi-tenant + persona surfaces (subdomain vs path prefix per academy/persona); route-level RBAC guards; and how the public invite flow (7-day links, academy+class+plan pre-bound) fits the route tree.
