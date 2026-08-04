# 004 — Attendance & Check-in (Phase 4)

Status: ready-for-agent
Personas covered: Aluno, Professor, Admin da academia (minimal visibility)

## Problem Statement

The academy now has people and classes but no record of who actually trains. After Phase 3, an enrolled student opens the app, sees the hero card for today's class — and the "Fazer check-in" button does nothing. The professor's dashboard promises "Iniciar chamada" with nothing behind it: no live code, no QR, no manual roll call, no way to know who is on the mat. Every attendance-derived number in the design — the aluno's presença % and "aulas seguidas" streak, the professor's "alunos hoje" and "presença média" tiles, the "26 de 40 aulas" graduation progress bar — renders as a Phase-3 placeholder.

Attendance is also the substrate for everything downstream: graduation counts lessons, rankings count presences, and the charter makes two hard promises about it — check-in is unique per class per student, and history is immutable. Until class occurrences exist as rows and check-ins land append-only under those constraints, none of that can be built honestly.

One small debt also waits here: the mobile "Adicionar aluno" picker still unions other-class rosters because there is no professor-facing student listing endpoint.

## Solution

The attendance slice implements the training triangle already designed in the core entity model: `class_sessions` (one materialized occurrence per turma per day, created lazily on demand), `checkin_codes` (the professor-opened live window: a 4-digit human code plus an opaque QR token, with a TTL and an explicit close), and `attendances` (append-only rows, one active check-in per student per session, voidable but never editable).

The aluno checks in from the glass bottom sheet on the home hero: three methods in a segmented control — scan the professor's QR, type the 4-digit code, or manual (with the location-verification stub). Success is the green check pop with the streak count; a second attempt lands on the "Presença registrada" state, never a duplicate row. The home screen's stat tiles become real: presença % for the month, the streak (toggleable gamification), and the graduation progress bar fed by the true lesson count (still a placeholder link — graduation itself is a later slice).

The professor runs chamada two ways. Live: opening the roll call materializes today's session, mints the code + QR, and shows a screen with the big code, the QR, an expiry countdown, and a live "N alunos já registraram presença" counter and list — streamed over SSE with a snapshot-then-stream protocol and a polling fallback. Manual: the roster with per-student toggles — toggle on inserts a manual attendance, toggle off same-day revokes it through the audited void seam. The dashboard tiles (alunos hoje, presença média, next-class hero) go live.

History is protected in layers: no UPDATE/DELETE grants, no mutating RLS policies, and a guard trigger whose single exception is the revoke annotation. Corrections are voids plus re-inserts, never edits — professor same-day, admin any time, always audited.

The admin web console gets minimal visibility: the turma detail's placeholder tiles are replaced by the real session list with attendance counts. Full attendance reporting stays with the reports slice.

## User Stories

### Aluno — check-in

1. As an aluno, I want a check-in bottom sheet opened from the home hero (and the central FAB), so that registering presence is one gesture from anywhere.
2. As an aluno, I want the sheet titled with today's class for me (e.g. "Check-in · Open mat", time and location), so that I always know which session I am checking into.
3. As an aluno, I want three check-in methods in a segmented control — QR Code, código, manual — so that I can use whatever is fastest on the mat.
4. As an aluno, I want to scan the QR the professor is projecting and be checked in instantly, so that check-in takes a second.
5. As an aluno, I want to type the 4-digit code shown by the professor and be checked in, so that I don't need a working camera.
6. As an aluno, I want the manual method (with its location-verification step stubbed) to register my presence directly for today's class, so that I can still check in when no code is being shown.
7. As an aluno, I want a wrong or expired code rejected with a clear message, so that I know to ask the professor for the current one.
8. As an aluno, I want the success state to be the green check pop with "Presença registrada" and my streak count ("Essa é a sua 7ª aula seguida"), so that showing up feels rewarded.
9. As an aluno, I want a second check-in attempt for the same class to land on the already-registered state instead of an error or a duplicate, so that the unique-per-class rule feels natural.
10. As an aluno, I want the home hero to flip to its "Presença registrada" chip state after check-in, so that my status is visible without reopening the sheet.
11. As an aluno, I want check-in to work only for classes I am enrolled in and only on the day of the session, so that presence records are trustworthy.
12. As an aluno whose check-in was revoked by the professor, I want to be able to check in again, so that a roll-call correction never locks me out of my own presence.

### Aluno — stats on Início

13. As an aluno, I want a "presença no mês" percentage tile on my home screen, so that I see my real attendance rate at a glance.
14. As an aluno, I want an "aulas seguidas" streak tile, so that my consistency is celebrated.
15. As an aluno, I want my stats to update immediately after a successful check-in, so that the numbers I just earned are the numbers I see.
16. As an aluno in an academy that disabled streak gamification, I want the streak tile and the success-pop streak line hidden, so that the academy's configuration is respected.
17. As an aluno, I want the graduation card's progress bar fed by my true attended-lessons count, so that "26 de 40 aulas" is real data — even while the graduation flow itself remains a placeholder link.

### Professor — chamada ao vivo

18. As a professor, I want an "Iniciar chamada" action on my next-class hero and class screens, so that opening the roll call is one tap.
19. As a professor, I want opening the chamada to create today's session for the turma (or reuse it if it already exists), so that the occurrence exists exactly once no matter who touches it first.
20. As a professor, I want the live screen to show the 4-digit code big, the QR, and the expiry time ("Expira em 09:42 · sem presenças duplicadas"), so that students have two ways in and I know the window.
21. As a professor, I want a live counter and list of students as they check in, updating in real time, so that I can watch the mat fill without refreshing.
22. As a professor, I want the live screen to keep working (via polling) when the stream cannot connect, so that a flaky network never kills a roll call.
23. As a professor, I want an "Encerrar chamada" action that invalidates the code and QR immediately, so that latecomers can't check into a closed session.
24. As a professor, I want to reopen the chamada after closing it (a fresh code for the same session), so that a mistaken close is recoverable.
25. As a professor, I want only one active code per session at a time, so that there is never ambiguity about which code is valid.
26. As a professor, I want to open chamada only for classes I teach, so that I can never run another professor's roll call.

### Professor — chamada manual

27. As a professor, I want a manual roll-call screen listing my turma's roster with a presence toggle per student, so that I can run chamada without any student devices.
28. As a professor, I want toggling a student on to record their presence (marked as manual, recorded by me), so that offline students still count.
29. As a professor, I want toggling a student off (same day) to revoke that presence, so that a mis-tap during roll call is fixable on the spot.
30. As a professor, I want students who checked in by QR or code to appear already toggled on in the manual screen, so that both chamada modes agree on one truth.
31. As a professor, I want the screen header to show the running count ("N presentes de M"), so that I always see the tally.
32. As a professor, I want toggles applied immediately as I tap, with "Salvar chamada" simply closing the screen, so that a dropped connection mid-chamada loses at most one tap.
33. As a professor, I want to be blocked from revoking a presence after the session's day has passed, so that history corrections beyond the day go through the admin.

### Professor — dashboard & students

34. As a professor, I want an "alunos hoje" tile counting today's check-ins across my classes, so that I know the day's volume.
35. As a professor, I want a "presença média" tile with the month's average attendance rate across my classes, so that I see engagement trends.
36. As a professor, I want the next-class hero to show how many students are already checked in, so that I know the mat's state before walking in.
37. As a professor, I want a students listing with a filter for those not yet enrolled in a given class, so that the "Adicionar aluno" picker shows real candidates instead of other rosters.

### Admin — visibility & corrections

38. As an academy admin, I want the turma detail to list past sessions with their attendance counts (replacing the Phase-3 placeholder tiles), so that I can see whether classes are actually happening.
39. As an academy admin, I want to revoke any attendance at any time through an audited action, so that late-discovered errors are correctable without editing history.
40. As an academy admin, I want the streak-gamification toggle in my permission configuration, so that I decide whether my academy plays the streak game.

### Integrity & cross-cutting

41. As any academy member, I want every session, code, and attendance scoped to my academy by RLS, so that presence data never crosses tenants.
42. As the platform, I want attendance rows to be append-only at the database level — no update or delete possible by the app role — so that presence history cannot be falsified even by buggy code.
43. As the platform, I want every revoke and every professor-recorded manual presence written to the audit log in the same transaction, so that sensitive attendance actions are traceable.
44. As the platform, I want two simultaneous check-ins by the same student to admit exactly one, so that the uniqueness rule holds under race conditions.
45. As an academy admin of a delinquent (read-only) academy, I want check-in and roll-call writes blocked like every other mutation, so that Phase-2 status rules govern this surface too.
46. As an aluno, I want a code from another academy to behave as if it does not exist, so that even the existence of foreign sessions is never leaked.

## Implementation Decisions

### Schema (implements the resolved entity model + audit decisions)

- Three new tenant-scoped tables exactly as designed in the core entity model: `class_sessions`, `checkin_codes`, `attendances` — UUIDv7 app-side PKs, composite `(tenant_id, parent_id)` FKs, forced RLS with fail-closed tenant policies, uniques and indexes leading with `tenant_id`.
- `class_sessions`: lazy materialized occurrence — `class_id`, `date`, `starts_at` (from the day's schedule slot), `status` enum scheduled/done/canceled; `UNIQUE (tenant_id, class_id, date)` — one occurrence per turma per day. Materialization is an idempotent upsert on that key, triggered by whichever comes first: professor opens chamada (live or manual) or an aluno manual check-in. Nothing pre-generates sessions; a class nobody touched that day simply has no row.
- Session status: "Encerrar chamada" sets `done`; sessions from past dates are treated as done for all derived stats regardless of the column (lazy semantics, no cron/finalizer job in v1). `canceled` is reserved — no cancel surface ships this slice.
- `checkin_codes`: the professor-opened window — `class_session_id` composite FK, `code` (4 numeric digits, randomly generated), `qr_token` (opaque 128-bit random token, URL-safe), `opened_by_user_id`, `expires_at`, `revoked_at`. Partial unique on `(tenant_id, code)` where active (not expired, not revoked), plus at most one active code per session. The QR encodes only the `qr_token`; both `code` and `qr_token` are stored plaintext — justified because they are short-lived, single-purpose, and grant nothing by themselves (the caller must still be an authenticated, enrolled student of that class).
- Code TTL: `expires_at` defaults to the session's schedule-slot end plus a 15-minute grace (fallback 60 minutes from opening when the slot is not resolvable). "Encerrar chamada" sets `revoked_at`; reopening inserts a fresh row (new code, new token) for the same session.
- `attendances`: `class_session_id` + `student_id` composite FKs, `method` enum qr/code/manual, `checked_in_at`, `recorded_by_user_id` (null = self check-in; the professor on manual roll call), plus the audit-decision columns `revoked_at` / `revoked_by_user_id`. Uniqueness is the **partial unique index `(tenant_id, class_session_id, student_id) WHERE revoked_at IS NULL`** — the charter's "check-in unique per class" means one *active* check-in; a revoke followed by a new INSERT is the sanctioned correction pattern.

### Append-only enforcement (implements the audit/immutability decision verbatim)

- Layered, not either/or: the app role gets `SELECT, INSERT` only on `attendances` (no UPDATE/DELETE grants, and none for the platform role either — platform reads only); RLS policies are SELECT + INSERT only, so a future grant mistake fails closed at the policy layer; and the shared `forbid_mutation()` BEFORE UPDATE OR DELETE guard trigger backstops both, protecting against role drift and definer-function bypass.
- The trigger's single exception: an UPDATE on `attendances` whose only change is `revoked_at`/`revoked_by_user_id` going from NULL to non-NULL. `checked_in_at`, `method`, `student_id`, `recorded_by_user_id` can never change.
- Revocation happens exclusively through the `attendance_revoke` SECURITY DEFINER seam (same pattern as the audit-append seam): it takes the tenant id explicitly, validates the target row's tenant, and enforces the window rule — a **professor may revoke only while the session's local date is the current date** (checked against the session's date in the tenant timezone); after the day closes, only an **admin** may revoke, any time, always audited.
- A registry of append-only tables backs the existing meta-test: any table declared append-only must have the trigger and no UPDATE/DELETE grants or policies.

### Check-in resolution & validation (one write path, three methods)

- One aluno check-in endpoint accepting `{ method, code | qrToken | classId }`. Resolution per method: **qr** → active code row by token; **code** → active code row by digits; **manual** → today's session for the given class, materializing it if absent. All three converge on the same validated INSERT.
- Validations common to all methods, in order: academy not read-only/suspended (existing status guard); caller has an active student record; student has an active enrollment in the session's class; session date is today. QR/code additionally require the code to be active (not expired, not revoked). Manual additionally requires "today" to actually have a schedule slot for that class and the current time to be within the check-in window: 30 minutes before the slot's start until the code TTL boundary (slot end + 15 min grace).
- Manual check-ins insert directly with `method = 'manual'` and `recorded_by_user_id = NULL` — **no professor approval step**. The method flag is the accountability mechanism: manual rows are visually marked on the professor's roster, and the professor's same-day revoke is the correction path. The handoff's "verificação de localização" remains a pure client stub — the server accepts the method with no geo validation (explicit v1 out-of-scope, per the backend map).
- Duplicate handling: a check-in attempt when an active attendance already exists returns the already-checked-in state (stable code, 200-family semantics carrying the existing attendance) — clients render "Presença registrada", never an error toast. Under a true race, the partial unique index admits exactly one INSERT; the loser is converted to the same already-checked-in response.
- The success response carries the fresh stats (presença %, streak) so the success pop and the home tiles update from one round trip.
- Self check-ins (any method with `recorded_by_user_id` null) are **not audited** — the row itself is the traceable record. Professor-recorded manual rows write `attendance.recorded_manual` and every revoke writes `attendance.revoked` (with window: same_day | admin_late) through the audit seam in the same transaction, per the resolved audit policy.

### Live chamada & realtime (implements the resolved realtime decision verbatim)

- Opening chamada (professor-owned classes only; foreign class → 404): idempotent session upsert + active-code fetch-or-mint in one transaction. Response: session, code digits, QR token, expiry, current present count.
- Transport is **SSE**, not WebSocket: a professor-surface stream route per live code. Auth via a short-lived signed ticket — a mint endpoint (normal bearer REST) returns an HMAC-signed ~60 s single-purpose ticket binding live code, membership, and tenant; the stream guard verifies signature + TTL + tenant and populates the tenant context exactly like the JWT guard so RLS stays intact. The ticket is accepted only on the stream route and is never a session credential; reconnect after expiry mints a new one.
- Protocol: client fetches the snapshot endpoint first, then attaches the stream (no replay; `Last-Event-ID` unused in v1). Events: `checkin` `{ attendanceId, studentId, studentName, method, checkedInAt, presentCount }` and `revoke` `{ attendanceId, presentCount }` — voids decrement the counter. Heartbeat comment every 20 s. Events are emitted post-commit on the existing domain-event bus and fanned out through an in-process per-live-code room registry (single API instance in v1; Redis pub/sub is a noted future swap behind the same interface, not built now).
- The SSE endpoint is a documented exception to the OpenAPI contract: described in the spec with its payload as a component schema (so DTO types generate), but each client wires its own streaming primitive — web native `EventSource`, RN `react-native-sse`, Android OkHttp SSE, iOS `URLSession.bytes` with a small line parser.
- Fallback: the snapshot endpoint doubles as the poll target — clients fall back to 5 s polling while foregrounded when the stream fails to connect or drops twice, stopping on background.
- Counters and lists count **active** attendances only (revoked rows excluded), and only accepted check-ins ever reach the stream by construction (events fire post-commit, after the unique gate).

### Manual roll call

- The professor opens the manual chamada for a turma (own classes only); this materializes the session like the live path but mints no code. The roster endpoint returns every enrolled student with their current attendance state (present + method + attendance id, or absent), so QR/code self check-ins appear pre-toggled — both chamada modes read one truth.
- Toggle on = immediate per-row INSERT (method manual, recorded_by = professor); toggle off = immediate revoke through the void seam (same-day window). "Salvar chamada" is pure navigation — no batch diff protocol, so a dropped connection loses at most one tap and the append-only model is never fought with client-side state reconciliation.
- The professor-10 screenshot's all-disabled state is a known capture bug; the specified behavior is the active one: enabled toggles, live "N presentes de M" count in the header, save button enabled.

### Derived stats (no cached columns, no jobs)

- All attendance statistics are **derived on read** from active attendances against materialized sessions; nothing is cached or scheduled in v1. The honest denominator rule: only sessions that exist as rows count — a day nobody opened never happened, for percentages and streaks alike.
- Aluno **presença %** = active attendances ÷ materialized sessions of the student's actively-enrolled classes, current calendar month (tenant timezone), sessions up to today only.
- Aluno **streak** ("aulas seguidas") = consecutive attended sessions counting back from the most recent materialized session of the student's enrolled classes; any such session without an active attendance breaks it. Revoking an attendance therefore retroactively affects the streak — accepted, since stats are derived.
- Graduation progress = the student's lifetime active-attendance count, exposed for the home card's "26 de 40 aulas" bar; the target (40) comes from graduation rules and stays a placeholder until the graduation slice — the card links nowhere new this phase.
- Professor dashboard: **alunos hoje** = distinct active check-ins today across classes the professor teaches; **presença média** = month attendance rate averaged across those classes; the next-class hero shows the current session's check-in count when a session exists. The remaining dashboard sections (ranking de presença, próximos da graduação, pagamentos, eventos) stay explicit placeholders owned by their slices.
- **Streak gamification toggle**: stored as a role-permission toggle for the student role (key `gamification.streak`, default allowed) — reusing the existing data-driven permission machinery and the admin "permissões por perfil" surface; no new settings table. When off, the API omits streak values and clients hide the streak tile and the success-pop streak line. It is a display toggle only — attendance data is unaffected.

### Module boundaries, surfaces, authorization

- Everything lands in the attendance module (it owns sessions, live codes, attendances, and the stream per the module-layout decision), with persona-scoped controllers under the existing guard chain: default-deny roles per controller, academy-status guard (read-only blocks every write here, check-ins included), RLS backstop.
- Ownership filtering per the authz design: professor endpoints resolve classes by `professor_user_id = caller`; a foreign class, session, or live code is a 404, never a 403. Aluno endpoints resolve the student record by the caller's user id.
- Endpoint surface (versioned prefix, generated into the OpenAPI spec):

| Endpoint | Role | Purpose |
|---|---|---|
| `POST /aluno/checkins` | student | check-in (qr / code / manual), returns attendance + fresh stats |
| `GET /aluno/home` | student | hero context (today's class + check-in state) + stat tiles + graduation progress |
| `POST /professor/classes/:id/live-codes` | professor | open chamada — session upsert + code/QR mint (idempotent) |
| `POST /professor/live-codes/:id/close` | professor | encerrar chamada (revoke code, session → done) |
| `GET /professor/live-codes/:id/attendances` | professor | snapshot + polling fallback (active rows, present count) |
| `POST /professor/live-codes/:id/stream-ticket` | professor | mint the ~60 s signed SSE ticket |
| `GET /professor/live-codes/:id/stream` | ticket | SSE stream (checkin / revoke events, heartbeat) — OpenAPI-documented exception |
| `POST /professor/classes/:id/roll-call` | professor | open manual chamada — session upsert + roster with attendance states |
| `POST /professor/sessions/:id/attendances` | professor | manual toggle-on (method manual, recorded_by professor) |
| `POST /professor/attendances/:id/revoke` | professor | same-day toggle-off via the void seam |
| `GET /professor/dashboard` | professor | alunos hoje, presença média, next-class hero with check-in count |
| `GET /professor/students` | professor | academy students list with `notEnrolledInClassId` filter (Adicionar aluno picker) |
| `POST /admin/attendances/:id/revoke` | admin | any-time audited revoke |
| `GET /admin/classes/:id/sessions` | admin | session list with per-session attendance counts |

- `GET /professor/students` folds the recorded backend follow-up: the mobile Adicionar aluno pickers switch from unioning other-class rosters to this endpoint with the non-enrolled filter.
- New stable problem+json codes in the shared registry: code invalid/expired, not enrolled in class, no session today / outside check-in window, already checked in (the duplicate state), revoke window closed, chamada already open (benign — returns the active code).

### Client scope split

- **Web (admin console)**: minimal visibility only — the turma detail's Phase-3 attendance placeholder tiles are replaced by the real session list with attendance counts. The professor experience is mobile-first and gets no web surface; the admin any-time revoke ships as an audited endpoint with its console surface deferred to the reports slice (recorded debt, not dropped).
- **Mobile (RN, Android, iOS)** carries the full experience on both personas: aluno check-in sheet (3 methods, success pop with streak, duplicate state, hero flip, live stat tiles) and professor chamada (live screen with code/QR/countdown/SSE counter+list/fallback/encerrar, manual roll call with toggles, dashboard tiles, and the Adicionar aluno picker rewired). Each client implements its thin SSE wrapper + fallback logic as a tracked parity task.

## Testing Decisions

- Same doctrine as specs 001–003 (their suites are the prior art): tests exercise external behavior through the API against a real Postgres with RLS active; assertions on status codes, stable error codes, and observable state — never on trigger internals or room-registry mechanics.
- Immutability (the audit decision's own test hooks, implemented here): as the app role, UPDATE and DELETE on `attendances` fail — grant, policy, and trigger each verified independently; the revoke seam refuses a professor after day-close and refuses cross-tenant ids; the partial unique allows re-check-in only after a revoke; the sanctioned revoke-columns-only UPDATE path works and any other column change is rejected.
- Check-in e2e: happy path per method; wrong/expired/revoked code rejected; foreign-academy code behaves as nonexistent; non-enrolled student rejected; manual outside the window rejected; duplicate attempt returns the already-checked-in state; two concurrent check-ins admit exactly one; read-only academy blocks all writes; session materialization is idempotent under concurrent open-chamada + manual check-in (one row).
- Live chamada e2e: open is idempotent and returns the active code; close invalidates code and QR immediately; reopen mints a fresh code with only one active at a time; snapshot returns active rows only and revokes decrement the count; stream-ticket auth — expired/forged ticket rejected, ticket bound to its live code only; an SSE integration test asserts checkin and revoke events arrive post-commit with correct presentCount.
- Stats: presença % and streak verified against constructed fixtures (missed materialized session breaks the streak; revoke retroactively recomputes; unmaterialized days ignored); gamification toggle off omits streak server-side; professor dashboard numbers scoped to own classes only.
- RBAC + RLS: aluno hitting professor routes → 403; professor hitting a foreign class/live code → 404; cross-tenant invisibility for the three new tables extends the fail-closed meta-test; the append-only registry meta-test covers `attendances`.
- Web: component tests for the turma-detail session list (counts, empty state) mocking the HTTP layer per the established pattern.
- Mobile: pure-logic tests for the check-in sheet state machine (method switch, success, duplicate, error states), the streak-visibility rule, and the SSE-wrapper fallback transitions (connect → drop ×2 → poll → recover) against mock transports; one integration test per client for the check-in happy path and the manual roll-call toggle round trip.

## Out of Scope

- Real geolocation verification for manual check-in — the location step is a client stub; the server accepts `method=manual` with no geo validation (design backlog).
- Push notifications and any notification riding the SSE channel — rooms are per-live-code, ephemeral, professor-only; the notification pipeline is its own slice.
- Graduation triggers and surfaces — lesson counting feeds the progress bar, but rules, promotion flows, and the graduation timeline belong to the graduation slice; belt-range columns on classes likewise.
- Agenda/calendar views beyond what check-in needs — the aluno agenda's per-day class list and its contextual check-in button land with the agenda feature.
- Attendance reports and rankings — admin reports slice owns the console reporting surface (including the UI for the admin revoke endpoint); ranking tiles stay placeholders.
- Session cancellation flows (`canceled` status is reserved, unsurfaced) and any pre-generation/cron of sessions.
- Cached stat columns, materialized views, or background recomputation — all stats are derived on read in v1.
- Horizontal fan-out infrastructure (Redis pub/sub) for SSE — single-instance in-process rooms, swap noted for later.

## Further Notes

- This spec implements three resolved decisions verbatim — the entity-model shapes for `class_sessions`/`checkin_codes`/`attendances`, the append-only + audited-revoke mechanics (including the same-day professor window), and the SSE + signed-ticket + polling-fallback realtime contract — with two recorded deltas: `checkin_codes.qr_token` and `opened_by_user_id` columns added (the QR needs a non-guessable payload distinct from the 4-digit code), and the streak-gamification toggle homed in the existing student-role permission keys.
- Enrollment is required for every check-in method, including open-mat-style classes — "toda a equipe" classes should simply enroll broadly; a drop-in/guest concept does not exist in v1.
- The professor-10 screenshot (manual chamada) captured a bugged all-disabled state; the active behavior specified here is authoritative. UI truth otherwise: aluno-03/04/05, professor-02/03/10 screenshots plus the Aluno and Professor prototypes — recreated pixel-faithful with Lumira tokens through the design-system package (the QR uses a real QR library, not the decorative SVG).
- PT-BR labels (Fazer check-in, Chamada aberta, Encerrar chamada, Presença registrada, aulas seguidas) are client copy; schema, enums, event names, and permission keys stay English per charter.
- Delivery follows the fixed order DB → backend → web → mobiles; the checklist below is mirrored into the root README, and checking a box there is the only "ticket closing" this project has.

## Delivery Checklist

- [ ] ATT.1 DB: Drizzle schema for class_sessions, checkin_codes (+qr_token, opened_by), attendances (+revoked cols) — UUIDv7 PKs, composite tenant FKs, method/status enums, session unique per class per day, partial unique active check-in
- [ ] ATT.2 DB: forced RLS fail-closed tenant policies on all three tables (SELECT+INSERT only on attendances), extending the RLS meta-test
- [ ] ATT.3 DB: append-only layer — no UPDATE/DELETE grants or policies on attendances, forbid_mutation trigger with the revoke-columns-only exception, append-only registry meta-test
- [ ] ATT.4 DB: attendance_revoke SECURITY DEFINER seam — tenant-validated, professor same-day window, admin any-time, audit rows (attendance.revoked, attendance.recorded_manual) in-transaction
- [ ] ATT.5 DB: dev seeds — materialized sessions with mixed-method attendances (some revoked) per fixture academy, written through the tenant-scoped path
- [ ] ATT.6 Backend: attendance module — idempotent session materialization, open/close/reopen chamada with code+QR mint, TTL (slot end + 15 min grace), one active code per session
- [ ] ATT.7 Backend: aluno check-in endpoint — qr/code/manual resolution to one validated INSERT, enrollment + today + window checks, duplicate → already-checked-in state, race-safe, fresh stats in response
- [ ] ATT.8 Backend: professor manual roll call — roster with attendance states (self check-ins pre-toggled), per-row mark (manual, recorded_by) and same-day revoke endpoints
- [ ] ATT.9 Backend: admin surface — any-time audited revoke endpoint and turma sessions list with attendance counts
- [ ] ATT.10 Backend: realtime — stream-ticket mint (HMAC, ~60 s, single-purpose), SSE stream with checkin/revoke events + 20 s heartbeat via post-commit event bridge and per-room registry, snapshot/polling endpoint, OpenAPI-documented exception
- [ ] ATT.11 Backend: derived stats — aluno home (presença % month, streak, graduation lesson count, gamification.streak toggle honored) and professor dashboard (alunos hoje, presença média, hero check-in count)
- [ ] ATT.12 Backend: GET /v1/professor/students with non-enrolled-in-class filter (closes the Adicionar aluno picker debt)
- [ ] ATT.13 Backend: e2e suite green — immutability layers, revoke windows, re-check-in after revoke, duplicate race, code expiry/close/reopen, foreign-tenant 404s, SSE ticket auth + event delivery, stats fixtures, gamification toggle, read-only block, RBAC + RLS coverage
- [ ] ATT.14 Web: turma detail session list with per-session attendance counts replacing the Phase-3 placeholder tiles (empty state included)
- [ ] ATT.15 RN: aluno check-in bottom sheet — 3-method segmented control (QR scan, 4-digit code, manual with location stub) wired to the check-in endpoint
- [ ] ATT.16 RN: aluno success pop with streak line, already-registered state, hero flip to Presença registrada, live stat tiles + graduation progress bar on Início
- [ ] ATT.17 RN: professor chamada ao vivo — code/QR/expiry screen with SSE counter+list (react-native-sse wrapper, snapshot-then-stream, 5 s polling fallback), encerrar/reopen
- [ ] ATT.18 RN: professor manual chamada (immediate toggles, N presentes header, manual markers) + dashboard tiles + Adicionar aluno picker rewired to /professor/students
- [ ] ATT.19 Android: aluno check-in sheet, success pop + streak, duplicate state, Início stat tiles per handoff
- [ ] ATT.20 Android: professor chamada ao vivo with OkHttp SSE wrapper + polling fallback, encerrar/reopen
- [ ] ATT.21 Android: professor manual chamada + dashboard tiles + Adicionar aluno picker rewired
- [ ] ATT.22 iOS: aluno check-in sheet, success pop + streak, duplicate state, Início stat tiles per handoff
- [ ] ATT.23 iOS: professor chamada ao vivo with URLSession SSE parser + polling fallback, encerrar/reopen
- [ ] ATT.24 iOS: professor manual chamada + dashboard tiles + Adicionar aluno picker rewired
