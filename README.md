# Tatame

Mobile-first SaaS for managing jiu-jitsu academies — students, teachers, guardians, academy admins, and the platform owner, each with their own app surface. Built from the high-fidelity design handoff at `/Users/gupy/Desktop/design_handoff_jiujitsu_app/` (Lumira design system).

Governance: **AGENTE BOSS** (`agents/boss.md`) keeps implementation aligned with business goals. Planning lives in `.scratch/` (wayfinder maps); specs live in `docs/specs/`; **this README's checklist is the single source of delivery truth** — a box is checked only when the item is implemented and verified.

## Stack

| Part | Tech |
|---|---|
| Monorepo | nx + pnpm + docker |
| Backend | NestJS + TypeScript |
| Database | Postgres 16 (docker-compose) |
| Web | React + TanStack Query + MUI (no Next) |
| Design system | `packages/design-system` — Lumira tokens, themes MUI + RN + web |
| Mobile | Expo/React Native (TS) · Kotlin (Android) · Swift (iOS) |
| Services | Stripe (payments) · Resend (email) · Netlify (web deploy) |

## Getting started

```sh
cp .env.example .env
docker compose up -d
pnpm install
```

## Delivery policy

Per feature: **DB schema → backend → web → mobiles (RN → Kotlin → Swift)**. Auth ships first — it unblocks login screens for every persona.

## Master checklist

> Generated from wayfinder planning + specs (see `docs/specs/`). Item numbering is stable; do not renumber. Mark `[x]` only with working, tested code.

### Phase 0 — Foundation
- [x] 0.1 Nx + pnpm monorepo scaffold
- [x] 0.2 Postgres via docker-compose + `.env.example` (Stripe/Resend/Netlify placeholders)
- [x] 0.3 AGENTE BOSS charter + project governance (CLAUDE.md, agents/boss.md)
- [x] 0.4 Wayfinder maps charted per subsystem (`.scratch/`)
- [x] 0.5 Specs written: [001-auth](docs/specs/001-auth.md), [002-design-system](docs/specs/002-design-system.md)
- [x] 0.6 Apps and packages generated: `api`, `api-e2e`, `web`, `@tatame/shared`, `@tatame/design-system`, `@tatame/db`

### Phase 1 — Design system foundation ([spec 002](docs/specs/002-design-system.md))

> Runs in parallel with Phase 2's DB/backend slices; DS.1–DS.7 gate the web and RN login screens.

- [x] DS.1 Scaffold `packages/design-system` exports map (`.`, `./native`, `./tokens`, `./tokens/native`) + peerDependencies; web and RN resolve their entry points
- [x] DS.2 Convert Lumira `colors_and_type.css` into DTCG `tokens.json` (light + dark, ink tokens, `color.belt.*`); freeze CSS as reference
- [x] DS.3 style-dictionary v4 `design-system:tokens` target emitting 4 outputs: `tokens.css` + TS (web), RN TS module, `LumiraTokens.kt`, `LumiraTokens.swift`
- [x] DS.4 `palette-recipe.json` + canonical TS `derivePalette()` + `applyBrand()` + 4 presets + `palette-fixtures.json` golden tests passing
- [x] DS.5 `createTatameTheme()` (MUI v6, cssVariables, palette/typography/shape/shadows, component overrides, glass mixins) integrated into web shell
- [x] DS.6 Six P0 components web (TatameButton, FormField, Card, Toast, BrandLogo, ScreenHeader) reviewed against handoff screenshots
- [x] DS.7 Six P0 components RN under `./native` (+ ThemeProvider, Text primitive, fonts, motion presets) reviewed against handoff screenshots
- [x] DS.8 Kotlin token export (`LumiraTokens.kt` + `DerivePalette.kt`) committed in Android project, golden tests passing
- [x] DS.9 Swift token export (`LumiraTokens.swift` + `DerivePalette.swift`) committed in iOS project, golden tests passing

### Phase 2 — Auth &amp; authorization ([spec 001](docs/specs/001-auth.md))

- [x] AUTH.1 DB: Drizzle schema for auth-critical tables (users, credentials, sessions, refresh_tokens, password_reset_tokens, memberships, role_permissions, invites, academies, platform_users, platform_plans, academy_subscriptions) — UUIDv7 PKs, composite tenant FKs, enums
- [x] AUTH.2 DB: forced RLS everywhere — tenant policies, self policies, narrow platform reads, fail-closed defaults
- [x] AUTH.3 DB: SECURITY DEFINER functions for pre-auth seams (login-by-email, refresh rotation, password reset, invite landing/accept)
- [x] AUTH.4 DB: migrations apply cleanly to fresh database + RLS fail-closed meta-test
- [x] AUTH.5 DB: seeds — platform plan catalog + dev fixtures (2 academies, all 6 personas) via tenant-scoped path
- [x] AUTH.6 Backend: identity module — login (membership resolution + TOTP challenge), refresh rotation + family-reuse revocation, switch, logout, logout-all, me
- [x] AUTH.7 Backend: password reset via Resend (single-use 1h token, 202-always, revoke-all) + platform TOTP setup/enable
- [x] AUTH.8 Backend: public invite endpoints — landing payload + atomic accept transaction (minor-requires-guardian); existing email → 409 + authenticated accept
- [x] AUTH.9 Backend: global guard chain (JWT+CLS, academy status + bypass decorator, default-deny roles, permissions) + permission-toggle endpoints + `POST /v1/invites`
- [x] AUTH.10 Backend: impersonation (owner/support, audited mint, 1h session, actor claim) + audit interceptor + restrictions
- [x] AUTH.11 Backend: e2e suite green (39 e2e + 14 unit + 26 db) — RBAC matrix, refresh reuse, invite flows, reset single-use, suspension/read-only, impersonation audit, route-metadata meta-test; guardian-dependent 404 deferred to enrollment slice
- [x] AUTH.12 Web: login page pixel-perfect per handoff (Lumira tokens, forgot-password, invite notice)
- [x] AUTH.13 Web: session bootstrap — memory access token, httpOnly refresh cookie, silent refresh, single-flight 401, cache clear on auth loss
- [x] AUTH.14 Web: route guards + post-login redirects for /admin and /plataforma + download-the-app landing for mobile-only personas
- [x] AUTH.15 Web: admin and plataforma empty shells — membership switcher, logout, impersonation banner with end action
- [x] AUTH.16 Web: convite flow shell — public landing with inherited academy/class/plan, stepped signup, logged-in success
- [x] AUTH.17 RN: login screen (splash → login per handoff) with password recovery entry
- [x] AUTH.18 RN: secure session — expo-secure-store refresh, memory access, silent cold-start refresh, single-flight 401, logout
- [x] AUTH.19 RN: role-gated navigation — one binary, aluno/professor/responsável shells, web-console screen for admin/platform
- [x] AUTH.20 RN: three authenticated empty shells rendering session context + suspension/read-only states
- [x] AUTH.21 Android: login screen per handoff wired to generated API client
- [x] AUTH.22 Android: session — Keystore-encrypted TokenStore, memory access, single-flight Authenticator, logout + session-expired
- [x] AUTH.23 Android: role gate — shell by role, blocking screens for suspended/web-only
- [x] AUTH.24 iOS: login screen per handoff wired through generated client + auth middleware
- [x] AUTH.25 iOS: session — Keychain refresh (this-device-only), refresh-coordinator actor, logout + session-expired
- [x] AUTH.26 iOS: role gate — shell by role, blocking screens for suspended/web-only

_Next phases (check-in, agenda, graduation, billing, events, store, …) get their specs after Phase 2 ships._
