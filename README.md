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
- [ ] 0.4 Wayfinder maps charted per subsystem (`.scratch/`)
- [ ] 0.5 Specs written per subsystem (`docs/specs/`) and indexed here

_Further phases are appended by the spec-writing pass (Phase 1 = Auth &amp; Authorization)._
