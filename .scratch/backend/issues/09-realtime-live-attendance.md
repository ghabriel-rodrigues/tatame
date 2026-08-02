# Realtime strategy for live attendance

Type: research
Status: open

## Question

The professor's live attendance screen (live code/QR session) needs to reflect student check-ins as they happen, and REST (ticket 04) does not cover server-push. Decide the realtime mechanism for this surface — options: short polling of a REST endpoint (simplest, works identically in all 4 generated clients), SSE, or a WebSocket gateway (`@nestjs/websockets`). Constraints: must be implementable with reasonable parity in web TS, Expo RN, Kotlin, and Swift; scope is small (one screen, one room per live code, low fan-out per academy); check-in writes stay REST — this is read-side only. Also decide whether the same channel later serves in-app notification badges or whether notifications stay poll/push-based (coordinate with the notification pipeline fog item).

## Context

- Attendance module owns live codes (`issues/01-nestjs-module-layout.md`); contract style is REST + OpenAPI (`issues/04-api-contract-style.md`) — whatever is chosen here is an explicit exception to, not a replacement of, the REST contract.
- Charter rule: check-in unique per class per student; the live screen must show accepted check-ins only.
