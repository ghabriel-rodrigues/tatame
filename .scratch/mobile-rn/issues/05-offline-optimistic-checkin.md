# Offline & optimistic patterns for check-in

Type: grilling
Blocked by: 04

## Question

What offline/optimistic strategy does check-in use? The handoff's check-in sheet (QR / 4-digit code / manual) must feel instant — success pop animation + streak count — while enforcing "check-in unique per class per student" server-side. Decide: optimistic mutation with rollback via TanStack Query, retry/queue behavior on flaky gym Wi-Fi, idempotency keys for duplicate submissions, how the duplicate-check-in state is surfaced, and the general offline posture for the rest of the app (cache-and-refetch only vs any persisted query cache).
