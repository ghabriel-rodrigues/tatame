# Wayfinder map: Monorepo, docker & CI/deploy conventions

Label: wayfinder:map

## Destination

Locked monorepo + docker + CI/deploy conventions: nx project layout with enforced module boundaries, the local-dev docker strategy, the CI pipeline choice, Netlify deploy wiring for the web app, and env/secret handling across all apps.

## Notes

- Domain: infrastructure conventions for the Tatame monorepo at `/Users/gupy/apps/tatame` (nx + pnpm workspace already bootstrapped; `docker-compose.yml` with Postgres exists). Business context in `agents/boss.md`.
- **This project runs wayfinder AFK**: grilling tickets are answered by the BOSS charter (`agents/boss.md`); only genuinely undecidable questions escalate to the human.
- Skills to consult: `/Users/gupy/LLM_WIKI/raw/skills/nestjs/` and `/Users/gupy/LLM_WIKI/raw/skills/node/`.
- Fixed decisions (do not relitigate): nx + pnpm + docker monorepo; Netlify hosts/deploys the web app; apps = NestJS API, React web, Expo RN, Kotlin (Android), Swift (iOS); shared design-system package consumed by all apps.
- The backend map (`.scratch/backend/`) owns the NestJS module/domain layout; this map owns where those modules live as nx projects and the boundary enforcement between them.
- All shell commands via `rtk` prefix.

## Decisions so far

<!-- one line per closed ticket: gist + link -->

## Not yet specified

- Production hosting for the NestJS API and Postgres (Netlify covers web only; API host undecided) — needs its own research once CI and docker conventions land.
- Mobile CI (Expo EAS builds, Kotlin/Gradle and Swift/Xcode build lanes) and app-store release pipelines — sharp once the CI pipeline choice lands and the mobile apps exist.
- Staging/preview environments (API + DB per PR? Netlify deploy previews against what backend?) — depends on CI choice and API hosting.
- How Kotlin and Swift projects sit inside (or beside) the nx workspace — graduates out of the nx-layout ticket if it can't be settled there.
- Database migration execution in CI/deploy (hangs on the database map's migration tool choice and the CI pipeline here).

## Out of scope

- Kubernetes / production scaling architecture — premature before first deploy; revisit as a fresh effort if needed.
- Multi-region or multi-unit infrastructure — per handoff design backlog.
- Observability/monitoring stack selection — owned as fog in the backend map, not here.
