# 007 — Agenda & Calendar (Phase 7)

Status: ready-for-agent
Personas covered: Aluno, Professor, Admin da academia

## Problem Statement

The schedule data has existed since Phase 3 — every turma carries its weekday slots in `class_schedules` — but no persona can actually *see the week*. The aluno's Agenda tab is still the Phase-2 placeholder in all three mobile apps (on iOS the tab does not even exist yet), so "which classes can I train today, and at what time?" has no answer inside the product. The "Ver agenda" CTA on the aluno home hero is rendered disabled in every client, an explicitly recorded debt from the attendance slice. The month view designed for three personas — aluno-08, professor-04 and admin-14, the calendar with recurrence dots, event dots and a selected-day agenda — exists nowhere: not as a mobile screen, not as a console page.

Everything the design asks for on these screens is already answerable by existing rows: enrolled classes per weekday (enrollments × class_schedules), professor and level chips (classes + belts), occupancy (active enrollments vs capacity), and today's check-in state (the materialized `class_sessions` row plus the active attendance). This phase is the read-model layer over Phase 3/4 data — no new truth, just the two missing windows onto it. The only piece with no substrate yet is "Eventos do mês": events are a later phase, and this slice must render their section honestly empty rather than fake them or silently drop them.

## Solution

Two read models, four screens, zero migrations.

The **aluno Agenda tab** becomes real: day-of-week pills (today preselected), and for the selected weekday the list of the aluno's enrolled classes — start/end time, turma name, professor, level chip, occupancy chip. When the selected day is today, each class row carries its check-in affordance: the "Check-in" button (opening the existing Phase-4 check-in sheet) or the green check when presence is already registered. Empty weekday renders "Sem aulas neste dia". Below the classes, the "Eventos do mês" section ships with a permanent-for-now empty state, wired to an `events` array the API always returns empty until the events phase fills it.

The **month calendar** ships for three personas from one shared shape: the API returns the persona-scoped weekly recurrence (classes bucketed by weekday) plus the empty events list; the client expands that over the rendered month grid — a purple dot on every date whose weekday has classes, a pink dot on event dates (none in v1), the legend, and the selected-day agenda list sorted by time. Aluno sees only their enrolled classes ("sua aula"), professor only the classes they teach ("aula recorrente"), admin every active turma of the academy ("aulas recorrentes"). Empty selected days keep each persona's designed copy — "Dia livre — o tatame espera você no próximo treino." / "Dia livre — bom descanso." / "Nada agendado neste dia.". Aluno and professor get the calendar as mobile screens (entered from the Agenda header's "Mês" button and the dashboard header's calendar icon respectively); admin gets a console page per admin-14.

Calendar dots derive from **schedules, not sessions** — the calendar shows the recurring plan, so an untouched day still shows its dot and a canceled-session concept never leaks here. Sessions are read only where check-in state matters: the agenda's today rows. Nothing in this phase materializes a session; reads stay reads.

## User Stories

### Aluno — Agenda tab

1. As an aluno, I want an Agenda tab with the seven day-of-week pills, so that I can browse my training week with one tap per day.
2. As an aluno, I want the pill for today preselected when the tab opens, so that the default answer is "what can I train today?".
3. As an aluno, I want each class of the selected day shown with start and end time, turma name, professor, level chip and occupancy chip, so that one card tells me everything about the slot.
4. As an aluno, I want the Agenda to list only classes I am actively enrolled in, so that the tab is my schedule, not the academy's.
5. As an aluno, I want a class enrolled on multiple weekdays to appear on each of its days, so that the recurrence is fully visible.
6. As an aluno looking at today, I want a "Check-in" button on each class I have not yet checked into, so that the agenda is also a check-in entry point.
7. As an aluno, I want that button to open the same check-in sheet I already use from the home FAB, so that check-in behaves identically everywhere.
8. As an aluno who already checked into today's class, I want the row to show the green check instead of the button, so that my presence state is visible at a glance.
9. As an aluno looking at any day other than today, I want no check-in affordance at all, so that the unique-per-day rule is never suggested otherwise.
10. As an aluno whose check-in was revoked, I want the button back, so that the roll-call correction flow from Phase 4 keeps working from this screen too.
11. As an aluno on a day with no classes, I want the "Sem aulas neste dia" empty state with its rest message, so that an empty day looks intentional.
12. As an aluno, I want an "Eventos do mês" section that today shows an honest empty state, so that the surface exists and fills itself when the events phase lands — never fake cards.
13. As an aluno, I want the Agenda header to show my academy's name and a "Mês" button, so that the month view is one tap away.

### Aluno — month calendar

14. As an aluno, I want a month grid with a purple dot on every day one of my enrolled classes recurs, so that my training days are visible at a glance.
15. As an aluno, I want event days marked with a distinct pink dot and a legend explaining both ("sua aula" / "evento"), so that the two dot kinds are never ambiguous.
16. As an aluno, I want today highlighted and the selected day emphasized in the grid, so that I always know where I am in the month.
17. As an aluno, I want tapping a day to show that day's agenda below the grid — my classes and any events, sorted by time, each tagged Aula or Evento — so that the grid drills down without leaving the screen.
18. As an aluno, I want a free selected day to say "Dia livre — o tatame espera você no próximo treino.", so that empty days keep the product's voice.
19. As an aluno, I want the calendar reached from the Agenda's "Mês" button and dismissed with the back chevron, so that navigation matches the prototype.

### Professor — month calendar

20. As a professor, I want a calendar icon button in my dashboard header opening the month view, so that my teaching month is one tap from Início.
21. As a professor, I want the calendar dots and day agenda to cover only the classes I teach, so that the view is my schedule, not the academy's.
22. As a professor, I want each day item to show time, turma name and occupancy, so that I know what I'm walking into.
23. As a professor, I want the legend to read "aula recorrente" / "evento" and free days to say "Dia livre — bom descanso.", so that the persona's designed copy is respected.

### Admin — console calendar

24. As an academy admin, I want a "Calendário" entry in the console navigation opening a calendar page, so that the academy's month is a first-class console view.
25. As an academy admin, I want the month grid to dot every day any active turma recurs plus event days, with the "aulas recorrentes" / "evento" legend, so that I see the whole academy's rhythm.
26. As an academy admin, I want the selected day's list to show every class with time, turma, professor and occupancy, so that the day view doubles as a staffing check.
27. As an academy admin, I want empty days to read "Nada agendado neste dia.", so that the admin copy variant is kept.
28. As an academy admin, I want archived turmas excluded from the calendar, so that the plan shown is the live one.

### Integrity & cross-cutting

29. As any caller, I want agenda and calendar reads scoped by RLS to my academy, so that schedules never leak across tenants.
30. As the platform, I want these endpoints to never create `class_sessions` rows, so that the Phase-4 honest-denominator rule (a day nobody touched has no row) survives read traffic.
31. As an aluno of a delinquent (read-only) academy, I want agenda and calendar to keep working, so that read-only means read-only, not blind.
32. As the platform, I want weekday and "today" computed in the tenant timezone, so that agenda days match the mat, not the server.
33. As the platform, I want the `events` arrays present-but-empty in every response of this phase, so that the events phase fills a stable contract instead of changing one.

## Implementation Decisions

### Read models only — no schema change (confirmed)

- **Zero migrations.** Every query in this phase is served by existing tables and their existing indexes: enrollments by student (`enrollments_tenant_student_idx`) and by class (the `(tenant, class, student)` unique doubles as the occupancy-count index), schedules by class (the `(tenant, class, weekday, start_time)` unique), today's session by the `(tenant, class_id, session_date)` unique, and the active attendance by the partial `(tenant, class_session_id, student_id)` unique. Per-tenant cardinalities are tiny; no helper view, no new index, no denormalization is needed — checked against the actual schema, not assumed.
- Sessions are read on exactly one path (agenda today-state) and **never written**: no materialization on read, ever. Calendar endpoints do not touch `class_sessions` at all.

### The agenda module

- A new lean `agenda` backend module (sibling of attendance/enrollment) owning only read services and persona controllers under the existing guard chain (JWT → persona role → academy status; GETs are unaffected by read-only mode). It queries enrollment- and attendance-owned tables directly — acceptable because nothing mutates; write paths remain exclusively with their owning modules.
- Endpoint surface (versioned prefix, generated into the OpenAPI spec):

| Endpoint | Role | Purpose |
|---|---|---|
| `GET /aluno/agenda?weekday=0..6` | student | enrolled classes for that weekday + today check-in state + `events: []` |
| `GET /aluno/calendar?month=YYYY-MM` | student | enrolled-class recurrence buckets + `events: []` |
| `GET /professor/calendar?month=YYYY-MM` | professor | own-class recurrence buckets + `events: []` |
| `GET /admin/calendar?month=YYYY-MM` | admin | all-active-class recurrence buckets + `events: []` |

### Aluno agenda contract

- Response: `{ weekday, isToday, classes: [...], events: [] }`. Each class item is one schedule slot of an actively enrolled, active class on that weekday: class id and name, slot start time and end time (start + duration), professor name, level fields (min/max belt names and age range — the client composes the chip label exactly as the existing turma surfaces do: belt range, Kids age range, or "Todas as faixas"), and occupancy `{ active, capacity }` counted from active enrollments. Sorted by start time. A class with two slots on the same weekday yields two items.
- **Today state** (only when the requested weekday is today in the tenant timezone): each item carries `checkedIn` — true iff today's session row exists for the class *and* the caller's student has an active (non-revoked) attendance on it. No session row or a revoked attendance ⇒ `checkedIn: false`. The client renders the check-in button when `isToday && !checkedIn` and the green check when `checkedIn`. The button only *opens* the Phase-4 check-in sheet — every window/enrollment/duplicate rule stays enforced by `POST /aluno/checkins`, and a successful check-in refetches the agenda.
- `weekday` uses the schema convention 0 = Sunday … 6 = Saturday; omitted ⇒ defaults to today.

### Calendar contract — recurrence buckets, client-side expansion

- All three calendar endpoints share one shape: `{ month, classesByWeekday: { 0..6: [items] }, events: [] }`. Items carry class id, name, start/end time, professor name and occupancy (persona scoping is the only difference: aluno = active enrollments, professor = `professor_user_id = caller`, admin = every active class; archived classes excluded everywhere).
- **The server returns the weekly plan, not per-date dots** — deliberately mirroring the prototype's own logic (`AULAS_SEM` keyed by weekday + events keyed by date). The client expands: for each date in the rendered grid, class dot iff that weekday's bucket is non-empty; event dot iff an event falls on the date; the selected-day agenda = the weekday bucket merged with that date's events, sorted by time, tagged Aula/Evento. This keeps the payload minimal, the server timezone-trivial, and the contract already correct for events later.
- `month` is validated and echoed; in v1 it only matters to the (empty) events window — recurrence is month-independent. It exists so the events phase changes no signature. Clients render the current month only: the prototype's "‹" chevron is *back navigation*, not month paging — month paging was never designed and is out of scope.
- Dots derive from schedules by definition, so canceled or never-materialized sessions have no effect here — the calendar shows the plan; the attendance surfaces show the reality.

### Eventos do mês — explicit debt

- The aluno Agenda renders the "Eventos do mês" section header with a muted empty state ("Nenhum evento neste mês"); calendars render no pink dots. Both are wired to the `events` arrays the API already returns, so the events phase fills data, not UI plumbing. Recorded as explicit debt in the root README notes, per process — never silently dropped.

### Client placement

- **RN**: the existing `(aluno)/(agenda)` placeholder screen becomes the real Agenda; the month calendar is a pushed screen in that stack behind the header "Mês" button. The professor calendar is a pushed screen in the professor Início stack behind a header calendar icon button on the dashboard. The disabled "Ver agenda" hero CTA on Início now navigates to the Agenda tab (closing that recorded debt in all three mobile clients).
- **Android**: the aluno shell already reserves the Agenda tab — it gets the real content; calendars follow the same two entry points as RN.
- **iOS**: the aluno shell has **no Agenda tab yet** — it is added (Início · Agenda · Carteira · Perfil order per design) alongside the same two calendar entry points.
- **Web (admin console)**: a Calendário page joins the console at `/admin/calendario` with its nav link, rendering the admin-14 layout adapted to the console shell (MUI skinned by Lumira, same page pattern as the existing admin pages). Month grid, dots + legend, selected-day list, empty state.
- Copy is fixed by the prototypes and PT-BR client-side: subtitles "Suas aulas e eventos da academia" / "Aulas recorrentes e eventos da academia" / "Todas as turmas e eventos da academia"; legends "sua aula"/"aula recorrente"/"aulas recorrentes" + "evento"; empty states "Sem aulas neste dia" (+ "Bom descanso — o tatame espera você amanhã."), "Dia livre — o tatame espera você no próximo treino.", "Dia livre — bom descanso.", "Nada agendado neste dia.". Dot colors are the purple/pink tokens — no hardcoded hex. Schema, DTOs and query params stay English per charter.

## Testing Decisions

- Same doctrine as specs 001–006 (their suites are the prior art): behavior through the API against real Postgres with RLS active; assertions on status codes and observable payloads, never on query internals.
- Agenda e2e: weekday filter returns only that day's slots; only actively enrolled active classes appear (removed enrollment or archived class disappears); multi-slot weekday yields multiple items; occupancy counts active enrollments only; `isToday` true only for the tenant-timezone today; `checkedIn` true with a materialized session + active attendance, false with no session, false again after revoke; **a fixture with no session row asserts the endpoint created none** (read purity); `events` always empty.
- Calendar e2e: aluno buckets = enrolled classes only; professor buckets = own classes only (a colleague's class absent); admin buckets = every active class; archived classes excluded for all three; invalid `month` rejected with the stable problem+json validation error.
- RBAC + RLS: aluno hitting professor/admin calendars → 403 (and vice versa); cross-tenant invisibility via the existing fail-closed meta-test pattern; read-only academy still serves all four GETs.
- Web: component spec for the Calendário page per the established page-spec pattern — dot expansion from weekday buckets over a known month, legend, selected-day list, empty state, nav link visibility.
- Mobile: pure-logic tests for the shared expansion rules (weekday buckets → month dots; selected-day merge/sort; check-in affordance rule `isToday && !checkedIn`) and the day-pill selection defaulting to today; one integration test per client for agenda render + check-in-button → sheet handoff.

## Out of Scope

- Events content — creation, listing, confirmation, pink dots with real data, the "Eventos do mês" cards and the evento detail screen all belong to the events phase; this phase ships the empty contract and section only.
- Month paging / navigation between months — not designed (the prototype chevron is back navigation); clients render the current month.
- Drag-to-reschedule, editing schedules from the calendar, or any write surface — schedule mutation stays with the enrollment slice's turma forms.
- Notifications (class reminders, event alerts) — the notifications phase.
- Responsável and plataforma calendar surfaces — not in the handoff; the responsável child detail already shows the turma's schedule.
- Surfacing canceled sessions, holidays or exceptions on the calendar — dots are schedule-derived; the `canceled` session status remains reserved and unsurfaced (Phase-4 decision).
- Caching or precomputation of calendar payloads — derived on read like every stat in v1.

## Further Notes

- The prototype's Open mat sample shows a "Livre" occupancy chip; occupancy in the real data model is always `active/capacity` (capacity is NOT NULL), so clients render the "N de M" form universally — the "Livre" string is sample data, not a derivable state.
- UI truth: aluno-11 (agenda), aluno-08, professor-04, admin-14 (calendars) plus the Aluno/Professor/Admin prototypes' `isCal` views — recreated pixel-faithful with Lumira tokens through the design-system package.
- This phase closes two recorded debts (the disabled "Ver agenda" hero CTA; the missing iOS aluno Agenda tab) and opens one (Eventos do mês placeholder) — all tracked in the root README notes.
- Delivery follows the fixed order backend → web → mobiles (no DB slice — this phase needs none); the checklist below is mirrored into the root README, and checking a box there is the only "ticket closing" this project has.

## Delivery Checklist

- [ ] AGD.1 Backend: agenda module — `GET /v1/aluno/agenda?weekday=` with enrolled-class slot items (times, professor, level fields, occupancy), tenant-timezone `isToday` + read-only `checkedIn` state, `events: []`
- [ ] AGD.2 Backend: persona calendars — `GET /v1/{aluno|professor|admin}/calendar?month=` returning persona-scoped weekday recurrence buckets + `events: []`, no session reads or writes
- [ ] AGD.3 Backend: e2e suite green — scoping per persona, weekday filter, checkedIn with/without session and after revoke, read purity (no rows created), month validation, RBAC + RLS, read-only academies served
- [ ] AGD.4 Web: `/admin/calendario` console page + nav link — month grid with dot expansion, "aulas recorrentes"/"evento" legend, selected-day list, "Nada agendado neste dia." empty state, page component spec
- [ ] AGD.5 RN: aluno Agenda tab real — day pills (today default), class cards with check-in button → Phase-4 sheet / green check, "Sem aulas neste dia", Eventos do mês empty section, hero "Ver agenda" CTA enabled
- [ ] AGD.6 RN: aluno month calendar behind the "Mês" button + professor calendar behind the dashboard header icon — dots, legend, day agenda, persona empty states
- [ ] AGD.7 Android: aluno Agenda tab real (same scope as AGD.5)
- [ ] AGD.8 Android: aluno + professor month calendar screens (same scope as AGD.6)
- [ ] AGD.9 iOS: aluno Agenda tab added to the shell + real Agenda screen (same scope as AGD.5)
- [ ] AGD.10 iOS: aluno + professor month calendar screens (same scope as AGD.6)
