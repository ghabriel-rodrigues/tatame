# Routing and persona priority on web

Type: grilling
Status: resolved

## Question

Which personas does the web app serve, and how is routing structured? The handoff is mobile-first and every prototype is phone-framed — there is no desktop design. Decide: does web ship all 5 personas (Aluno, Professor, Admin, Responsável, Plataforma) + public Convite flow as responsive adaptations, or does it start with the desk-natural personas (Admin da academia + Plataforma) first and treat the phone-first personas as mobile-app territory initially? FLAG: this priority call is not settled by the charter and should be decided by BOSS — escalate to the human if the charter can't resolve it. Then decide: router library (React Router vs TanStack Router, given TanStack Query is fixed); URL structure for multi-tenant + persona surfaces (subdomain vs path prefix per academy/persona); route-level RBAC guards; and how the public invite flow (7-day links, academy+class+plan pre-bound) fits the route tree.

## Answer

**BOSS RULING (recorded as such — persona priority was escalated to BOSS and ruled, not derived here):**

**Persona coverage: the web app serves Admin da academia + Plataforma first**, plus the **public Convite flow** and login for those personas. Rationale (BOSS): these are the desktop-suited workflows — finance, registrations, reports, SaaS console — matching real handoff usage patterns; invite links open in browsers, so Convite is a natural web surface. **Aluno, Professor, and Responsável remain mobile-first**; their web parity is NOT dropped — it is recorded as explicit debt in the map's fog, to be revisited after mobile parity lands. Rejected alternative: shipping all 5 personas as responsive adaptations — rejected because the handoff has no desktop design, and stretching five phone-framed surfaces to web before mobile ships would triple surface area with no design source of truth.

**Router: React Router v7 in library mode** (`react-router` package, `createBrowserRouter` + `RouterProvider` — not framework mode). Rationale: library mode keeps the app a plain Vite SPA (fits ticket 01's build and Netlify static hosting; framework mode's SSR/loader runtime re-introduces the framework coupling the "React, no Next" decision avoids). Rejected: TanStack Router — typed routes are attractive, but it adds a second TanStack API surface to learn while React Router v7 is the ecosystem default with deeper MUI/example coverage; data loading belongs to TanStack Query (ticket 03), not to router loaders, so the router is deliberately dumb navigation + guards.

**Route tree — path prefix per persona surface, tenant from session (not URL):**

```
/login                      public (Admin + Plataforma personas)
/convite/:token             public invite landing + stepped signup
/admin/*                    Admin da academia console (finance, registrations,
                            events, store, white-label, graduation rules, reports)
/plataforma/*               SaaS console (MRR, academies CRUD, plans, billing,
                            team roles, integrations)
```

Multi-tenant scoping: the active academy comes from the authenticated session (JWT claims / session bootstrap, ticket 04), not from the URL — an Admin belongs to one academy, so `/admin/finance` is unambiguous. Rejected: subdomain-per-academy and `/a/:academySlug` path prefixes — premature; subdomains only matter for white-label public surfaces, which is future work (noted in fog). Platform impersonation ("entrar como admin") enters `/admin/*` with an impersonation-flagged session, same routes, no special URL.

**Route-level RBAC guards:** two persona layout routes (`/admin`, `/plataforma`) each wrap their subtree in a guard component that reads the session (ticket 04's bootstrap) and (a) redirects unauthenticated users to `/login`, (b) redirects authenticated-but-wrong-persona users to their own surface, (c) renders the persona shell (nav, tenant/impersonation banner) on pass. Guards are UI convenience only — real enforcement is backend RBAC. `/convite/:token` and `/login` are public; invalid/expired invite tokens (7-day validity) render an error state on the landing route, decided by the API response, not client clock.

**Visual language:** the phone-framed prototypes still define the visual language (tokens, components, spacing). Convite renders as a responsive, max-width phone-ish canvas (it IS a phone-shaped flow, centered on desktop). Admin/Plataforma consoles get fluid desktop layouts (sidebar nav, tables, multi-column) built from the same Lumira tokens/components — adapt the handoff's mobile screens to desktop, do not stretch them.

**Implications for blocked tickets:** 04 — session bootstrap only needs to answer "which of the two console surfaces may this user enter"; Convite signup ends logged-in, so its handoff must route the new user to the correct surface (or, for Aluno-persona signups, to a "download the app" landing since Aluno has no web surface yet — spec this in the auth ticket). 05 — the design-system integration must support both layout modes (phone-canvas Convite, fluid console) with the same theme; white-label palette application matters on `/convite` (academy-branded) and `/admin`, while `/plataforma` uses the default Tatame palette.
