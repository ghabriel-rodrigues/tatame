# Env & secret handling across apps

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

What are the env/secret conventions across all apps? Decide: the `.env` file taxonomy per app and environment (extending the existing root `.env.example`), naming conventions and a documented variable inventory (DB URL, JWT secrets, Stripe keys + webhook secret, Resend key, per-app API base URLs), how docker compose consumes env locally, validated typed config in the NestJS API (fail-fast on missing vars), how client apps get their build-time public config (web via Netlify contexts and Vite/webpack env; Expo/Kotlin/Swift equivalents) without ever embedding server secrets, where CI/deploy secrets live (CI secret store, Netlify UI), and the rule set for keeping secrets out of git.

## Answer

Answered by BOSS (AFK). Inputs: infra-01 (`packages/*` env-free by boundary rule),
02 (root `.env` is compose-scope; prod image takes real env vars, never a baked file),
03 (GitHub Actions).

### 1. File taxonomy: per-app `.env`, root only for compose

| File | Scope | Contents |
|---|---|---|
| `/.env` | docker compose interpolation only | `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `API_PORT` (profile `full`) |
| `apps/api/.env` | API runtime (dev) | `DATABASE_URL`, `PORT`, `WEB_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| `apps/web/.env` | Vite build-time public config | `VITE_*` only — usually empty in dev (see §4) |
| `apps/mobile-rn/.env` | Expo build-time public config | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY` |
| natives | no dotenv | Android: `local.properties`/Gradle properties; iOS: gitignored `Config.xcconfig` + committed `Config.xcconfig.example`. API base URL only; documented in each app README when they start. |

Every `.env` has a committed sibling `.env.example` — the **variable inventory of
record**. PR rule: a new variable lands in the same PR as its `.env.example` entry and
(for the api) its schema entry (§3).

`packages/*` stay env-free (infra-01 boundary): packages receive config via injection
from apps. One tooling exception: `packages/db`'s `drizzle.config.ts` reads
`DATABASE_URL` from `apps/api/.env` (dotenv path) for drizzle-kit CLI runs — CLI-only,
never at package runtime.

**Refactor of the existing root `.env.example` (task, do now):** keep only the Postgres
block + `API_PORT` at root; move Auth/Stripe/Resend/API blocks to a new
`apps/api/.env.example` when `apps/api` is generated (`API_PORT`→`PORT` there,
`DATABASE_URL` stays pointing at `localhost:${POSTGRES_PORT}`); **drop
`NETLIFY_AUTH_TOKEN`/`NETLIFY_SITE_ID` entirely** — they are deploy-tooling
credentials, not app runtime env; they live in GitHub Actions secrets or the
Netlify↔repo link (ticket 04 owns the wiring). `STRIPE_PUBLISHABLE_KEY` is client-side
config, not API config — it moves to the client examples with public prefixes.

### 2. How compose consumes env

Compose reads root `.env` automatically for `${VAR:-default}` interpolation (already
the case). The `--profile full` api service gets its env inline in the compose file
(DATABASE_URL against the `postgres` service hostname) — it does not mount
`apps/api/.env`, keeping host-vs-container URLs from cross-contaminating. Prod (ticket
02): real env vars from the host's secret store; no env file in the image.

### 3. API: fail-fast typed config — @nestjs/config + zod

- Single source of truth `apps/api/src/config/env.schema.ts`: a zod object typing every
  variable (URLs as `z.string().url()`, ports coerced numbers, secrets
  `z.string().min(32)` in production, TTLs as duration strings).
- `ConfigModule.forRoot({ isGlobal: true, envFilePath: 'apps/api/.env', validate: env
  => envSchema.parse(env) })` — boot **fails with aggregated zod errors** on any
  missing/malformed var; no service starts against half-configured env.
- Typed access via `registerAs` namespaces (`db`, `auth`, `stripe`, `resend`) whose
  factories read from the already-validated object; feature modules inject their
  namespace only (professor-app rule of least privilege applies to config too).
- No class-validator for env (zod is already the contract-validation choice of the
  backend map; one validation vocabulary).

### 4. Client apps: public config only, by prefix construction

- **Rule: a variable reaches a client bundle only via its platform public prefix
  (`VITE_` / `EXPO_PUBLIC_`), and anything under those prefixes is public by
  definition.** Server secrets structurally cannot leak: they live in
  `apps/api/.env`, which no client build reads.
- **Web (Vite)**: dev needs **zero** env — the Vite dev server proxies `/api` →
  `localhost:3000` (proxy config in `apps/web/vite.config.ts`; decision recorded
  here). `VITE_API_URL` exists only for non-proxied contexts: set per deploy context
  (production / deploy-preview / branch) in the **Netlify UI**, consumed at build time
  (ticket 04 wires the contexts). `VITE_STRIPE_PUBLISHABLE_KEY` likewise when the
  store/wallet features land. Typed via `apps/web/src/env.d.ts`
  (`ImportMetaEnv`) + a startup assert that required `VITE_` vars exist in prod builds.
- **Expo RN**: `EXPO_PUBLIC_*` from `apps/mobile-rn/.env` in dev; **EAS env/secrets**
  for build profiles (preview/production) — never committed.
- **Natives**: build-config injection (Gradle `buildConfigField` from properties;
  xcconfig → Info.plist) for the API base URL per build flavor/configuration. No
  secrets exist in mobile apps at all — anything sensitive goes through the API.

### 5. Where secrets live per environment

| Environment | Store |
|---|---|
| Local dev | gitignored per-app `.env` files, seeded by copying `.env.example` |
| CI (GitHub Actions) | repo-level **Actions secrets**; adopt Environments (staging/production) when they exist. CI v1 needs almost none: Testcontainers is self-contained and Stripe/Resend are mocked in unit tests |
| Web deploy | **Netlify UI env vars per deploy context** — `VITE_*` only; server secrets never enter Netlify |
| RN builds | **EAS secrets** (`eas env`) |
| Prod API host | the winning host's secret manager (map fog); the zod schema is the contract it must satisfy — deploy of a misconfigured env fails at boot, loudly |

### 6. Git hygiene ruleset

- **Gap found: the current root `.gitignore` does not ignore `.env` at all.** Fix
  immediately (before any real key exists): add `.env`, `.env.*`, `!.env.example`,
  `!*.env.example`, and (for iOS later) the local `Config.xcconfig`.
- `.env.example` files use placeholder shapes, never real values (`sk_test_xxx`,
  `whsec_xxx` — as already done).
- No secrets in URLs, logs, error messages, or nx target definitions; Stripe/Resend
  keys are test-mode until a production launch checklist says otherwise (charter: base
  services in sandbox mode from day one).
- Rotation = update the store (env file / Actions secret / Netlify UI / EAS), zero code
  change.
- Naming: SCREAMING_SNAKE, service-prefixed groups (`STRIPE_`, `RESEND_`, `JWT_`,
  `POSTGRES_`); public client vars additionally carry the platform prefix.
