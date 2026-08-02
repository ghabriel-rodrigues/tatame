# Wayfinder map: web

Label: wayfinder:map

## Destination

A locked architecture for the React web app (`apps/web`): build tooling, routing and persona coverage, data layer (TanStack Query + generated API client), auth session handling, MUI + design-system integration, deploy, and testing strategy. Done when nothing is left to decide before the first web feature (authentication) can be built.

## Notes

- Domain: Tatame (jiu-jitsu academy SaaS). Business rules, personas, and fixed stack decisions live in `agents/boss.md` — do NOT relitigate: React (no Next), TanStack Query, TypeScript, MUI skinned by Lumira, nx + pnpm monorepo, Netlify hosting, delivery order DB → backend → web → mobiles, first feature = authentication + authorization.
- This effort runs AFK: grilling tickets are answered by the BOSS charter (`agents/boss.md`); anything genuinely undecidable — notably web persona priority (see routing ticket) — escalates to the human.
- Design reference: `/Users/gupy/Desktop/design_handoff_jiujitsu_app/` — README + 79 screenshots + 6 prototypes. Note: the handoff is mobile-first and all prototypes are phone-framed; there is no desktop design.
- Depends on the sibling map `.scratch/design-system/map.md` — the MUI + design-system integration ticket here is blocked by that map's decisions.
- LLM wiki skills to consult: `/Users/gupy/LLM_WIKI/raw/skills/react/`, `/Users/gupy/LLM_WIKI/raw/skills/shadcn/`, `/Users/gupy/LLM_WIKI/raw/skills/expo/` (under `/Users/gupy/LLM_WIKI/raw/skills/`).
- All shell commands via `rtk` prefix.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

- Build tooling: `@nx/react:application` + `--bundler=vite --unitTestRunner=vitest --style=none`; TS-solution workspace (project refs + `@org/source` source condition, no `paths`/buildable libs); Vite dev proxy `/api`→:3000 and Netlify `/api/*` proxy redirect keep API same-origin in dev+prod; SPA fallback in `netlify.toml`; route-level lazy per persona surface — [issues/01-build-tooling-vite-nx.md](issues/01-build-tooling-vite-nx.md)
- Routing & persona priority (BOSS RULING): web serves Admin da academia + Plataforma + public Convite + login; Aluno/Professor/Responsável stay mobile-first (web parity = explicit fog debt). React Router v7 library mode (`createBrowserRouter`), tree `/login`, `/convite/:token`, `/admin/*`, `/plataforma/*`; tenant from session not URL; guard layout-routes per surface; phone-canvas Convite, fluid desktop consoles, same Lumira tokens — [issues/02-routing-persona-priority.md](issues/02-routing-persona-priority.md)
- Data layer: openapi-typescript + openapi-fetch + openapi-react-query in `packages/shared/src/api/` (schema.d.ts committed, CI drift check; shared by web + RN); query keys = `[method, path, params]` with per-mutation invalidation lists; auth via pluggable client middleware (single-flight 401 refresh, `queryClient.clear()` on tenant/impersonation switch); pessimistic mutations by default, optimistic only for roll-call-style toggles — [issues/03-tanstack-query-openapi-client.md](issues/03-tanstack-query-openapi-client.md)

## Not yet specified

- **Web parity debt (BOSS ruling, ticket 02): Aluno, Professor, and Responsável have NO web surface in v1** — revisit after mobile parity lands; must be re-ticketed, never silently dropped.
- White-label subdomains/custom domains for academy-branded public surfaces (e.g. branded Convite) — deferred by ticket 02 (tenant comes from session/token, not URL) until white-label goes beyond palette.
- Per-feature screen specs for web (to-spec template in `docs/specs/`) — routing decision landed (ticket 02): specs can now be written for Admin/Plataforma/Convite surfaces only.
- Client-side state beyond server state (theme, active tenant, impersonation "entrar como admin" session banner) — sharpens after auth decision (ticket 04).
- i18n/idioma support — Aluno (the persona with the language setting) is off web for v1 per ticket 02; only matters for Convite/console locale, revisit with web parity debt.
- Reports export (5 admin CSV/PDF reports) — client-side generation vs backend endpoints; hangs on API client decisions.
- Real-time/live surfaces on web (professor live attendance code/QR) — polling vs SSE/WebSocket; hangs on backend architecture, out of this map's hands until the API shape exists.

## Out of scope

- Chat/comunicados, multiunidades, non-BJJ martial arts UI — per handoff design backlog, not designed yet.
- Mobile apps (RN/Expo, Kotlin, Swift) — separate efforts.
- Backend (NestJS) architecture and DB schema — separate effort; this map only consumes its OpenAPI surface.
- Design-system internals — owned by `.scratch/design-system/`; this map only decides how web consumes it.
