# Realtime strategy for live attendance

Type: research
Status: resolved

## Question

The professor's live attendance screen (live code/QR session) needs to reflect student check-ins as they happen, and REST (ticket 04) does not cover server-push. Decide the realtime mechanism for this surface — options: short polling of a REST endpoint (simplest, works identically in all 4 generated clients), SSE, or a WebSocket gateway (`@nestjs/websockets`). Constraints: must be implementable with reasonable parity in web TS, Expo RN, Kotlin, and Swift; scope is small (one screen, one room per live code, low fan-out per academy); check-in writes stay REST — this is read-side only. Also decide whether the same channel later serves in-app notification badges or whether notifications stay poll/push-based (coordinate with the notification pipeline fog item).

## Context

- Attendance module owns live codes (`issues/01-nestjs-module-layout.md`); contract style is REST + OpenAPI (`issues/04-api-contract-style.md`) — whatever is chosen here is an explicit exception to, not a replacement of, the REST contract.
- Charter rule: check-in unique per class per student; the live screen must show accepted check-ins only.

## Answer

Resolved by BOSS per charter (AFK).

### Decision: SSE (server → professor, read-only) + short-lived signed ticket auth + REST polling fallback

**Transport: Server-Sent Events**, via Nest's built-in `@Sse()` on a professor-surface route in the attendance module: `GET /v1/professor/live-codes/:id/stream?ticket=...`.

- **Why SSE over WebSocket**: the surface is strictly one-directional — check-ins arrive via the normal REST `POST` (student app), the professor screen only *receives*. SSE is plain HTTP/1.1: it traverses the Vite dev proxy and Netlify proxy without upgrade handling, needs no `@nestjs/websockets` gateway, no socket.io client on 3 native apps, no sticky-session concern. WS is **rejected** unless a genuinely bidirectional need appears later (none in the handoff).
- **Why not short-poll as primary**: it works identically in all 4 generated clients, but a roll-call counter climbing live (professor-03) with 2–5 s poll latency feels dead, and polling every professor screen every few seconds is battery/traffic waste for a strictly-push problem. Polling survives as the fallback, below.

### Auth: short-lived signed ticket in the query string

Native `EventSource` cannot set `Authorization` headers, and long-lived bearer tokens in URLs leak via logs. So:

1. Client calls `POST /v1/professor/live-codes/:id/stream-ticket` (normal bearer-auth REST, in the OpenAPI spec) → returns `{ ticket, expiresInSeconds }`: an HMAC-signed, **~60 s TTL, single-purpose** token binding `{ liveCodeId, membershipId, tenantId }`. No DB row needed — stateless signature over server secret.
2. Client opens the SSE URL with `?ticket=...`. The stream guard verifies signature + TTL + that the live code belongs to the ticket's tenant, then populates CLS/`withTenant` exactly like the JWT guard so RLS stays intact. Ticket is accepted only on this one route; it is never a session credential. On reconnect after expiry, fetch a new ticket first (client wrapper handles this).
3. Fetch-based SSE polyfills (which *can* send headers) are **not** required — the ticket keeps web on native `EventSource`; natives use streaming clients anyway (below). This avoids maintaining a polyfill on the one platform where EventSource is free.

### Client cost (all thin, no socket infra)

| Client | Mechanism |
|---|---|
| Web (React) | native `EventSource` |
| Expo RN | `react-native-sse` (tiny, XHR-streaming based) |
| Kotlin | `okhttp3:okhttp-sse` (already on OkHttp via Retrofit) |
| Swift | `URLSession.bytes(for:)` + ~50-line SSE line parser (AsyncSequence) |

The SSE endpoint is an **explicit, documented exception to the OpenAPI contract** (per ticket 04): it is described in the spec (summary + event payload as a component schema so DTO types generate), but the generated clients don't call it — each app wires its streaming client by hand against the shared payload type. The ticket-mint endpoint and the polling endpoint are fully generated REST.

### Protocol & server mechanics

- **Events**: `checkin` `{ attendanceId, studentId, studentName, method, checkedInAt, presentCount }` and `revoke` `{ attendanceId, presentCount }` (ticket db-06 voids decrement the counter); heartbeat comment every 20 s so proxies don't idle-close; `id:` set per event.
- Source of truth stays the DB: the check-in `POST` commits, then emits `attendance.checkin.recorded` on the existing `@nestjs/event-emitter` bus (module-layout ticket 01 already names this event); the SSE controller holds an in-process RxJS Subject per live-code room and forwards. **Accepted check-ins only** by construction — the event fires post-commit, after the unique-constraint gate.
- On (re)connect the client first calls the snapshot REST endpoint, then attaches the stream — no replay complexity; `Last-Event-ID` unused in v1.
- **Scaling**: single API instance in v1 → in-process rooms suffice; if the API ever scales horizontally, swap the Subject for Redis pub/sub behind the same interface (noted as future infra concern, not built now).

### Fallback polling

`GET /v1/professor/live-codes/:id/attendances` (plain generated REST, also serves the initial snapshot). Client wrapper falls back when the stream fails to connect or drops twice: **poll every 5 s** while the roll-call screen is foregrounded, stop on background. 5 s balances liveness against battery for a screen that is open for ~2–10 minutes.

### Scope fence

- **Notification badges do NOT ride this channel.** Rooms are per-live-code, ephemeral, professor-only; a general notification stream has different lifetime/auth/fan-out and stays with the notification-pipeline fog item (poll or platform push there).
- Read-side only; check-in writes remain untouched REST.

### Implications for the Phase-4 spec

- Attendance module gains: `stream-ticket` controller action, SSE controller action, ticket-guard, per-room Subject registry; all inside `attendance/`, no new module.
- Rate-limiting ticket 10 should cover `stream-ticket` minting and concurrent-stream caps per membership.
- Each client tracks a small parity task: SSE wrapper + fallback logic (README parity notes per charter).
