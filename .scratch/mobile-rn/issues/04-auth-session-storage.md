# Auth & session storage

Type: grilling
Status: resolved

## Question

How does the RN app store and refresh sessions — `expo-secure-store` for tokens (size limits, biometric gating?), access/refresh token lifecycle (silent refresh, clock skew, concurrent-request refresh locking), session restoration on cold start (splash → login vs splash → home per handoff), multi-tenant context in the session (academy binding), logout/suspension handling (academy suspension blocks access; delinquency → read-only mode), and how the auth state integrates with TanStack Query (query invalidation on login/logout, authenticated fetcher)?

## Answer

Answered as BOSS per the AFK wayfinder convention (charter: `agents/boss.md`).

### Token storage

- **Access token: memory only** (module-level auth store; zustand or a small context). Never persisted — an in-memory token dies with the process, which is the correct blast radius.
- **Refresh token: `expo-secure-store`** (Keychain/Keystore). Store ONLY the opaque refresh token string — well under secure-store's 2 KB per-key value limit; never store user/profile JSON there. Key: `tatame.refreshToken`. Use `WHEN_UNLOCKED_THIS_DEVICE_ONLY` accessibility; no iCloud/device migration of tokens.
- **Biometric gating of the refresh token (`requireAuthentication`) is FOG** — noted in the map. v1 ships without biometric unlock; the storage call site must isolate the secure-store options so flipping it on later is a one-file change.

### Refresh lifecycle

- **Fetch-layer interceptor, consistent with web's openapi-fetch middleware decision** (`.scratch/web/issues/03`): the shared API client package exposes middleware that (a) injects `Authorization: Bearer` from the auth store, (b) on 401, runs refresh and replays the request once. RN and web share the middleware shape; only the token-persistence adapter differs (secure-store vs web's storage decision).
- **Single-flight refresh lock**: one shared in-flight refresh promise; concurrent 401s await it, then replay. Refresh failure (revoked/expired) → hard logout.
- **Clock skew**: the server's 401 is the source of truth — never trust device-clock `exp` comparisons for correctness. Proactive refresh (when `exp - now < 60s`) is an optimization only.

### Cold start / session restoration

- Splash (handoff: gradient + glass logo, ~1.9s) → read refresh token from secure-store → if present, silent refresh in parallel with the splash animation → **home shell for the user's role**; if absent or refresh fails → login. Offline-with-stored-token: enter the app shell in a degraded/stale state rather than bouncing to login (matters for ticket 05's check-in queue).

### Personas & multi-tenant

- **One binary, all 3 mobile personas** (Aluno / Professor / Responsável). Persona is decided by the authenticated user's role claim; navigation is role-scoped after login. Separate per-persona apps are REJECTED: triple store/EAS overhead, and invite-link onboarding lands everyone in the same install. This binds ticket 02: root navigator switches shell on `session.role`.
- **Plataforma and Admin-da-academia are NOT in mobile v1** — they are web consoles. Mobile login by such a role gets a polite "use the web console" screen. Do not scaffold their shells.
- **Academy binding**: session context carries `academyId` + academy status from the token claims / `whoami`. Suspension → blocking screen (access denied, contact academy); delinquency → `readOnly` flag in session context that feature surfaces must respect (mutations disabled). Enforcement is server-side; the flag is UX.

### Logout / revocation

- Logout: call revoke endpoint (best-effort), delete secure-store refresh token, clear in-memory access token, `queryClient.clear()`, reset navigation to **login** (handoff: "sair volta ao login"). Server-side revocation detected via failed refresh follows the same path with a session-expired toast.

### TanStack Query integration

- Auth state lives OUTSIDE the query cache (the auth store); queries depend on it via the authenticated fetcher from the shared client package. Login: set store → navigate → queries mount fresh. Logout: `queryClient.clear()` (not invalidate — cross-user cache bleed is a tenant-isolation bug, see charter rule 3).

### Implications for blocked tickets

- **02 (navigation)**: public stack (splash/login/recovery/invite) + role-switched authenticated shells in one navigator tree; no per-persona entry points.
- **05 (offline check-in)**: offline cold start keeps the shell alive on stale session; queued mutations replay only after a successful refresh — the queue drains post-reconnect, and a dead refresh token discards the queue with the logout.

Status: resolved
