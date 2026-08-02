# Docker strategy for local dev

Type: grilling
Status: resolved
Blocked by: 01

## Question

What is the local-dev docker strategy? Postgres already runs via the existing `docker-compose.yml`. Decide: whether the NestJS API also runs as a container locally (with watch/hot-reload) or directly on the host against the dockerized Postgres, what other services join the compose file (Stripe CLI webhook forwarder? mail-capture container if Resend needs a local fake? Redis if the backend map adopts queues), compose profiles for minimal vs full stacks, volume/port/naming conventions, and the single-command dev-up experience (`rtk`-prefixed) the README should document.

## Answer

Answered by BOSS (AFK) from the charter and infra-01 (only `apps/api` is a containerization candidate; compose stays at repo root).

### 1. API runs on the host in dev — container is NOT the dev environment

Local dev = dockerized Postgres + `rtk pnpm nx serve api` on the host. Rationale: native
watch/hot-reload and debugger attach, nx local cache, no bind-mount/node_modules
divergence pain, and the natives/web/mobile-rn already run on host anyway (infra-01) —
one mental model. Web (`nx serve web`) and mobile-rn (Expo) are **never containerized in
dev**; natives are irrelevant to compose.

### 2. Prod image: multi-stage Dockerfile at `apps/api/Dockerfile`

Created when `apps/api` is generated. The image is the future deploy artifact (feeds the
API-hosting fog) and the local parity-testing vehicle. Shape:

1. **deps** — `node:24-slim` + corepack-pinned pnpm; `pnpm install --frozen-lockfile`
   with workspace context (build context = repo root, since api depends on
   `@tatame/shared` / `packages/db`).
2. **build** — `pnpm nx build api` (webpack/esbuild output to `dist/`).
3. **runtime** — `node:24-slim`, non-root user, prod deps + `dist/` only,
   `HEALTHCHECK` on the API health endpoint, `CMD ["node", "dist/main.js"]`.
   Config via real env vars only — no `.env` baked into the image (ticket 05).

### 3. Compose profiles

- **Default (no profile)** = `postgres` only. The everyday stack; what `up -d` gives you.
- **`--profile full`** adds an `api` service: `build: { context: ., dockerfile:
  apps/api/Dockerfile }`, `depends_on: postgres: condition: service_healthy`, port
  `${API_PORT:-3000}:3000`, env injected inline in compose (DATABASE_URL pointing at the
  `postgres` service hostname, not localhost). Purpose: **parity testing the prod image
  against local Postgres** — not daily dev.

### 4. What does NOT join compose (and why)

- **Stripe webhook forwarder**: Stripe CLI runs on the host (`rtk stripe listen
  --forward-to localhost:3000/...`) — it needs interactive account login; containerizing
  it adds credential plumbing for zero parity value. Documented in the README when
  Stripe lands (backend-05).
- **Mail capture**: none. Resend is HTTP-API based (no SMTP leg), so mailpit-style
  SMTP-capture containers capture nothing. Dev uses Resend test mode + payload logging;
  revisit only if backend-06 decides otherwise.
- **Redis**: not added until the backend map makes it a hard runtime dependency (queues
  or realtime, backend-09). When it does, it joins the default profile as a core service.
- **Test database**: DB/integration tests use Testcontainers (per db-01/backend-07),
  which spin their own throwaway Postgres. Compose is a dev-runtime concern only.

### 5. Conventions

- Container names: `tatame-<service>` (existing `tatame-postgres` conforms).
- Named volumes: `<service>_data` (existing `postgres_data` conforms).
- Ports host-configurable via root `.env` with safe defaults (`POSTGRES_PORT`,
  `API_PORT`); root `.env` is compose-scope only (ticket 05).
- Default compose network; no custom networks until there is more than one backend
  service.

### 6. Dev-up experience (README-documented)

```
rtk docker compose up -d          # postgres (healthchecked)
rtk pnpm install
rtk pnpm db:migrate               # apply drizzle migrations (db map owns the script)
rtk pnpm nx serve api
```

Parity check when wanted: `rtk docker compose --profile full up --build`.
No wrapper script now — four commands don't justify one; add a root `dev:up` script only
if the sequence grows (e.g. Redis + seed step).
