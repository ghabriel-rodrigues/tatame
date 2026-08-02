<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

# General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->

# Tatame Project Rules

Tatame is a mobile-first SaaS for managing jiu-jitsu academies. Read `agents/boss.md` (AGENTE BOSS charter) before planning or reviewing anything — it holds the business rules, personas, fixed stack decisions, and delivery policy.

## Governance

- **AGENTE BOSS** (`.claude/agents/boss.md`) orients every iteration: consult it for scope, alignment, and review criteria.
- Planning artifacts: wayfinder maps in `.scratch/<effort>/` (local markdown tracker). Specs in `docs/specs/`, indexed as the master checklist in the root `README.md`. Checking a README box = closing the ticket (no Jira).
- Delivery order per feature: **DB schema → backend → web → mobiles (RN/Kotlin/Swift)**.

## Stack (fixed)

- Monorepo: nx + pnpm. `apps/*` (api, web, mobile-rn, mobile-android, mobile-ios), `packages/*` (design-system, shared).
- Backend: NestJS + TypeScript + Postgres (docker-compose at root).
- Web: React + TanStack Query + MUI (skinned by the Lumira design system). No Next.
- Mobile: Expo/React Native (TypeScript), Kotlin (Android), Swift (iOS).
- Services: Stripe (payments), Resend (email), Netlify (web deploy). Secrets via `.env` (see `.env.example`).

## Knowledge base

- LLM wiki: `/Users/gupy/LLM_WIKI/` — consult stack skills before implementing (NestJS, Node, React, Expo; Kotlin skills at `raw/skills/kotlin/`, Swift skills at `raw/skills/swift/`).
- Design handoff (source of truth for UI): `/Users/gupy/Desktop/design_handoff_jiujitsu_app/` — prototypes, screenshots, Lumira tokens.

## Conventions

- All shell commands through `rtk` prefix (token proxy).
- Code, comments, commits, docs: English. Conversation with the user: Portuguese.
- No hardcoded colors — all colors (belts included) come from design-system tokens.
