# 003 — Enrollment: Registry, Classes & Class Membership (Phase 3)

Status: ready-for-agent
Personas covered: Admin da academia, Professor, Responsável (+ Convite completion from Phase 2)

## Problem Statement

An academy can log in but cannot run itself. After Phase 2, every persona reaches an authenticated shell, yet there are no students, no guardians, no classes, and no way to put anyone on a mat: the admin's Cadastros screen has nothing behind it, the professor's "Minhas turmas" has no classes to list, and a responsável cannot register a child. Worse, the invite flow — the product's only signup — accepts a guardian's dependents in its payload and then silently drops them, and accepts a class binding it cannot honor because the `classes` table does not exist. Three debts were explicitly deferred from spec 001 to this slice: the guardian-foreign-dependent 404 e2e test, persistence of dependents from guardian invite acceptance, and hardening `invites.class_id` from a plain uuid into a composite tenant FK.

Until people and classes exist — with recurring weekly schedules, capacity limits, and enrollment links — nothing downstream (attendance in Phase 4, graduation, billing) has anything to attach to.

## Solution

The enrollment slice implements the people-and-classes triangle already designed in the core entity model: `students` (person records that may have no login and may be minors linked to a guardian), `guardians` (1 → N children), professors as plain user+membership rows, `classes` (turmas) with N recurring weekly `class_schedules` rows, and `enrollments` binding students to classes under a capacity limit.

The admin manages everything from the web Cadastros surface: four segments (alunos / professores / responsáveis / turmas), FAB-driven creation forms per type, multi-select on students with a bulk "Mover para turma" action, name-only editing, and soft archival instead of deletion. Creating a turma is one form — name, weekday chips, start time + duration, professor, limit — that fans out into schedule rows. A full class shows a "Lotada" badge everywhere occupancy renders.

The professor sees their own classes (list and detail with occupancy and roster) and can add or remove students from classes they teach. The responsável registers a child from the dependents panel: name and birth date produce an age-suggested class, and registering links the child to the guardian and enrolls them automatically — gated by the existing "cadastrar dependentes" permission toggle and by the ownership rule that a foreign dependent id behaves as a 404.

Finally, the invite flow is completed: `invites.class_id` becomes a real composite tenant FK, and the atomic accept transaction now persists what it previously only validated — the student (aluno kind) or the guardian plus dependent students (responsável kind), each enrolled into the invite-bound class when capacity allows. This closes all three deferred debts from spec 001.

## User Stories

### Admin — student registry

1. As an academy admin, I want a Cadastros screen segmented into alunos, professores, responsáveis, and turmas, so that all registry management lives in one place.
2. As an academy admin, I want to create a student with name and birth date via the FAB form, so that walk-in students exist in the system before they ever touch the app.
3. As an academy admin, I want the system to refuse creating a minor student without linking a guardian, so that the "minor always linked to a guardian" rule holds in my own forms, not just invites.
4. As an academy admin, I want each student row to show a status badge (Ativo for claimed/active records, Pendente for records with no linked login yet), so that I can see who has activated their account.
5. As an academy admin, I want to edit a registry record's name, so that typos are fixable (multi-field editing is not yet designed).
6. As an academy admin, I want "excluir" to soft-archive a student (deactivating them and ending their active enrollments) instead of destroying data, so that history survives and mistakes are reversible.

### Admin — professors and guardians

7. As an academy admin, I want to register a professor by name and email, so that a user with a professor membership is created for my academy.
8. As an academy admin, I want a newly registered professor to receive a set-your-password email, so that they can log in without me handling credentials.
9. As an academy admin, I want to register a guardian (name, phone, email) as a record without a login, so that a parent exists in the system before accepting any invite.
10. As an academy admin, I want the responsáveis segment to list guardians with their dependent count, so that family structures are visible at a glance.
11. As an academy admin, I want to link a student to an existing guardian at creation time, so that families entered manually stay connected.

### Admin — classes (turmas recorrentes)

12. As an academy admin, I want to create a recurring turma with name, weekday chips, start time, duration, professor, and student limit, so that the weekly grid exists as data.
13. As an academy admin, I want each selected weekday to become its own schedule slot at the chosen time, so that "Seg · Qua · Sex 19:00" is real recurrence, not a label.
14. As an academy admin, I want the turmas segment to list each class with its days, time, professor, and occupancy (e.g. 24/24), so that I see load without opening details.
15. As an academy admin, I want a full class to display a "Lotada" badge, so that capacity problems are visible immediately.
16. As an academy admin, I want a turma detail showing the recurring schedule, occupancy, and the enrolled roster, so that I can manage one class in one place.
17. As an academy admin, I want to add a student to a class from the class detail and remove one with a single tap, so that roster fixes are immediate.
18. As an academy admin, I want an optional age range on a turma, so that Kids classes carry the data behind the age chip and the age-based suggestion rule.
19. As an academy admin, I want archiving a turma to end its active enrollments and hide it from active listings, so that discontinued classes disappear without erasing history.

### Admin — multi-select & move

20. As an academy admin, I want a "Selecionar vários" mode on the students segment with per-row checkboxes and a selection count, so that I can operate on many students at once.
21. As an academy admin, I want a "Mover para turma" action on my selection that opens a destination-class picker, so that reorganizing classes is one gesture, not N edits.
22. As an academy admin, I want the move to be atomic — every selected student leaves their current class and enters the destination, or nothing changes — so that a half-applied move can never corrupt rosters.
23. As an academy admin, I want the move rejected with a clear capacity error when the destination cannot take the whole selection, so that a move can never overfill a class.

### Professor

24. As a professor, I want a "Minhas turmas" list showing only the classes I teach, with days, times, and occupancy, so that my week is one screen.
25. As a professor, I want a turma detail with student count, occupancy, and roster, so that I know who trains with me.
26. As a professor, I want an "Adicionar aluno" picker listing academy students not yet in my class, so that I can enroll someone right from the mat.
27. As a professor, I want to remove a student from my class, so that roster corrections don't wait for the admin.
28. As a professor, I want any class I don't teach to behave as if it does not exist (404), so that I can never touch another professor's roster.
29. As a professor, I want adding a student to a full class rejected with a clear error, so that the capacity rule binds me exactly as it binds the admin.

### Responsável

30. As a responsável, I want my dependents panel to list each child with their class and next scheduled slot, so that I always know when they train.
31. As a responsável, I want to register a child from a sheet with name and birth date, so that adding my kid takes seconds.
32. As a responsável, I want the sheet to suggest a class matching my child's age (e.g. "Kids · Ter e Qui 18:00"), so that I don't have to know the academy's grid.
33. As a responsável, I want registering to automatically link the child to me and enroll them in the suggested class, so that "vínculo automático" is real — no follow-up steps.
34. As a responsável, I want my child registered even when no age-matching class has room, so that a full grid delays enrollment, not the registration itself.
35. As a responsável, I want any dependent that is not mine to behave as a 404, so that other families' data — even its existence — is never leaked to me.
36. As a responsável whose academy disabled the "cadastrar dependentes" toggle, I want the action rejected server-side and hidden client-side, so that the admin's configuration is enforced.

### Invite completion (closes 001 debts)

37. As an invited aluno accepting a class-bound invite, I want to come out of signup already enrolled in that class, so that the invite's promise ("pre-bound to academy + class") is kept.
38. As an invited responsável, I want the dependents I typed during signup persisted as my linked children — enrolled in the invite's class when capacity allows — so that the stepped form's data is never silently dropped.
39. As an invited person accepting into a class that has meanwhile filled up, I want signup to still succeed with the enrollment skipped (surfaced to the admin as an unassigned student), so that a race on capacity never destroys an onboarding.
40. As a professor or admin generating an invite, I want the class binding validated against a real class in my academy, so that dead or foreign class references are impossible at the constraint level.

### Cross-cutting

41. As any academy member, I want every registry read and write scoped to my academy by RLS, so that no student, guardian, or class ever crosses tenants.
42. As an academy admin, I want registry mutations blocked in read-only (delinquent) mode and everything blocked when suspended, so that Phase-2 status rules govern this surface too.

## Implementation Decisions

### Schema (implements the resolved core entity model)

- New tenant-scoped tables exactly as designed in the entity model: `students`, `guardians`, `classes`, `class_schedules`, `enrollments` — UUIDv7 app-side PKs, `UNIQUE (tenant_id, id)` on parents, composite `(tenant_id, parent_id)` FKs on children, forced RLS with the standard tenant policy, all uniques and indexes leading with `tenant_id`.
- `students`: person record decoupled from login (`user_id` nullable, unique per tenant when set), `birth_date` required, nullable composite FK to `guardians`, status enum active/inactive. The minor⇒guardian rule stays app/service-enforced (age is time-dependent) and is applied in every creation path: admin form, guardian flow, invite accept.
- `students.academy_plan_id` remains a plain nullable uuid with a schema comment, mirroring the invites pattern — hardened to a composite FK when the billing slice lands `academy_plans`. Recorded as a known debt, not silently dropped.
- `classes`: name, `professor_user_id` (role validated in service against an active professor membership), capacity, status active/archived, plus nullable `age_min`/`age_max` integers. The age columns are an addition to the entity model, justified by the handoff (Kids card chip "4 a 12 anos") and required by the age-suggestion rule. Belt-range columns (`min_belt_id`/`max_belt_id`) are NOT created here — they depend on the shared belt catalogs owned by the graduation slice and will be added then as nullable columns (no rewrite).
- `class_schedules`: one row per weekday chip — `weekday` 0–6, `start_time`, `duration_minutes`, unique on (tenant, class, weekday, start_time). Creating a turma with N chips inserts N rows in the same transaction.
- `enrollments`: composite FKs to class and student, status enum active/removed, unique (tenant, class, student). Re-adding a removed student flips the existing row back to active (upsert on the unique key) rather than inserting a second row.
- Invite hardening (001 debt): migration converts `invites.class_id` into a composite `(tenant_id, class_id)` FK onto `classes`, making dead or cross-tenant class bindings impossible at the constraint level.

### Registry semantics

- Professors and admins are memberships, not a person table. "Registering a professor" = create (or reuse by email, cross-tenant) the global user + create the professor membership, then send a set-your-password email through the existing password-reset token seam (single-use, short-lived) — no new credential machinery, no password handling by the admin.
- Admin-created students and guardians are records without logins. Granting app access remains exclusively the invite flow; account merging/dedup between an admin-created record and an invite signup is out of scope (recorded in Further Notes).
- The student list's Ativo/Pendente badge is derived, not stored: Pendente = active student with `user_id` null (record not yet claimed by a login); Ativo = active with a linked user. No schema flag.
- Editing is name-only across all four registry types, per the handoff design backlog ("hoje só nome"); schedule/professor/capacity editing of an existing turma is deferred with it.
- "Excluir" is always soft archive: students flip to inactive, classes to archived; both operations end (mark removed) the record's active enrollments in the same transaction. No hard deletes anywhere in this slice.

### Capacity & the move flow

- Capacity is enforced in the service inside the tenant transaction with a `SELECT … FOR UPDATE` on the class row before counting active enrollments — single adds, bulk moves, and invite-accept enrollment all serialize through the same lock, so a race can never overfill a class. No DB trigger; the RLS-scoped transaction plus row lock is the mechanism.
- "Lotada" is derived (active enrollment count ≥ capacity) and returned by list/detail endpoints; clients never compute it from separate calls.
- Move-to-class is one atomic operation: for each selected student, end all their active enrollments and enroll into the destination; it validates the destination has room for the entire selection under the lock and rejects the whole batch otherwise (stable error code). Per the handoff ("plano e agenda são atualizados"), a moved student's schedule follows the destination class; plan changes are a billing concern and untouched here.
- Enrolling into an archived class is rejected with its own stable code.

### Invite acceptance completion (closes 001 debts)

- The atomic accept seam (the SECURITY DEFINER function established in Phase 2) is extended to persist, in the same transaction it already owns: the `students` row for aluno-kind invites (linked to the new user), or the `guardians` row plus one `students` row per submitted dependent for responsável-kind invites — every dependent guardian-linked, minors included by construction.
- When the invite carries a class binding, each created student is enrolled into that class under the same capacity lock. If the class is full at accept time, signup still succeeds and the enrollment is skipped: the student simply appears unenrolled in the admin registry (the Pendente/unassigned state); a dedicated notification is deferred to the notifications slice.
- The `identity.invite.accepted` domain event remains emitted for future listeners (notifications); persistence itself is transactional, not event-driven, because signup atomicity was fixed in spec 001.

### Age-suggested class rule

- Suggestion = the active, non-archived class where the child's age (computed from birth date) falls within `[age_min, age_max]`, has at least one free slot, tie-broken by lowest occupancy then name. No match (or no age-ranged classes) ⇒ no suggestion, and registration proceeds without enrollment.
- The rule runs server-side behind a suggestion endpoint consumed by the responsável sheet (and reusable later by admin forms); clients never re-implement the matching.

### Module boundaries, surfaces, authorization

- Everything lands in the `enrollment` module (it owns the student↔guardian↔turma triangle per the module-layout decision), with persona-scoped controllers: `/v1/admin/*` (registry CRUD, classes, move), `/v1/professor/*` (own classes, roster add/remove), `/v1/responsavel/*` (dependents, cadastrar filho, suggestion). Identity keeps owning invites; it calls into enrollment's exported service inside the accept seam.
- Existing guard chain applies unchanged: default-deny roles per controller class, academy-status guard (read-only blocks registry mutations), RLS backstop.
- The guardian "cadastrar dependentes" permission toggle (the existing `dependents.register` key for the guardian role, default on) gates child registration; denial uses the established permission-disabled code. Admin registry surfaces stay role-fixed (never toggleable).
- Ownership is service-level filtering per the authz design: professor endpoints filter classes by `professor_user_id = ctx.userId`; responsável endpoints filter students by their guardian record; a foreign class or dependent id is a 404, never a 403 — no existence leak.

### Endpoint surface (versioned prefix, generated into the OpenAPI spec)

| Endpoint                                                                                                                  | Role              | Purpose                                                     |
| ------------------------------------------------------------------------------------------------------------------------- | ----------------- | ----------------------------------------------------------- |
| `GET/POST /admin/students`, `PATCH /admin/students/:id` (name), `POST /admin/students/:id/archive`                        | admin             | student registry                                            |
| `GET/POST /admin/guardians`, `PATCH .../:id`, `POST .../:id/archive`                                                      | admin             | guardian registry                                           |
| `GET/POST /admin/professors`                                                                                              | admin             | professor registry (user + membership + set-password email) |
| `GET/POST /admin/classes`, `GET /admin/classes/:id`, `PATCH /admin/classes/:id` (name), `POST /admin/classes/:id/archive` | admin             | turmas with schedules + occupancy                           |
| `POST /admin/classes/:id/students`, `DELETE /admin/classes/:id/students/:studentId`                                       | admin             | roster add/remove                                           |
| `POST /admin/students/move`                                                                                               | admin             | atomic bulk move to destination class                       |
| `GET /professor/classes`, `GET /professor/classes/:id`                                                                    | professor         | own classes, detail + roster                                |
| `POST /professor/classes/:id/students`, `DELETE /professor/classes/:id/students/:studentId`                               | professor         | roster add/remove (own classes only)                        |
| `GET /responsavel/dependents`, `GET /responsavel/dependents/:id`                                                          | guardian          | own children + detail with class schedule                   |
| `POST /responsavel/dependents`                                                                                            | guardian (toggle) | cadastrar filho + auto link + suggested enrollment          |
| `GET /responsavel/class-suggestion?birthDate=`                                                                            | guardian          | age-suggested class                                         |

New problem+json codes in the shared registry: class full, already enrolled, class archived, guardian required for minor, move capacity exceeded (reusing class-full), permission disabled and minor-requires-guardian reused from Phase 2.

### Client scope split

- Web (admin console) is the only surface with registry CRUD, the move flow, and turma creation — matching the handoff's Admin persona and the Phase-2 rule that admin is web-only.
- Mobile (RN, Android, iOS) implements read views plus exactly two mutations, per the handoff: professor add/remove student on own classes, and responsável cadastrar filho with the age suggestion. Aluno-persona surfaces are untouched this phase.
- Frequency/attendance figures on professor and admin class screens (84% tiles, per-student presence, "Fazer chamada de hoje") belong to Phase 4: this slice renders occupancy for real and shows the attendance tiles in an explicit placeholder state, recorded as parity-with-design debt in the README, never faked with dummy numbers.

## Testing Decisions

- Same doctrine as spec 001 (its suite is the prior art): tests exercise external behavior through the API against a real Postgres with RLS active; assertions are on status codes, stable error codes, and observable state — never on service internals or lock mechanics.
- Backend e2e must cover: the deferred guardian-foreign-dependent 404 (explicitly closing the 001 debt) and its professor twin (foreign class → 404); minor student creation without guardian rejected in both admin and invite paths; capacity — add to full class rejected, two concurrent adds to a 1-slot class admit exactly one, bulk move rejected atomically when the destination lacks room, invite accept into a full class succeeds with enrollment skipped; responsável flow — dependents toggle off → permission-disabled, suggestion respects age range and fullness, registration auto-links and auto-enrolls; invite accept persists student/guardian/dependents/enrollments atomically; archive semantics (class archive ends enrollments; archived class refuses enrollment); RBAC (professor hitting `/v1/admin/*` registry routes → 403); read-only academy blocks registry mutations; RLS cross-tenant invisibility for all five new tables (extending the fail-closed meta-test).
- DB tests: migration applies cleanly to a fresh database and on top of Phase-2 state (the `invites.class_id` hardening must migrate existing rows); enrollment unique-key reactivation behavior.
- Web: component/integration tests for segment switching, multi-select state machine (enter/cancel/count/move), form validation (minor requires guardian; weekday chips ≥ 1), and Lotada badge rendering — mocking the HTTP layer per the 001 pattern.
- Mobile: pure-logic tests for the suggestion-sheet state and roster add/remove flows against mock transports; one integration test per client for the professor roster mutation and the cadastrar-filho happy path.

## Out of Scope

- Attendance and check-in (Phase 4) — class sessions, roll call, live codes, and every frequency/presence statistic; attendance tiles render as placeholders.
- Graduation — belt catalogs, belt min/max on classes (columns added by the graduation slice), belt display on student rows and class cards ("Branca a azul" chips).
- Billing beyond the existing plan reference — `academy_plans`, charges, plan display on student rows; `students.academy_plan_id` stays a plain uuid until then.
- Events and store modules.
- Multi-field editing of registry records (design backlog: only name is editable) and editing an existing turma's schedule/professor/capacity.
- Account merging between admin-created person records and invite signups; student self-service class changes.
- Notifications (e.g. alerting the admin about capacity-skipped invite enrollments) — the notifications slice.
- Aluno-persona agenda views of class schedules — they land with the aluno agenda feature.

## Further Notes

- This spec implements the entity model resolved in the database wayfinder (students, guardians, classes, class_schedules, enrollments) with two recorded deltas: `classes.age_min`/`age_max` added (age-suggestion rule + Kids chip), and belt-range columns deferred to the graduation slice.
- All three spec-001 deferred debts are closed here: the guardian-dependent 404 e2e test, dependents persistence in guardian invite acceptance, and `invites.class_id` composite-FK hardening. `invites.academy_plan_id` and `students.academy_plan_id` remain the last plain-uuid debts, owned by the billing slice.
- UI truth: admin-07…12, professor-07…09, and responsavel-08 screenshots plus the Admin/Professor/Responsável prototypes; all screens recreated pixel-faithful with Lumira tokens through the design-system package (P1 components — SegmentedControl, ListRow, BottomSheet, Chip, StatTile, Badge — land with these screens).
- PT-BR labels (Cadastros, Lotada, Mover para turma, Cadastrar aluno) are client copy; schema, enums, and permission keys stay English per charter.
- Delivery follows the fixed order DB → backend → web → mobiles; the checklist below is mirrored into the root README, and checking a box there is the only "ticket closing" this project has.

## Delivery Checklist

- [ ] ENR.1 DB: Drizzle schema for students, guardians, classes (+age range), class_schedules, enrollments — UUIDv7 PKs, composite tenant FKs, status enums, uniques per the entity model
- [ ] ENR.2 DB: forced RLS with fail-closed tenant policies on all five new tables, extending the RLS meta-test
- [ ] ENR.3 DB: migration hardening `invites.class_id` to a composite tenant FK onto classes, applying cleanly over Phase-2 data
- [ ] ENR.4 DB: invite-accept SECURITY DEFINER seam extended to persist student/guardian + dependents + class enrollments atomically
- [ ] ENR.5 DB: dev seeds — sample classes with schedules, enrollments, guardians with dependents per fixture academy, written through the tenant-scoped path
- [ ] ENR.6 Backend: enrollment module registry CRUD — students/guardians create + list (segment filters, derived Ativo/Pendente), name-only edit, soft archive ending enrollments, minor-requires-guardian enforcement
- [ ] ENR.7 Backend: professor registration — user reuse-or-create + professor membership + set-your-password email via the reset-token seam
- [ ] ENR.8 Backend: classes — create recurring turma (weekday chips → schedule rows), list/detail with occupancy and Lotada, name-only edit, soft archive
- [ ] ENR.9 Backend: enrollments — roster add/remove with row-locked capacity enforcement, reactivation upsert, archived-class rejection, atomic bulk move with all-or-nothing capacity check
- [ ] ENR.10 Backend: professor surface — own-classes list/detail/roster endpoints with ownership filtering (foreign class → 404)
- [ ] ENR.11 Backend: responsável surface — dependents list/detail (foreign id → 404), cadastrar filho behind the dependents.register toggle with auto guardian link, age-suggestion endpoint + auto-enrollment
- [ ] ENR.12 Backend: e2e suite green — guardian 404 (001 debt closed), professor 404, capacity race, atomic move, invite dependents persisted, full-class invite fallback, toggle-off denial, archive semantics, RBAC + read-only + RLS coverage
- [ ] ENR.13 Web: Cadastros screen per handoff — four segments, list rows with badges, FAB creation forms per type (minor⇒guardian validation)
- [ ] ENR.14 Web: multi-select mode + Mover para turma sheet with destination picker, capacity feedback, and atomic result handling
- [ ] ENR.15 Web: turma surfaces — nova turma recorrente form (chips, time+duration, professor, limit, optional age range) and turma detail with schedule, occupancy, attendance placeholder tiles, roster add/remove
- [ ] ENR.16 Web: name-only edit and excluir (soft archive) flows with confirmation across all four segments
- [ ] ENR.17 RN: professor Minhas turmas list + turma detail read views (schedules, occupancy, roster, placeholder tiles) per handoff
- [ ] ENR.18 RN: professor Adicionar aluno picker + remove-from-roster action wired to the professor endpoints
- [ ] ENR.19 RN: responsável dependents panel + child detail read views with class schedule
- [ ] ENR.20 RN: responsável Cadastrar aluno sheet — name, birth date, age-suggested class chip, auto link + enrollment, toggle-off hidden state
- [ ] ENR.21 Android: professor classes list + detail read views per handoff
- [ ] ENR.22 Android: professor roster add/remove + responsável dependents panel read views
- [ ] ENR.23 Android: responsável Cadastrar aluno sheet with age suggestion
- [ ] ENR.24 iOS: professor classes list + detail read views per handoff
- [ ] ENR.25 iOS: professor roster add/remove + responsável dependents panel read views
- [ ] ENR.26 iOS: responsável Cadastrar aluno sheet with age suggestion
