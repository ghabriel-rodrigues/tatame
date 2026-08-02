# Auth session handling on web

Type: grilling
Status: open
Blocked by: 03

## Question

How does the web app handle auth sessions? Authentication + authorization is the first feature (fixed), backed by NestJS. Decide: token storage strategy (httpOnly cookies vs in-memory access token + refresh flow — Netlify static hosting vs API on another origin, CORS/CSRF implications); session bootstrap and route protection (who am I, which persona surfaces am I allowed into, RBAC claims shape consumed from the API); how TanStack Query integrates with token refresh (401 retry, query client reset on logout); multi-tenant session context (active academy) and platform-role impersonation ("entrar como admin" with audit — how the impersonated session is represented and visibly flagged client-side); and password recovery + invite-signup session handoff (Convite flow ends logged in).
