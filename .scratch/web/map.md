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

## Not yet specified

- Per-feature screen specs for web (to-spec template in `docs/specs/`) — sharpen only after the routing/persona-priority decision lands.
- Client-side state beyond server state (theme, active tenant, impersonation "entrar como admin" session banner) — sharpens after auth and routing decisions.
- i18n/idioma support (Aluno has a language setting in the handoff) — how web handles locale; too dim to ticket until routing scope is fixed.
- Reports export (5 admin CSV/PDF reports) — client-side generation vs backend endpoints; hangs on API client decisions.
- Real-time/live surfaces on web (professor live attendance code/QR) — polling vs SSE/WebSocket; hangs on backend architecture, out of this map's hands until the API shape exists.

## Out of scope

- Chat/comunicados, multiunidades, non-BJJ martial arts UI — per handoff design backlog, not designed yet.
- Mobile apps (RN/Expo, Kotlin, Swift) — separate efforts.
- Backend (NestJS) architecture and DB schema — separate effort; this map only consumes its OpenAPI surface.
- Design-system internals — owned by `.scratch/design-system/`; this map only decides how web consumes it.
