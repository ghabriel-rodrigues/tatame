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

- nx layout locked: `apps/{api,web,mobile-rn}` as nx projects + `apps/{mobile-android,mobile-ios}` in-repo but outside the nx/pnpm graph (own Gradle/Xcode builds, no package.json); `packages/{design-system,shared}` under scope `@tatame/*`; boundary tags `scope:api|client|design|shared` with api→shared only, clients→shared+design, packages leaf; keep template's `@nx/js/typescript` plugin now, add `@nx/nest`/`@nx/react`+`@nx/vite`/`@nx/expo`/`@nx/eslint` at app generation; rename root scope `@org`→`@tatame` (incl. tsconfig `customConditions`) — [issues/01-nx-layout-boundaries.md](issues/01-nx-layout-boundaries.md)
- Docker strategy locked: dev = compose Postgres only + api on host (`nx serve`); web/mobile-rn never containerized; multi-stage prod Dockerfile at `apps/api/Dockerfile` (repo-root build context, node:24-slim, non-root) doubles as deploy artifact + parity test via compose `--profile full` api service; no Stripe-CLI/mail/Redis/test-db containers (Stripe CLI on host, Resend is HTTP-only, Redis waits on backend need, tests use Testcontainers); names `tatame-<service>`, volumes `<service>_data`, ports via root `.env` — [issues/02-docker-local-dev.md](issues/02-docker-local-dev.md)
- CI locked: GitHub Actions, no Nx Cloud for now (replace template `ci.yml`; revisit at >10min lanes or 2nd contributor); one workflow per toolchain lane — `ci.yml` (pnpm+node24, `nx-set-shas`, parallel jobs: `main` = `nx affected -t lint typecheck test build` with Testcontainers Postgres, `migrations` = drizzle-kit generate+check drift gate, `openapi` = spec-freshness gate per backend-08) + path-filtered `mobile-android.yml` (JDK 17, Gradle) and `mobile-ios.yml` (macos-15, XcodeGen + xcodebuild, no signing), created when those apps start — [issues/03-ci-pipeline-choice.md](issues/03-ci-pipeline-choice.md)
- Netlify wiring locked (via spec 014 §A.3): root `netlify.toml` (`pnpm nx build web` → `apps/web/dist`, Node 24), SPA fallback `/* → /index.html 200`, security + caching headers (CSP deferred until API origin known), commented `/api/*` proxy placeholder activated when the API host lands; Netlify builds from the repo, never runs tests; deploy previews UI-only until a staging backend exists; env per deploy context in Netlify UI, `VITE_*` only; domain/HTTPS human-gated — [issues/04-netlify-web-deploy.md](issues/04-netlify-web-deploy.md)
- Env/secrets locked: per-app `.env` + committed `.env.example` inventory (root `.env` = compose vars only; api runtime vars move to `apps/api/.env`; Netlify tokens dropped from env files; `STRIPE_PUBLISHABLE_KEY` becomes a client `VITE_`/`EXPO_PUBLIC_` var); packages env-free (drizzle.config CLI-read exception); api validates env at boot via @nestjs/config + zod schema with `registerAs` namespaces (fail-fast); clients get public config only via `VITE_`/`EXPO_PUBLIC_` prefixes (web dev uses Vite proxy, zero env), natives via Gradle props/xcconfig; secrets: gitignored local `.env`, GH Actions secrets, Netlify UI per-context, EAS secrets; **fix `.gitignore` — it doesn't ignore `.env` today** — [issues/05-env-secret-handling.md](issues/05-env-secret-handling.md)

## Not yet specified

- Production hosting for the NestJS API and Postgres — sharpened by 02+03: the artifact is fixed (the `apps/api/Dockerfile` image, built/pushed from GitHub Actions), so the question is now "pick a container host for that image + a managed Postgres (Railway / Fly.io / Render / cloud-managed), including how deploy triggers from CI". Still fog: needs its own research ticket; cost, region (BR latency), and Stripe webhook reachability are the criteria.
- Mobile release CI: Expo EAS builds and app-store signing/release pipelines (TestFlight / Play Console). PR-lane builds for the natives are decided in 03; what remains fog is release artifacts — sharp once the mobile apps exist.
- Staging/preview environments (API + DB per PR? Netlify deploy previews against what backend?) — depends on API hosting (above); CI platform is now fixed (GHA).
- Scheduled jobs / cron runner (nightly billing charge materialization + dunning notifications) — backend map ticket 05 ships an idempotent on-read materialization + manual admin trigger for v1 and explicitly defers the real cron here; sharp once API hosting (above) fixes where a scheduler can live.
- Database migration **execution** at deploy time (drift *check* in CI is decided in 03; `migrate()` runs at deploy per db-01 workflow, but where/when hangs on the API hosting choice above).

## Out of scope

- Kubernetes / production scaling architecture — premature before first deploy; revisit as a fresh effort if needed.
- Multi-region or multi-unit infrastructure — per handoff design backlog.
- Observability/monitoring stack selection — owned as fog in the backend map, not here.

- Production migration/ops roles: dedicated `tatame_owner` WITH BYPASSRLS as migration owner; API login user GRANTed `tatame_app`/`tatame_platform` (surfaced by AUTH.1-5 implementation — SECURITY DEFINER functions rely on owner bypass).
