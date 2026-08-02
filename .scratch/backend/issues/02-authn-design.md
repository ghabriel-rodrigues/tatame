# Authentication design

Type: grilling
Status: resolved
Blocked by: 01

## Question

What is the authentication design? Decide: JWT access/refresh token scheme (lifetimes, rotation, revocation, storage guidance per client — web vs the 3 mobile apps), how sessions relate to persona apps (one account usable across personas vs per-surface login; the same person can be e.g. professor and admin), password reset flow via Resend, invite-link tokens for the public Convite flow (7-day validity, academy+class+plan payload, aluno vs responsável variant, minor-requires-guardian rule), and how "sair" (logout) invalidates state. Authentication + authorization is the fixed first feature, so this design must be complete enough to build against.

## Answer

Answered as BOSS from the charter (`agents/boss.md`). Wiki pages consulted: `LLM_WIKI/raw/skills/nestjs/rules/security-auth-jwt.md` (short-lived access + refresh tokens, minimal payload, strategy re-validates user, CRITICAL), `security-use-guards.md` (global guard + `@Public()` decorator pattern, consumed by ticket 03), `security-rate-limiting.md` (auth-endpoint throttling — graduated to ticket 10). Consistent with the resolved client decisions in `.scratch/mobile-rn/issues/04-auth-session-storage.md` and the pending `.scratch/web/issues/04-auth-session-web.md`.

### Decision: email+password (argon2id) + short-lived JWT access + rotating opaque refresh tokens

**Credentials.** Email + password only; no OAuth/social in v1 (no design surface for it in the handoff). Hashing: **argon2id** via the `argon2` package, OWASP-recommended params (`m=19456 KiB, t=2, p=1`), per-hash salt (built into argon2). A `password_changed_at` column invalidates access tokens issued before a password change (JWT strategy check, per wiki page).

**Access token: JWT, 15 minutes, stateless.** Signed HS256 with `JWT_SECRET` from config (`issuer`/`audience` set). Held **in memory only** on all four clients (rn-04 decision; web-04 will mirror it). Minimal claims:

```
{ sub: userId, sid: sessionId, mem: membershipId, ten: tenantId | null,
  rol: role, imp?: true, iat, exp, iss, aud }
```

- `ten`+`rol` are the **active membership**: authorization (ticket 03) and the RLS `app.tenant_id` GUC (db-02) read straight from the verified token — no per-request membership lookup.
- `ten: null` + platform role (`owner|support|finance`) = platform persona. `imp` is the impersonation flag (ticket 03).
- Never in the payload: email, password hash, permission toggles (those are per-academy data, fetched via `/me` — keeps tokens small and toggle changes effective without re-issue).

**Refresh token: opaque 256-bit random, 30 days, rotating, server-side state.** Stored **hashed (SHA-256** — high-entropy, no need for slow hashing) in the DB. Transport per client:

- **Web**: `httpOnly; Secure; SameSite=Strict; Path=/v1/auth` cookie — never readable by JS (web-04 alignment; API and web app share a site or the cookie is scoped to the API origin with CORS `credentials`).
- **Mobile (RN/Kotlin/Swift)**: returned in the response body, stored in secure storage (expo-secure-store / EncryptedSharedPreferences+Keystore / Keychain), per rn-04.
- Login/refresh accept a `transport: "cookie" | "body"` request field (default `cookie`); the refresh endpoint reads the token from the cookie or the body accordingly. This keeps one endpoint set for all clients in the OpenAPI spec.

**Rotation + family reuse detection.** Every refresh issues a NEW refresh token and marks the old one used (`used_at`, `parent_id` chain). A **session is the token family**: presenting an already-used token = theft signal → revoke the entire session (all descendants) and force re-login. Refresh extends the family but never past an absolute cap of 30 days since login (`sessions.expires_at` is fixed at issue time).

**Sessions table (input to db tickets 03/06).**

- `sessions`: `id, user_id, membership_id, impersonator_user_id NULL, client_platform, user_agent, ip, created_at, last_used_at, expires_at, revoked_at NULL, revoked_reason NULL`. Global table (not tenant-RLS'd — login happens before tenant context exists); platform pool writes, or a dedicated `SECURITY DEFINER`-style seam in the identity module using the platform pool, since `tatame_app` traffic can't see cross-tenant rows.
- `refresh_tokens`: `id, session_id, token_hash, parent_id NULL, created_at, expires_at, used_at NULL`.
- `password_reset_tokens`: `id, user_id, token_hash, created_at, expires_at, used_at NULL`.

### One account, N memberships; switching = token re-issue

One `users` row per person; personas come from **memberships** (`user_academy_memberships`: user + academy + role `aluno|professor|admin|responsavel`; `platform_memberships`: user + role `owner|support|finance`). The same person can be professor in academy A and admin in academy B.

- **Login** (`POST /v1/auth/login`): validates credentials, picks the active membership — the only one if single, else the last-used one (`sessions.membership_id` of the most recent session), else the first — and issues tokens bound to it. Response includes the full membership list so clients can offer a switcher.
- **Switch** (`POST /v1/auth/switch`): body `{ membershipId }`; verifies the membership belongs to `sub`, re-issues the access token (and rotates the refresh token) with new `mem/ten/rol` claims on the **same session**. This is the "trocar de academia/persona" mechanic — no re-login.
- `GET /v1/auth/me`: user profile + all memberships + active membership + academy status + resolved permission toggles (ticket 03) — the client bootstrap call.

Platform users authenticate on the **same** `/v1/auth/login` endpoint; a platform membership is just another membership (with `ten: null`). No separate platform login surface.

### Password reset (Resend)

Handoff marks "Esqueci minha senha" as a stub, but the backend ships the full flow (cheap now, needed by every client later):

1. `POST /v1/auth/password/forgot` `{ email }` → always `202 Accepted` (no account enumeration). If the user exists: create single-use token (256-bit random, SHA-256 hash stored, **1 h expiry**), send via the `infra/resend` module using a `password-reset` template with a deep link (`tatame://reset?token=` + web URL fallback).
2. `POST /v1/auth/password/reset` `{ token, newPassword }` → verifies hash + expiry + unused, sets new argon2id hash, stamps `password_changed_at`, marks the token used, and **revokes all of the user's sessions**.

### Invite-link signup (Convite flow) — the only signup

No self-signup, period ("cadastro via link de convite"). Invite tokens are 256-bit random, stored hashed in `invites` (identity module): `academy_id, class_id, plan_id, kind: aluno|responsavel, created_by, expires_at (7 days), used_at`. Public unauthenticated endpoints (in `identity`, per ticket 01):

- `GET /v1/public/invites/:token` → validates (exists, unexpired, unused) and returns the landing payload (academy name/branding, class, plan, kind) for convite-01.
- `POST /v1/public/invites/:token/accept` → **one DB transaction**: create `user` (email+argon2id password), create membership, create `student` (kind=aluno) or `guardian` + N dependent `students` (kind=responsavel), mark the invite used, emit `identity.invite.accepted` (enrollment listens, per ticket 01 rule 2). **Minor rule enforced here**: an `aluno` invite for a minor (birthdate in payload) is rejected with `422 code: "invite.minor_requires_guardian"` — minors only enter via the responsável variant. Response: full token pair (convite-05: "sucesso levando ao app logado").

Because accept must write into a tenant before any session exists, it runs on the identity module's controlled seam (same pattern as login), then normal RLS applies from the first authenticated request.

### Logout ("sair") and revocation

- `POST /v1/auth/logout`: revokes the current session (`revoked_at`, reason `logout`) → refresh family dead; clears the web cookie. The in-memory access token is dropped client-side; worst-case validity of a stolen access token is ≤ 15 min (accepted trade-off; no denylist in v1 — revocation-sensitive actions like impersonation get shorter TTLs in ticket 03).
- `POST /v1/auth/logout-all` (profile "sair de todos os dispositivos" later; also invoked by password reset): revokes all user sessions.
- Suspension/delinquency does NOT revoke sessions — it's an authorization concern (ticket 03 guard), so reactivating an academy needs no mass re-login.

### 2FA

- **Platform users: optional TOTP** (RFC 6238, `otpauth://` QR, encrypted secret at rest, 10 single-use recovery codes hashed). Endpoints: `POST /v1/auth/totp/setup` (authenticated, returns provisioning URI), `POST /v1/auth/totp/enable` `{ code }`. Login for a TOTP-enabled user returns `202` with a short-lived (5 min) `challengeToken` instead of tokens; `POST /v1/auth/login/totp` `{ challengeToken, code }` completes it. Enforcement (mandatory for `owner`) is a config flag, off in v1.
- **Academy users: FOG** — no design surface in the handoff; noted in the map, not built in v1. The challenge-step login shape above is the extension point.

### Endpoint summary (`identity` module, all under `/v1`)

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /auth/login` | public | credentials → token pair (or TOTP challenge) + memberships |
| `POST /auth/login/totp` | challenge token | complete 2FA login |
| `POST /auth/refresh` | refresh token (cookie/body) | rotate pair, reuse detection |
| `POST /auth/switch` | bearer | re-issue tokens for another membership |
| `POST /auth/logout` | bearer | revoke current session |
| `POST /auth/logout-all` | bearer | revoke all sessions |
| `GET /auth/me` | bearer | user + memberships + active context + toggles |
| `POST /auth/password/forgot` | public | send reset email (202 always) |
| `POST /auth/password/reset` | public | consume token, set password, revoke sessions |
| `POST /auth/totp/setup` / `POST /auth/totp/enable` | bearer (platform) | opt-in 2FA |
| `GET /public/invites/:token` | public | invite landing payload |
| `POST /public/invites/:token/accept` | public | atomic signup, returns token pair |

Problem+json codes (registry per ticket 04): `auth.invalid_credentials`, `auth.token_expired`, `auth.refresh_reused`, `auth.mfa_required`, `auth.mfa_invalid_code`, `invite.invalid_or_expired`, `invite.minor_requires_guardian`, `reset.invalid_or_expired`.

### Implications

- **03 (authz)**: guards read `sub/sid/mem/ten/rol/imp` from the verified token; `ten` feeds `withTenant` (db-02); impersonation mints a session with `impersonator_user_id` set.
- **05 (Stripe)**: no auth coupling; Stripe webhook endpoints are `@Public()` + signature-verified (never bearer-authed).
- **06 (Resend)**: first two templates fixed — `password-reset` and (post-signup) `welcome/invite-accepted`; token links must carry deep link + web fallback.
- **07 (tests)**: mandatory e2e cases — refresh reuse → family revoked; switch to a membership you don't own → 403; expired/used invite → 404/410; minor aluno invite → 422; reset token single-use; unset-GUC fail-closed already covered by db-02's meta-test.
- **Rate limiting** on `login`, `password/forgot`, `public/invites/:token/accept` is now sharp → graduated to `issues/10-rate-limiting-abuse-controls.md`.
