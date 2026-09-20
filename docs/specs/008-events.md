# 008 — Events (Phase 8)

Status: ready-for-agent
Personas covered: Aluno, Responsável, Admin da academia, Professor

## Problem Statement

Events are the last designed surface with zero substrate. The admin has no way to create the "Open mat de verão" or the "Exame de faixa" the handoff renders as gradient cards with Gratuito/R$ chips and a Comunicar button; the aluno home's "Próximos eventos" section was never built; the Agenda's "Eventos do mês" ships the honest empty state Phase 7 recorded as debt; every persona calendar renders a pink-dot legend for events that can never appear because all four AGD endpoints return `events: []` by contract. The responsável's Eventos tab is still the Phase-1 placeholder shell, so per-dependent confirmation — a charter-level rule — exists only as prototype JS. The professor dashboard's "eventos futuros" tile reads "— · Em breve".

The plumbing on the money side is already waiting: `charge_origin` includes `event`, and `charges.event_registration_id` has been a plain nullable uuid since BIL.2, explicitly recorded as pending this slice's table for its composite-FK hardening. Until this phase lands, "gratuito = confirmar direto; pago = sheet Pix" is a README rule with no rows behind it.

## Solution

Two tenant tables and one module fill every stable contract left open for them.

`events` carries what the admin form asks for — nome, descrição, banner as a **gradient preset slug** (no image upload in v1, recorded debt), local, data/hora, valor where empty means gratuito (`price_cents NULL`), plus a responsible professor and a `draft → published → canceled` lifecycle that matches the prototype's "Rascunho · Data a definir" card (drafts may lack date/local; publishing requires both). `event_registrations` is one row per (event, student) with `pending_payment/confirmed/canceled` status and the acting user recorded — the aluno confirming themselves and the guardian confirming a dependent write the same shape. `charges.event_registration_id` becomes a composite tenant FK, closing the BIL.2 delta with the same hardening pattern as Phase 3's `invites.class_id`.

The flows are exactly the handoff's: free event → "Confirmar presença" flips the registration to confirmed on the spot; paid event → "Pagar inscrição" creates the registration in `pending_payment` plus an event-origin charge, and payment rides the **existing** billing rails — same Pix sheet, same wallet payment endpoint, same simulate button, with settlement flowing through the normalized provider-event handler (extended so `payment.succeeded` on an event charge confirms the registration and `payment.refunded` cancels it). The responsável does the same per dependent chip, with the charge billed to the guardian like a mensalidade. The admin gets the Eventos console page — gradient cards, valor chip, inscritos/arrecadado line, Comunicar (which only emits a domain event; delivery is the notifications phase) — and the four AGD endpoints swap their empty arrays for real month-bucketed events, so the pink dots, "Eventos do mês" and the professor's dashboard tile light up on clients that were already built to render them.

## User Stories

### Admin — Eventos

1. As an academy admin, I want an Eventos page listing my events as gradient-banner cards with a Gratuito/R$ chip, date · time line, and "N inscritos · Prof. X" subtitle, so that the program of the academy is one screen.
2. As an academy admin, I want to create an event with nome, descrição, banner (gradient preset), local, data/horário, valor (vazio = gratuito) and responsável, so that the form matches the handoff exactly.
3. As an academy admin, I want a quick-created event to sit as a Rascunho ("Data a definir") until I fill it in, so that creating and publishing are separate gestures.
4. As an academy admin, I want publishing to require date and local, so that students never see an undated event.
5. As an academy admin, I want to edit an event and to cancel it (never hard-delete), so that history referencing it stays intact.
6. As an academy admin, I want an inscritos view per event — who registered, status, who confirmed them, paid amount — with "confirmados" and "arrecadado" totals, so that I can acompanhar inscritos like the handoff promises.
7. As an academy admin, I want a "Comunicar" button per published event that queues an announcement to the inscritos, so that I can reach participants without leaving the card.
8. As an academy admin, I want canceling an event to cancel its open charges automatically, so that nobody is billed for a dead event.

### Aluno

9. As an aluno, I want a "Próximos eventos" section on my home with date-square cards, valor chip and Confirmado state, so that upcoming events find me.
10. As an aluno, I want the Agenda's "Eventos do mês" section filled with the month's real events, so that the Phase-7 empty state retires.
11. As an aluno, I want an event detail screen — gradient banner with the Gratuito/valor chip, data/hora, local, responsável, description — so that one screen answers everything about the event.
12. As an aluno on a free event, I want "Confirmar presença" to confirm me instantly and show the green "Presença confirmada — até lá!" banner, so that gratuito means one tap.
13. As an aluno on a paid event, I want "Pagar inscrição · R$ X" to open the same Pix sheet I pay my mensalidade with, addressed "Inscrição · <evento>", so that paying an event works like every other payment.
14. As an aluno in the simulated environment, I want "Simular pagamento" on that sheet to settle instantly and confirm my inscription, so that the paid flow is demonstrable end to end.
15. As an aluno, I want "Cancelar participação" on a free or not-yet-paid registration, so that opting out is as easy as opting in.
16. As an aluno, I want event days marked with the pink dot on my month calendar and listed as Evento entries in the selected-day agenda, so that the Phase-7 legend finally tells the truth.
17. As an aluno, I want my event payments to appear in the Carteira histórico with a comprovante, so that event money and mensalidade money share one record.

### Responsável

18. As a responsável, I want the Eventos tab to list published events as gradient cards with one chip per dependent, so that confirmation is per child, per the charter.
19. As a responsável, I want tapping a dependent's chip on a free event to confirm that child (chip gains the check), and tapping again to cancel, so that the toggle matches the prototype.
20. As a responsável on a paid event, I want the per-dependent chip to open the Pix sheet addressed to that child, with the charge billed to me, so that I pay for the right dependent the same way I pay their mensalidade.
21. As a responsável, I want each dependent's registration state independent of their siblings', so that Pedro confirmed never implies Júlia confirmed.

### Professor

22. As a professor, I want the "eventos futuros" stat tile and the "Eventos futuros" dashboard list real — date square, name, "N confirmados · gratuito/R$ X" — so that I see the program read-only from Início.
23. As a professor, I want event days on my month calendar, so that my teaching month includes the academy's events.

### Integrity & cross-cutting

24. As the platform, I want events and registrations tenant-scoped with forced RLS and composite tenant FKs, so that events never leak across academies.
25. As the platform, I want only published, non-canceled events visible to non-admin personas, so that drafts and cancellations stay backstage.
26. As the platform, I want one registration row per (event, student) whose status flips, so that cancel-and-reconfirm never duplicates and counts stay honest.
27. As the platform, I want registration settlement driven only by normalized provider events, so that the Stripe swap stays a driver-only change.
28. As the platform, I want "Comunicar" to emit a domain event and an audit row and nothing else, so that notification delivery plugs in later without touching this module.
29. As the platform, I want event lifecycle and registration transitions audited with impersonation attribution, so that who published, confirmed or canceled is always answerable.
30. As the platform, I want calendar month bucketing computed in the tenant timezone, so that an event dot lands on the same date the mat experiences.

## Implementation Decisions

### Schema — two tables, one hardening

- **New enums**: `event_status` (`draft`,`published`,`canceled`) and `event_registration_status` (`pending_payment`,`confirmed`,`canceled`).
- **`events`** (tenant-scoped, forced RLS, `UNIQUE (tenant_id, id)`): `name`; `description` nullable; **`banner_preset` text slug** resolved by the design-system gradient catalog (default = the purple→pink event gradient; a slug so new presets are catalog entries, not migrations); `location` nullable; `starts_at timestamptz` nullable; **`price_cents integer NULL` — NULL = gratuito**, matching the form's "Valor (vazio = gratuito)"; `responsible_user_id` FK→users NOT NULL (the "Responsável: Prof. …" line; tenant membership validated in the service); `status` default `draft`; `canceled_at`. CHECK: `status = 'published'` ⇒ `starts_at` and `location` non-null. Index (tenant_id, status, starts_at) for every upcoming/month query.
- **`event_registrations`** (tenant-scoped, forced RLS, `UNIQUE (tenant_id, id)`): composite FKs to events and students; `confirmed_by_user_id` FK→users NOT NULL (the acting user — the aluno themselves or the guardian); `status`; `canceled_at`; **`UNIQUE (tenant_id, event_id, student_id)`** — one row per student per event, status mutates, transitions audited. No `charge_id` column: the linkage lives on the charge (billing owns money rows).
- **`charges.event_registration_id` hardening**: the BIL.2 plain-uuid stub becomes a composite `(tenant_id, event_registration_id)` FK onto `event_registrations` — same pattern and precedent as the Phase-3 `invites.class_id` migration; the per-origin CHECK is already in place.
- **Recorded deltas against database ticket 03**: `price_cents` goes nullable-means-free (ticket had NOT NULL DEFAULT 0), `capacity` is not created (waitlist/capacity out of scope), registration statuses are `pending_payment/confirmed/canceled` (no `declined`; ticket predates the paid-flow shape), and the charge linkage direction is reversed per BIL.2. Banner image upload is a **recorded debt** — v1 banners are token gradients only.

### The events module

- A new `events` backend module behind the existing guard chain (JWT → persona role → academy status), owning event CRUD, lifecycle, registrations and the announce action. Money stays in billing: the events service asks billing to issue/cancel event-origin charges through the same internal service seam billing already exposes to itself — events never touches the provider port.
- Endpoint surface (versioned prefix, generated into the OpenAPI spec):

| Endpoint                                                           | Role     | Purpose                                                                             |
| ------------------------------------------------------------------ | -------- | ----------------------------------------------------------------------------------- |
| `GET /admin/events`                                                | admin    | all events (drafts first, then chronological) with confirmados/inscritos/arrecadado |
| `POST /admin/events` · `PATCH /admin/events/:id`                   | admin    | create (draft or published) / edit                                                  |
| `POST /admin/events/:id/publish` · `POST /admin/events/:id/cancel` | admin    | lifecycle transitions (audited)                                                     |
| `GET /admin/events/:id/registrations`                              | admin    | inscritos list + totals                                                             |
| `POST /admin/events/:id/announce`                                  | admin    | Comunicar — domain event + audit only                                               |
| `GET /aluno/events/:id`                                            | student  | detail + own registration state                                                     |
| `POST /aluno/events/:id/registration`                              | student  | free ⇒ confirmed; paid ⇒ pending_payment + event charge (returns chargeId)          |
| `DELETE /aluno/events/:id/registration`                            | student  | cancel free/pending (cancels the open charge)                                       |
| `GET /responsavel/events`                                          | guardian | published events + per-dependent registration states                                |
| `POST /responsavel/events/:id/registrations/:studentId`            | guardian | same free/paid semantics per dependent (guardian bill-to)                           |
| `DELETE /responsavel/events/:id/registrations/:studentId`          | guardian | cancel per dependent                                                                |

- Existing endpoints extended, not duplicated: `GET /aluno/home` gains `upcomingEvents` (next 2 published events with own state — the prototype's card count); the professor dashboard payload gains the eventos-futuros count and list; the four AGD endpoints fill their `events` arrays (below). No professor event route exists; the admin "Criar eventos" permission toggle for professors stays render-only.

### Registration flows — free direct, paid over the billing rails

- **Free** (`price_cents NULL`): POST flips (or creates) the row to `confirmed` immediately — "gratuito = confirmar direto". DELETE flips it to `canceled`; re-confirming reuses the same row.
- **Paid**: POST creates/reuses the row as `pending_payment` and asks billing for a charge — `origin = 'event'`, `event_registration_id` set, `amount_cents = price_cents`, `due_date` = the event date in the tenant timezone, `guardian_id` bill-to when a guardian registers a dependent. The response carries the chargeId; the client then drives the **existing** payment endpoints (`POST /aluno/wallet/charges/:id/payments` or the responsável twin, plus the gated simulate endpoint) and the existing Pix sheet, labeled "Inscrição · <evento>" (guardian variant adds the child's name). Payment routes keep their `@BypassReadOnly`.
- **The normalized provider-event handler is extended, not forked**: `payment.succeeded` on an event-origin charge settles the charge (existing behavior) _and_ flips its registration to `confirmed`; `payment.refunded` flips it to `canceled`. This is the only settlement path — the simulate endpoint and the future Stripe webhook both land here, preserving the driver-only-swap invariant.
- Self-cancel is allowed only for free or still-pending registrations (canceling a `pending_payment` row cancels its open charge). A paid, confirmed registration is undone only by the audited admin refund, which cancels it through the refund event — recorded, not silently dropped.
- Event canceling (admin): open event charges are canceled, `events.event.canceled` is emitted with the registered audience; confirmed rows keep their history. Unpaid registrations of past events simply stay `pending_payment` — no auto-expiry in v1.
- Read-only (delinquent) academies: admin event CRUD and new registrations are blocked like every write; paying an **existing** event charge still works via the bypass on payment routes — consistent with "the academy's debt never blocks students paying theirs".

### Filling the AGD contracts

- The agenda module's stable `events: []` arrays become real, shape-additive only: agenda returns the **current month's** published events ("Eventos do mês"); the three calendars return the **requested month's** published events as dated items (id, name, date, time, location, valor/gratuito — aluno items also carry own confirmation state). Clients already expand pink dots per date and merge Evento entries into the selected-day agenda per the Phase-7 contract — data, not UI plumbing. Month windows and event dates are computed in the tenant timezone; canceled and draft events never appear.
- All personas of a tenant see the same academy-wide events (events are not class-scoped); persona scoping differences live only in registration state enrichment.

### Events, audit, errors

- Domain events (notifications stays listener-only, delivery is its own phase): `events.event.published`, `events.event.canceled` (audience: registered students/guardians), `events.registration.confirmed` (guardian variant), `events.registration.canceled`, and `events.announcement.requested` — the Comunicar payload (event id + inscritos audience). The admin client shows the prototype's "Comunicado enviado aos inscritos." toast on 202.
- Audit action codes on the existing seam, in-transaction: `events.event.created/updated/published/canceled`, `events.registration.confirmed/canceled`, `events.event.announced` — all with impersonation attribution.
- New stable problem+json codes: publish without date/local, registration on a non-published event, cancel on a paid confirmed registration, announce on a non-published event, registration for a student not linked to the calling guardian (404 shape for cross-tenant/foreign ids, per the established pattern).

### Client scope split

- **Web (admin console)**: an Eventos page (`/admin/eventos` + nav link) per admin-13 adapted to the console shell — gradient-preset banner cards with the valor chip (Gratuito / R$ N), data · hora line, "N inscritos · Prof. X", Comunicar button; criar/editar form (nome, descrição, preset picker, local, data/hora, valor, responsável) with Rascunho/publish handling and cancel; inscritos view with totals. The admin calendar's pink dots turn real by data alone.
- **Mobile (RN, Android, iOS)**, each a tracked parity task: aluno home "Próximos eventos" cards (date square, Confirmado chip or valor chip) → event detail per aluno-10 (banner gradient + chip, info card with data/local/responsável, description, "Confirmar presença" / "Pagar inscrição · R$ X" / "Cancelar participação", confirmed banner) with the paid path reusing the existing Pix sheet + simulate; Agenda "Eventos do mês" real cards; calendar pink dots + day Evento entries. Responsável Eventos tab real per responsavel-06 (gradient cards, per-dependent chips with the check state, Pix per dependent). Professor dashboard eventos-futuros tile + list per professor-02 and calendar dots.
- Copy is fixed by the prototypes, PT-BR client-side: "Próximos eventos", "Eventos do mês", "Confirmar presença", "Pagar inscrição · R$ X", "Cancelar participação", "Presença confirmada — até lá!", "Inscrição · <evento>", "Confirme a participação por dependente", "Comunicar", "Gratuito", "Rascunho". Banners and chips use Lumira gradient/color tokens — no hardcoded hex. Schema, enums, event names and audit actions stay English per charter.

## Testing Decisions

- Same doctrine as specs 001–007 (their suites are the prior art): behavior through the API against real Postgres with RLS active; assertions on status codes, stable error codes and observable state — never on SQL or driver internals.
- Lifecycle e2e: draft creation without date/local; publish rejected until both present; edit; cancel cancels open charges and emits the canceled event; drafts and canceled events invisible to aluno/responsável/professor/calendars.
- Registration e2e: free confirm → confirmed row + audit; cancel → same row canceled; re-confirm reuses the row (unique holds); paid register → pending_payment + event-origin charge with hardened FK and correct bill-to → Pix payment → simulate → charge paid _and_ registration confirmed through the handler; refund → registration canceled; self-cancel of a paid confirmed registration rejected with its stable code; cancel of pending cancels the charge.
- Contract tests pin the extended normalized-event handler (event-origin succeeded/refunded transitions, idempotent re-delivery) so the Stripe swap stays a driver-only PR.
- Scoping: guardian can register only own dependents (foreign student → 404); per-dependent states independent; aluno home shows next-2 window; agenda/calendar month bucketing asserted across a month boundary in the tenant timezone; admin totals (confirmados, inscritos, arrecadado) against seeded fixtures.
- RBAC + RLS: professor has no event write route (CI metadata assertion); cross-tenant event/registration ids → 404 via the fail-closed meta-test pattern; read-only academy blocks CRUD and new registrations but pays existing event charges; announce emits exactly one domain event + audit row and requires published.
- Web: component spec for the Eventos page (card states, Rascunho, form chip/preset behavior, inscritos totals, Comunicar toast) per the established page-spec pattern.
- Mobile: pure-logic tests for the detail button state machine (free/paid × none/pending/confirmed → label and action) and the dependent-chip toggle mapping; one integration test per client for paid register → Pix sheet → simulate → confirmed round trip.

## Out of Scope

- Banner image upload — v1 banners are design-system gradient presets; upload is a recorded debt.
- Event capacity, waitlists and registration deadlines ("inscrição até…" is description copy, not schema).
- Notification delivery — Comunicar and every `events.*` domain event emit only; push/e-mail is the notifications phase.
- Professor event creation — the "Criar eventos" permission toggle stays render-only; no professor write route in v1.
- Platform-level events, cross-academy events, attendance/presence tracking at the event itself, and event check-in.
- Partial refunds, unpaid-registration auto-expiry, and any event-charge dunning.
- Ranking "Por eventos" — the aluno/professor ranking segment stays owned by its future slice.

## Further Notes

- This phase consumes the last recorded events-shaped debts: the Phase-7 "Eventos do mês" empty state and `events: []` contracts, the BIL.2 `charges.event_registration_id` stub, the professor dashboard "eventos futuros" placeholder from Phase 4, and the responsável Eventos placeholder tab from Phase 1 — update the README notes accordingly.
- UI truth: admin-13 (Eventos admin), aluno-10 (evento detalhe), responsavel-06 (confirmação por dependente), aluno-03 home "Próximos eventos", aluno-11 agenda "Eventos do mês", professor-02 "Eventos futuros", and the calendars' pink-dot legends — recreated pixel-faithful with Lumira tokens through the design-system package.
- Amounts are integer cents in schema and API; clients format `R$` in pt-BR locale; "Gratuito" renders when `price_cents` is NULL.
- Delivery follows the fixed order DB → backend → web → mobiles; the checklist below is mirrored into the root README, and checking a box there is the only "ticket closing" this project has.

## Delivery Checklist

- [ ] EVT.1 DB: event_status + event_registration_status enums + events table (banner_preset slug, nullable starts_at/location with published CHECK, price_cents NULL = gratuito, responsible_user_id, status lifecycle, (tenant,status,starts_at) index) with forced tenant RLS
- [ ] EVT.2 DB: event_registrations (composite event/student FKs, confirmed_by_user_id, status, UNIQUE tenant+event+student) + charges.event_registration_id composite-FK hardening closing the BIL.2 stub
- [ ] EVT.3 DB: dev seeds — draft/published free/paid events per fixture academy with mixed registrations (confirmed free, paid-settled, pending_payment) and their event-origin charges
- [ ] EVT.4 Backend: events module admin — CRUD + publish/cancel lifecycle (cancel cancels open charges), inscritos list with confirmados/inscritos/arrecadado totals, Comunicar endpoint emitting events.announcement.requested + audit only
- [ ] EVT.5 Backend: aluno — home upcomingEvents (next 2 with own state), event detail, free confirm/cancel, paid registration issuing the event-origin charge (guardian bill-to path shared) paid via existing wallet + simulate rails, normalized-event handler extended (succeeded→confirmed, refunded→canceled)
- [ ] EVT.6 Backend: responsável events with per-dependent states + confirm/pay/cancel per dependent; professor dashboard eventos-futuros count + list (read-only, no professor write route)
- [ ] EVT.7 Backend: AGD contracts filled — agenda "Eventos do mês" + dated month events in all three persona calendars, tenant-timezone bucketing, published-only visibility
- [ ] EVT.8 Backend: e2e suite green — lifecycle + publish validation, free/paid/refund registration transitions through the handler contract, charge cancel on registration cancel, guardian scoping 404s, month windows, announce gating, RBAC/RLS/read-only + CI route assertions
- [ ] EVT.9 Web: /admin/eventos console page + nav link per admin-13 — gradient-preset cards with valor chip and inscritos line, criar/editar/publicar/cancelar form (valor vazio = gratuito), inscritos view, Comunicar toast; admin calendar pink dots real
- [ ] EVT.10 RN: aluno — home Próximos eventos section, Agenda Eventos do mês real, event detail per aluno-10 (Confirmar presença / Pagar inscrição → existing Pix sheet + simulate / Cancelar participação / confirmed banner), calendar event dots + day Evento entries
- [ ] EVT.11 RN: responsável Eventos tab real per responsavel-06 (per-dependent chips with check, Pix per dependent) + professor dashboard eventos-futuros tile and list + professor calendar event dots
- [ ] EVT.12 Android: aluno events (same scope as EVT.10)
- [ ] EVT.13 Android: responsável + professor events (same scope as EVT.11)
- [ ] EVT.14 iOS: aluno events (same scope as EVT.10)
- [ ] EVT.15 iOS: responsável + professor events (same scope as EVT.11)
