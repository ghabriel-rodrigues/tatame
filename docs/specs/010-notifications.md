# 010 — Notifications (Phase 10)

Follows the to-spec template. UI truth: aluno-20-notificacoes, responsavel-09-notificacoes, the perfil "Notificações" switch rows and the home-header bell in the aluno/professor/responsável prototypes. Business truth: handoff README ("Notificações centrais em todas as personas"; lists pagamento, evento, graduação, frequência). Domain-event truth: the emitters shipped by phases 4–9.

## Problem Statement

Everything that matters to a persona already _happens_ in the product — a mensalidade materializes, a charge goes overdue, a payment settles, a professor awards a degree, an event opens inscriptions, an order becomes ready for pickup — but nothing _tells_ anyone. The aluno discovers the mensalidade by opening the Carteira; the responsável discovers the child's new grau by scrolling a timeline; the admin's Comunicar button emits an event into the void. Every phase since 4 has ended domain flows with "notifications stay listener-only, delivery is its own phase". This is that phase: the central in-app notification feed each prototype already renders, with an unread badge on the bell every mobile home header carries.

## Solution

A tenant-scoped `notifications` table (one row per recipient user), filled by a new backend `notifications` module that only _listens_: it subscribes to the post-commit domain events the other modules already emit (billing.\*, events.\*, attendance.\*, store.\*, plus a new `graduation.awarded` event this phase adds) and synchronously inserts PT-BR notification rows for the right audience — payer, guardian variant, registered inscritos, tenant-wide on publish, admins on low stock. The emitting modules are not touched beyond two additive payload fields; the be-01 "notifications is a listener-only concern" rule finally lands as real code.

Clients get a persona-neutral read API — cursor list, unread count, mark-read (single and all) — and each mobile shell gets the prototype's bell-with-dot in the home header opening the Notificações screen (card rows with icon chips and relative timestamps), which marks everything read on open. The perfil "Notificações" switch becomes a real per-user mute: rows are still written, the badge goes quiet. The admin console gets a header bell with a dropdown panel. No push, no e-mail, no realtime — v1 is pull-based in-app feed; everything else is recorded debt.

## User Stories

### Aluno

1. As an aluno, I want a bell with an unread dot in my home header, so that I know something happened without hunting through tabs.
2. As an aluno, I want a Notificações screen listing my notifications (icon chip, title, subtitle, relative timestamp) per aluno-20, so that I catch up in one place.
3. As an aluno, I want a notification when my mensalidade is available and when it goes overdue, so that I pay on time — tapping it lands me in the Carteira.
4. As an aluno, I want a payment confirmation notification when my mensalidade settles, so that I have a receipt trail.
5. As an aluno, I want a notification when I receive a degree or a new belt ("Você recebeu o 2º grau — Registrado pelo Prof. …"), so that the moment is celebrated even if I missed class announcements.
6. As an aluno, I want a notification when the academy publishes an event ("Open mat de verão — confirme sua presença"), and when an event I registered for is announced or canceled, so that I never miss event news.
7. As an aluno, I want notifications for my store order lifecycle (pago/pronto para retirada/entregue/estornado), so that I know when to pick up my kimono.
8. As an aluno, I want opening the Notificações screen to clear the unread badge, so that the dot always means something new.
9. As an aluno, I want the Notificações switch in my perfil to silence the badge, so that the app stops nagging me without deleting my history.

### Responsável

10. As a responsável, I want notifications about my dependents — mensalidade em aberto with one-tap Pix, "Pedro recebeu o 3º grau na faixa cinza", check-in/frequência updates, kids event inscriptions — per responsavel-09, so that I follow each child without opening every tab.
11. As a responsável, I want charge notifications addressed to me (not the minor) whenever I am the bill-to guardian, so that the payer is the one notified.
12. As a responsável, I want event notifications when I confirm (or the academy cancels) a dependent's registration, so that per-child event state is always visible.

### Professor

13. As a professor, I want the same bell + Notificações screen, receiving academy event publications and my own store-order updates, so that the persona is not a dead end.

### Admin

14. As an admin, I want a bell in the console header with an unread badge and a notification panel, so that operational alerts reach me where I work.
15. As an admin, I want a low-stock notification when a paid order crosses a product's threshold, so that I restock before selling out.
16. As an admin, I want the Comunicar button on an event to actually deliver — every confirmed inscrito gets a notification row, so that "Comunicado enviado aos inscritos" is true.

### Cross-cutting

17. As any user, I want notifications scoped to the academy context I am in, so that a user with two academies never sees crossed feeds.
18. As any user, I want only my own notifications visible, so that another member of my academy can never read my feed.
19. As a user without a login (minor without account), I am silently skipped by fan-out, so that no orphan rows accumulate.
20. As the platform, I want fan-out failures logged but never breaking the emitting flow (a failed insert must not fail a check-in), so that notifications stay a strictly additive concern.

## Implementation Decisions

### Schema — one table, one flag

- **New enum** `notification_category` (`payment`, `event`, `graduation`, `attendance`, `store`) — the closed icon vocabulary of the prototypes (R$ chip, date chip, grau chip, initials chip, store chip). English in schema per charter; clients render PT-BR.
- **`notifications`** (tenant-scoped, forced RLS, standard `tenant_id` policy): `user_id` FK→users NOT NULL (recipient — plain FK, users are auth-global, same precedent as `orders.buyer_user_id`); `category`; `chip text NULL` (pre-rendered chip label from the prototypes — `"R$"`, `"15"`, `"2º"`, initials; nullable, clients fall back to a category icon); `title text NOT NULL`; `body text NULL`; `route text NULL` — a **semantic deep-link hint** (`wallet`, `event/{eventId}`, `graduation`, `orders`, `store`), mapped to each shell's local navigation client-side so DB rows never encode router paths; `read_at timestamptz NULL`; standard timestamps. Indexes: `(tenant_id, user_id, created_at)` for the list, partial `(tenant_id, user_id) WHERE read_at IS NULL` for the badge count.
- **Recorded deltas vs database ticket 03**: `type text` becomes the `category` enum + `chip`, and `data jsonb` becomes `route text` — the feed is render-ready text, not a client-side template engine. Reads additionally filter `user_id = ctx.userId` in the service (the uniform tenant RLS policy stays untouched; personal scoping is service-enforced, matching how every persona endpoint already scopes).
- **`memberships.notifications_enabled boolean NOT NULL DEFAULT true`** — the per-user mute switch, per membership (per academy), no new table. Chosen over a `user_preferences` shape: it is one flag, membership is exactly the (user, academy) grain the switch means, and ticket 03 already routes per-academy user state through memberships.
- **Retention**: rows older than 180 days are prunable; v1 ships the policy as documentation only — the pruning job is recorded debt.

### The listener-only fan-out module

- A new backend `notifications` module. Its write side is **only** `@OnEvent` handlers on the existing `@nestjs/event-emitter` bus — no service in any other module ever inserts a notification directly, and no emitting module imports this one. Handlers open their own `withTenant` context from the event's `tenantId`, resolve recipients, and **batch-insert synchronously — no queue in v1**. In-process at-most-once is accepted: a crash between commit and fan-out loses that notification. The transactional outbox + queue upgrade is recorded debt.
- Every handler is wrapped catch-and-log: a fan-out failure never surfaces to the emitting request (which has already committed and responded anyway).
- Recipient resolution: `studentId`/`guardianId` resolve to `students.user_id`/`guardians.user_id` inside the tenant context; **null user_id (no login) ⇒ skip silently**. The `audience: 'student' | 'guardian'` field the billing/events emitters already carry picks the addressee. Tenant-wide fan-out (event published) targets active memberships with role `student`, `professor` or `guardian`, deduplicated by user (admins authored the event; they are excluded).
- **Two additive changes to emitters** (this phase's only touch on other modules):
  1. The billing charge events gain an `origin` field (`plan` | `event` | `order`) so the listener notifies `billing.charge.*` **only for plan-origin charges** — event and order payments are already covered by their own richer events (`events.registration.confirmed`, `store.order.paid`); without the filter every event/order payment would double-notify.
  2. A new **`graduation.awarded`** domain event, emitted post-commit by the award path (mirroring the attendance pattern: emit after `withTenant` returns), carrying tenant, student (id + name), belt name, degree, kind, awarder display name and the guardian audience pair. Not emitted for the initial-belt seed at student creation; revocations stay audit-only (a correction is not news). The graduation module keeps its audit seam untouched.
- The mute flag does **not** gate insertion: **rows are always written; mute suppresses the unread count** (endpoint returns 0) and any future push. Justification: the feed doubles as the receipt/history trail (comprovantes, graduations), so re-enabling the switch must restore a complete history; it also keeps fan-out branch-free — one batch insert, no per-recipient preference join on the hot path.

### Event → notification mapping

PT-BR templates composed server-side at insert time (product is BR-only in v1; locale-aware templates are recorded debt). Copy anchored to the prototype fixtures.

| Domain event                                                                 | Recipients                                                        | Cat.       | Chip             | Title / body (guardian variant)                                                                                                                       | Route        |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------- | ---------- | ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| `billing.charge.created` (origin=plan)                                       | payer per `audience`                                              | payment    | `R$`             | "Mensalidade de {mês} disponível" / "Vence em {data} · R$ {valor}" — g: "Mensalidade de {aluno} disponível"                                           | `wallet`     |
| `billing.charge.overdue` (origin=plan)                                       | payer                                                             | payment    | `R$`             | "Mensalidade em aberto" / "R$ {valor} · venceu em {data} · pague com Pix em 1 toque" — g: "Mensalidade de {aluno} em aberto"                          | `wallet`     |
| `billing.charge.paid` (origin=plan)                                          | payer                                                             | payment    | `R$`             | "Pagamento confirmado" / "Mensalidade de {mês} · R$ {valor}"                                                                                          | `wallet`     |
| `billing.charge.refunded` (origin=plan)                                      | payer                                                             | payment    | `R$`             | "Pagamento estornado" / "Mensalidade de {mês} · R$ {valor}"                                                                                           | `wallet`     |
| `events.event.published`                                                     | all active student/professor/guardian memberships (dedup by user) | event      | day-of-month     | "{nome}" / "{data} às {hora} — confirme sua presença" (+ " · R$ {valor}" when paid)                                                                   | `event/{id}` |
| `events.event.canceled`                                                      | payload audience (registered)                                     | event      | day              | "{nome} foi cancelado" / "Inscrições canceladas — pagamentos serão estornados"                                                                        | `event/{id}` |
| `events.registration.confirmed`                                              | acting audience                                                   | event      | day              | "Presença confirmada — {nome}" — g: "{aluno} confirmado em {nome}"                                                                                    | `event/{id}` |
| `events.registration.canceled` (`via` ≠ `self`)                              | audience                                                          | event      | day              | "Inscrição cancelada — {nome}" / body per `via` (evento cancelado / estorno)                                                                          | `event/{id}` |
| `events.announcement.requested`                                              | payload audience (inscritos)                                      | event      | day              | "Lembrete: {nome}" / "Comunicado da academia — confira os detalhes do evento"                                                                         | `event/{id}` |
| `attendance.checkin.recorded`                                                | guardian of the student (minors with linked guardian only)        | attendance | student initials | "{aluno} fez check-in" / "Presença registrada às {hora}"                                                                                              | —            |
| `attendance.revoked`                                                         | nobody (internal correction)                                      | —          | —                | —                                                                                                                                                     | —            |
| `graduation.awarded` (new)                                                   | student + guardian                                                | graduation | `{n}º` / belt    | degree: "Você recebeu o {n}º grau" / "Registrado pelo Prof. {nome}" — belt: "Nova faixa: {faixa}" — g: "{aluno} recebeu o {n}º grau na faixa {faixa}" | `graduation` |
| `store.order.paid`                                                           | buyer                                                             | store      | `R$`             | "Pedido #{n} pago" / "{produto} — retire na recepção da academia"                                                                                     | `orders`     |
| `store.order.ready`                                                          | buyer                                                             | store      | `#{n}`           | "Pedido #{n} pronto para retirada" / "Passe na recepção da academia"                                                                                  | `orders`     |
| `store.order.delivered`                                                      | buyer                                                             | store      | `#{n}`           | "Pedido #{n} entregue" / "Bom treino com o equipamento novo!"                                                                                         | `orders`     |
| `store.order.canceled` (`refunded=true` only; buyer self-cancel is not news) | buyer                                                             | store      | `#{n}`           | "Pedido #{n} cancelado" / "Estorno do Pix em até 1 dia útil"                                                                                          | `orders`     |
| `store.product.low_stock`                                                    | all active admin memberships                                      | store      | `!`              | "Estoque baixo: {produto}" / "{qty} unidades restantes (alerta em {threshold})"                                                                       | `store`      |

### Endpoints

Persona-neutral (any authenticated tenant membership), versioned prefix, in the OpenAPI document:

| Endpoint                                                      | Purpose                                                    |
| ------------------------------------------------------------- | ---------------------------------------------------------- |
| `GET /notifications?cursor=`                                  | own rows, newest first, cursor-paged (~30)                 |
| `GET /notifications/unread-count`                             | `{ count }` — returns 0 when the membership is muted       |
| `POST /notifications/:id/read`                                | mark one read (idempotent; foreign/cross-tenant id → 404)  |
| `POST /notifications/read-all`                                | mark all own rows read                                     |
| `GET /notifications/settings` · `PUT /notifications/settings` | read/flip `notifications_enabled` on the active membership |

Mark-read and settings routes carry `@BypassReadOnly` (payment-routes precedent): a delinquent academy's members still read and clear their own inbox. Platform sessions have no tenant context — the platform console renders no bell in v1 (no platform-scoped events exist yet; platform notifications — academy delinquency, new signups — are recorded debt).

### Client scope split

- **Web (admin console)**: a bell button in the ConsoleShell header (admin surface only) with the pink unread dot, opening a dropdown panel — notification cards (chip, title, body, relative time), badge polling via the standard TanStack Query focus/refetch behavior, "read-all" fired on panel open. The perfil-less console gets no mute switch v1 (admin config screen ships with the white-label phase; the prototype's "Notificações automáticas" academy-level toggle is **deferred to that phase** — recorded, not silently dropped).
- **Mobile (RN, Android, iOS)**, each shell (aluno, professor, responsável), each a tracked parity task:
  - Home header gains the prototype's 42px round bell with the pink-500 unread dot (left of the avatar), fed by `unread-count` refetched on screen focus.
  - A Notificações screen per aluno-20 / responsavel-09: back-arrow header, card rows (38px rounded icon chip in purple-50/purple-600 tones, bold 13.5 title, 12px body, 11px relative timestamp — Hoje/Ontem/weekday/month), cursor pagination on scroll, empty state. Opening the screen fires `read-all`; the dot dies.
  - Rows with a `route` navigate on tap via the semantic-route → shell-route map (guardian `wallet` → Pagamentos tab, etc.); unknown/null routes are inert.
  - Perfil gains the "Notificações" ListRow with a switch (bell icon, per prototype) wired to the settings endpoints — mute kills the badge, screen stays reachable.
- All copy PT-BR client-side for labels ("Notificações", empty state), row content comes rendered from the API; chips and colors via Lumira tokens through the design-system package — no hardcoded hex. Schema, event names, enum values English per charter.

## Testing Decisions

- Same doctrine as specs 001–009 (their suites are the prior art): behavior through the API against real Postgres with RLS active; fan-out is asserted by driving the **real emitting flows** (materialization run, simulate payment, award endpoint, publish/announce, order transitions) and reading `GET /notifications` — never by poking the listener directly or asserting SQL.
- Fan-out e2e: plan materialization → payer row (guardian bill-to → guardian row, minor without login → no row); overdue flip → overdue row; simulate payment of plan charge → paid row; event-origin payment → registration-confirmed row and **no** billing row (origin filter pinned); publish → rows for student/professor/guardian members, none for admin, dedup for multi-role users; announce → exactly the inscritos; event cancel → registered audience with refund copy; award degree/belt → student + guardian rows with prototype copy; check-in → guardian row only; order paid/ready/delivered/refund-cancel → buyer rows; buyer self-cancel → none; low stock → all admins.
- Read API e2e: cursor ordering; unread-count arithmetic; single mark-read idempotent + 404 on foreign id; read-all; mute → count 0 while list still serves and rows keep inserting; read-only academy passes mark-read/settings through the bypass.
- RBAC + RLS: cross-tenant notification ids → 404 via the fail-closed meta-test pattern; a two-academy user sees disjoint feeds per context; another member of the same tenant never sees my rows.
- Listener robustness: a handler failure (recipient resolution throwing) logs and does not fail the emitting request's flow.
- Web: component spec for the bell + panel (dot presence, open → read-all, card rendering) per the established page-spec pattern.
- Mobile: pure-logic tests for the relative-timestamp formatter and the semantic-route → shell-route map per persona; one integration test per client for bell dot → open screen → list renders → dot cleared.

## Out of Scope

- Push notifications (expo-push / FCM / APNs) — recorded debt; the feed and templates are designed so push becomes a second delivery channel on the same rows.
- E-mail digests and any Resend-backed notification mail; real-time SSE/socket badge updates (poll/focus-refetch only).
- Transactional outbox / queue / retries — synchronous in-process fan-out is the v1 contract, upgrade recorded as debt.
- Derived "insight" notifications from the professor prototype (quase graduando, faltas seguidas, monthly frequência milestones like "Júlia completou 13 aulas no mês") — computed analytics, not domain events; recorded debt. v1's `attendance` category ships the per-check-in guardian row only.
- Admin broadcast composer beyond the existing event Comunicar; platform-persona notifications and the platform-console bell.
- The academy-level "Notificações automáticas" config toggle (admin white-label/config phase) and per-category preferences; locale-aware templates; notification deletion UI; the 180-day pruning job.

## Further Notes

- This phase consumes the standing "notifications stay listener-only, delivery is its own phase" notes written into billing.events/events.events/store.events headers and closes the Comunicar void — `events.announcement.requested` finally has a consumer. Update the README notes accordingly.
- Graduation intentionally gains its first bus event here; its audit seam (`graduation.awarded` audit action) is unchanged — audit is the record, the bus event is the announcement.
- Timestamps render relative in PT-BR (Hoje/Ontem/weekday/month abbreviation) client-side from `created_at`; amounts arrive pre-formatted inside title/body strings (composed from integer cents server-side).
- Delivery follows the fixed order DB → backend → web → mobiles; the checklist below is mirrored into the root README, and checking a box there is the only "ticket closing" this project has.

## Delivery Checklist

- [ ] NOT.1 DB: notification_category enum + notifications table (user_id recipient FK, category/chip/title/body/route/read_at, list + partial-unread indexes, forced tenant RLS) + memberships.notifications_enabled flag
- [ ] NOT.2 DB: dev seeds — mixed read/unread notifications across all five categories for the fixture personas in both academies (badge and list demoable on first login)
- [ ] NOT.3 Backend: emitter deltas — origin field on billing charge events + new graduation.awarded post-commit event (student+guardian audience, not emitted for initial-belt seed or revocations)
- [ ] NOT.4 Backend: notifications module fan-out listeners for the full mapping table (payer/guardian addressing, plan-origin filter, tenant-wide publish fan-out with dedup, inscritos announce, guardian check-in, buyer order lifecycle, admin low stock; skip recipients without login; batch insert, catch-and-log)
- [ ] NOT.5 Backend: read API — cursor list, unread-count (0 when muted), mark-read single + all, settings get/put on the active membership, @BypassReadOnly on mark-read/settings, OpenAPI updated
- [ ] NOT.6 Backend: e2e suite green — fan-out via real flows per event, origin double-notify guard, mute semantics, RBAC/RLS/cross-tenant 404s, read-only bypass, listener failure isolation
- [ ] NOT.7 Web: admin ConsoleShell bell + unread dot + notifications panel (cards, read-all on open); no bell on plataforma surface (platform notifications recorded debt)
- [ ] NOT.8 RN: aluno — home header bell with dot, Notificações screen per aluno-20 (chips, relative timestamps, pagination, read-all on open, route taps), perfil Notificações switch wired to settings
- [ ] NOT.9 RN: professor + responsável — same bell/screen/switch scope per shell (responsavel-09; guardian routes map to Pagamentos/dependents)
- [ ] NOT.10 Android: aluno notifications (NOT.8 scope)
- [ ] NOT.11 Android: professor + responsável notifications (NOT.9 scope)
- [ ] NOT.12 iOS: aluno notifications (NOT.8 scope)
- [ ] NOT.13 iOS: professor + responsável notifications (NOT.9 scope)
