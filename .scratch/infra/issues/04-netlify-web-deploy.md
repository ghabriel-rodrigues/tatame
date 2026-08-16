# Netlify deploy wiring for web

Type: research
Status: resolved
Blocked by: 01, 03

## Question

How is the React web app deployed to Netlify from the nx monorepo? Research and define: build wiring (base directory, `nx build web` command, publish directory, monorepo-aware settings), Netlify-side build vs CI-built artifact deploy (and how that interacts with the chosen CI pipeline), deploy previews per PR and what API they point at, SPA redirect rules and security headers, environment-variable configuration per deploy context, and custom-domain/HTTPS expectations. Netlify as the web host is a fixed decision; this ticket wires it, not questions it.

## Answer

Resolved as BOSS (AFK), recorded in full in `docs/specs/014-release.md` (Implementation
Decisions §A.3 — the answer of record). Gist:

- `netlify.toml` at repo root: `base = "."`, `command = "pnpm nx build web"`,
  `publish = "apps/web/dist"`, Node 24.
- SPA fallback `/* → /index.html 200`; security headers (nosniff, DENY framing,
  referrer policy) + immutable caching for `/assets/*`. CSP deferred until the API
  origin is known.
- `/api/*` proxy redirect ships as an explicit commented placeholder pointing at
  `<PRODUCTION_API_ORIGIN>` — activated when the API host exists (map fog H3);
  until then production builds use `VITE_API_URL` per infra-05 §4.
- Build model: Netlify builds from the repo (not a CI artifact); Netlify never runs
  tests (web-07). Deploy previews come free with the repo link and are UI-only until
  a staging backend exists (recorded fog).
- Env per deploy context in the Netlify UI, `VITE_*` only (infra-05 §5); contract
  documented in `docs/RELEASE.md`.
- Custom domain/HTTPS: human-gated (spec 014 RLS.H2/H8; runbook page in
  `docs/RELEASE.md`).
