# Auth session handling on web

Type: grilling
Status: resolved
Blocked by: 03

## Question

How does the web app handle auth sessions? Authentication + authorization is the first feature (fixed), backed by NestJS. Decide: token storage strategy (httpOnly cookies vs in-memory access token + refresh flow — Netlify static hosting vs API on another origin, CORS/CSRF implications); session bootstrap and route protection (who am I, which persona surfaces am I allowed into, RBAC claims shape consumed from the API); how TanStack Query integrates with token refresh (401 retry, query client reset on logout); multi-tenant session context (active academy) and platform-role impersonation ("entrar como admin" with audit — how the impersonated session is represented and visibly flagged client-side); and password recovery + invite-signup session handoff (Convite flow ends logged in).

## Answer

**Resolved AFK by BOSS charter. Cross-effort caveat:** the backend authn design (`.scratch/backend/issues/02-authn-design.md`) was unresolved when this closed. Everything below marked *(assumption)* is this ticket's proposal for the backend contract; the backend ticket must either adopt it or come back and amend this file. Nothing here relitigates the shared middleware seam from ticket 03 — this ticket fills that seam.

**Token storage: in-memory access token + httpOnly refresh cookie.**
- Access token (short-lived JWT, ~10 min *(assumption)*) lives **only in memory** — a module-singleton auth store in `apps/web` (tiny external store consumed via `useSyncExternalStore`; no Redux/Zustand needed for one value). It is handed to `packages/shared`'s `auth` adapter (ticket 03) as `getAccessToken()` → `Authorization: Bearer` header. This refines ticket 03's "likely no Authorization header" speculation: we DO use a bearer header for API calls, because it is the same contract the 3 mobile apps use — one backend auth story, no cookie-vs-header fork in NestJS guards.
- Refresh token lives in an **httpOnly, `Secure`, `SameSite=Lax` cookie, `Path=/api/auth`** *(assumption on path)*, set by the NestJS auth endpoints. This is only viable because tickets 01/02 made `/api` same-origin in dev (Vite proxy) and prod (Netlify `/api/*` proxy redirect) — the cookie is first-party, no CORS, no third-party-cookie deprecation exposure.
- CSRF: bearer-header APIs are CSRF-immune. The only cookie-authenticated endpoints are `/api/auth/refresh` and `/api/auth/logout`; `SameSite=Lax` + POST-only + a required custom header (`X-Requested-With`) *(assumption)* close the gap. No CSRF-token machinery.
- **Never** localStorage/sessionStorage for any token (XSS-exfiltratable). localStorage is allowed only for non-sensitive prefs (last-used surface, theme).

**Session bootstrap (silent refresh on boot):** before the router renders any guarded route, the app runs one boot sequence: `POST /api/auth/refresh` → on 200, response body carries `{ accessToken, session }` where `session` is the "who am I" payload *(assumption on shape)*:

```
{ user: { id, name, email },
  memberships: [ { surface: "admin",      academyId, academyName, role }
               | { surface: "plataforma", role: "owner"|"suporte"|"financeiro" } ],
  impersonation: null | { academyId, academyName, actorUserId } }
```

Auth store states: `booting → authed | anon`. A top-level `AuthProvider` shows the app shell skeleton during `booting`; guards never run against an unknown session. On 401 at boot → `anon`, land on `/login` (with `?next=` preserved). No separate `/auth/me` call is needed at boot — refresh returns the session; a `GET /api/auth/me` exists for re-validation after impersonation switches *(assumption)*.

**TanStack Query integration:** exactly the ticket 03 seam — `openapi-fetch` middleware does single-flight 401 refresh (one shared in-flight `POST /api/auth/refresh` promise; all 401'd requests await it, then replay once with the new token). Refresh failure → `onAuthLost` event → auth store `anon` + `queryClient.clear()` + redirect `/login`. The web `auth` adapter implements `{ getAccessToken, setAccessToken, refresh, onAuthLost }`; RN later plugs its own storage behind the same interface.

**Route guards (per ticket 02's layout routes):**
- `/admin/*` guard: requires `authed` + (an `admin` membership OR active `impersonation`). Else: `anon` → `/login?next=…`; wrong persona → own surface.
- `/plataforma/*` guard: requires `authed` + a `plataforma` membership. Impersonation does NOT grant plataforma — but ending impersonation returns there.
- Guards are UX only; real RBAC is NestJS. Guards read the auth store synchronously (session already bootstrapped), so no per-navigation fetches.

**Post-login redirect (multi-surface rule):** priority order —
1. `?next=` param (validated: must be a same-app path under `/admin` or `/plataforma` the user's memberships allow; never an absolute URL).
2. Last-used surface from localStorage, if still in memberships.
3. Single membership → that surface.
4. Both admin + plataforma memberships → **`/plataforma`** (BOSS: a platform-role holder is SaaS staff first; they reach any academy via impersonation with audit, which is the governed path — defaulting to `/admin` would encourage un-audited direct admin use). A surface switcher lives in the account menu for these users.
5. Memberships contain only mobile personas (Aluno/Professor/Responsável) → route to a public `/baixe-o-app` landing (per ticket 02): valid credentials, no web surface — do not error, explain and link the stores.

**Impersonation ("entrar como admin"):**
- Start: `POST /api/auth/impersonate { academyId }` from `/plataforma` → backend writes the audit event and binds impersonation **server-side to the refresh session**, returning a new access token whose claims carry `tenant=academyId` + `act: { sub: platformUserId }` (RFC 8693-style actor claim) *(assumption)*. Server-side binding means a page reload silently refreshes back into the impersonated state — the banner never silently disappears or wrongly persists.
- Client transition (both directions): `setAccessToken(newToken)` → **`queryClient.clear()`** (ticket 03's tenant-boundary rule, non-negotiable) → navigate (`/admin` on start, `/plataforma` on end).
- Banner: the `/admin` shell renders a persistent, non-dismissable impersonation banner whenever `session.impersonation` is non-null (driven by the bootstrap/refresh session payload, which mirrors the token claim — the client never decodes the JWT itself): "Operando como {academyName} — sessão auditada" + "Encerrar" button → `POST /api/auth/impersonate/end`.
- End also on refresh-session expiry (server enforces max impersonation TTL *(assumption)*).

**Logout ("sair"):** `POST /api/auth/logout` → server revokes the refresh token + clears the cookie; client: drop in-memory token → `queryClient.clear()` → auth store `anon` → `/login`. Order matters: revoke first, clear regardless of network outcome (logout must never fail closed into a live session).

**Password recovery:** `/login` → "Esqueci minha senha" → `POST /api/auth/password-reset/request` (always 200, no account enumeration; email via Resend — backend ticket 06) → public route `/redefinir-senha/:token` → `POST .../confirm` → success screen → `/login`. **No auto-login after reset** (BOSS: the reset token traveled through email; require one fresh credential entry; also revoke all refresh sessions on reset *(assumption)*).

**Convite signup handoff:** the stepped signup's final submit returns the same `{ accessToken, session }` shape and sets the refresh cookie — the user IS logged in. Then apply the post-login redirect rule: Convite personas are Aluno/Responsável (ticket 02), so this lands on `/baixe-o-app` (academy-branded, "sua conta está pronta — baixe o app para fazer check-in"). If a future invite type carries an admin membership, the same rule routes it to `/admin` with zero extra code.

**Client-state note (map fog):** with this design the only client-side auth state is the singleton auth store (token + session + boot status); active tenant and impersonation are server-derived session facts, never independently client-mutated.
