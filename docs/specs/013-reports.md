# 013 — Reports, Rankings & Aluno Polish (Phase 13)

Status: ready-for-agent
Personas covered: Admin da academia, Aluno, Professor

Follows the to-spec template. UI truth: admin-18-relatorios (5 report rows, each with CSV + PDF actions, header "Relatórios / Exporte em CSV ou PDF"), aluno-06-ranking-por-aulas / aluno-07-ranking-por-eventos and professor-05/professor-06 (same "Ranking do mês" screen professor-side: Por aulas / Por eventos segmented control, position circles, gradient bars, "você" highlight, selo footnote), aluno-18-dados-pessoais-completo (Identificação with locked CPF/RG, Contato, Endereço, Contato de emergência, Trocar foto, Salvar), aluno-09-graduacao-timeline ("Ver certificado" on the belt-promotion entry), aluno home "Ranking do mês" entry card ("Você está em 2º em presença — continue assim") and professor dashboard "Ranking de presença · julho" section. Business truth: handoff README v2 additions ("Admin: **5 relatórios** CSV/PDF; Professor: **ranking completo**; Aluno: **certificado** renderizado com download, **dados pessoais** editáveis") and the deferrals recorded by specs 004 ("admin reports slice owns the console reporting surface... ranking tiles stay placeholders"), 005 ("Ver certificado is a render-only placeholder... recorded debt"), and 008 ("Ranking Por eventos stays owned by its future slice").

## Problem Statement

Phase 13 is the debt-collection phase: four features the handoff promises are still placeholders that every earlier spec explicitly deferred here.

The admin has no reporting surface at all. Every number a report needs already exists as rows — charges and payments (Phase 6), attendances against materialized sessions (Phase 4), graduation history (Phase 5), events and registrations (Phase 8), orders and items (Phase 9) — but the only way to get data *out* of the product is screen-scraping the console. admin-18 shows five one-tap exports (Financeiro mensal, Frequência por turma, Inadimplência, Graduações, Vendas da loja), none of which exist.

The ranking screens are the oldest unpaid placeholder. Spec 004 shipped presença % and streak but left "ranking de presença" as an explicit placeholder on the professor dashboard; spec 008 did the same for the Por eventos segment. The aluno home has no ranking entry, and the four full-screen rankings (aluno-06/07, professor-05/06) have no endpoint to render: nothing computes per-student monthly attendance counts or semester event participation.

The aluno's dados pessoais row is a stub because the data has nowhere to live: `users` was deliberately kept lean by the auth phase (email, name, phone, birth date, avatar, locale) — no CPF, no RG, no gender, no address, no emergency contact. aluno-18 shows all of them, with CPF/RG rendered locked.

And "Ver certificado" on the graduation timeline is a disabled button on all three mobiles — spec 005 shipped the `certificateAvailable` placeholder flag and recorded certificate rendering as this phase's debt.

## Solution

**Relatórios** (admin-18): a new backend `reports` module derives the five reports on read from existing rows — no snapshot tables, no schedulers. Each report has a JSON read model and a **streamed CSV download** (real file, UTF-8 BOM + semicolon, pt-BR formatting, Content-Disposition filename). The **PDF button opens a print-friendly HTML view** in a new tab rendered from the same JSON — the browser's print-to-PDF is the v1 "PDF"; a real server-side PDF library is recorded debt. The web console gains `/admin/relatorios` (reached from the Relatórios header icon on the Visão financeira, per the admin prototype) with a month picker and the five rows exactly per admin-18. Admin-only — professor sees money in two of the five reports, so the whole surface is admin-gated.

**Rankings**: one read endpoint, `GET /v1/rankings?by=lessons|events`, academy-wide over active students — lessons = active attendances in the calendar month (tenant timezone), events = confirmed registrations to events in the current semester (matching the two subtitles: "Agosto · academia" vs "Participações em eventos no semestre"). Top 10 plus the requesting student's own position when outside it. Both aluno and professor consume it: the aluno gets the home "Ranking do mês" entry card with their live position and the full screen per aluno-06/07; the professor dashboard's placeholder "Ranking de presença" section becomes real (top rows + Ver todos) opening the full screen per professor-05/06. Ranking is visible to all — the `gamification.streak` permission toggle keeps governing only the streak tile, a decision recorded below. The selos footnote ("12+ aulas no mês valem o selo **Constância**; presença em eventos vale o selo **Espírito de equipe**") ships as static copy; badge computation is not a v1 feature.

**Dados pessoais** (aluno-18): additive nullable columns on `users` — the profile describes the person, not the tenant, so a user who trains at two academies fills it once, and a future guardian/professor profile screen reuses the same storage without migration. The screen itself stays aluno-scoped in v1 (the only one the handoff designed): `GET/PUT /v1/aluno/profile` plus the mobile screen on all three clients. CPF and RG are **write-once**: settable while NULL, locked after (the aluno-18 dashed boxes with lock icons); email and birth date are read-only (identity/auth facts); name edits sync onto the linked student row so the roster never disagrees with the profile. "Trocar foto" renders as the disabled placeholder it is (avatars stay initials; upload is recorded debt).

**Certificado** (aluno-09): the timeline's belt-promotion entries already carry everything a certificate states — belt, date, awarding professor — and the session carries the academy name and brand. The certificate becomes a **client-rendered view** (academy-branded, belt bar, student name, belt awarded, date, professor signature line) with "download" = the OS share/print sheet on the rendered view. No new endpoint; the backend flips `certificateAvailable` from placeholder to real on belt-promotion entries and the three mobiles unlock the button. A real PDF file stays recorded debt alongside the reports one.

## User Stories

### Admin — Relatórios (admin-18)

1. As an academy admin, I want a "Relatórios" screen listing five reports with CSV and PDF actions, so that the data my academy generates is mine to take.
2. As an academy admin, I want a "Financeiro mensal" report (receita, inadimplência e previsto for the chosen month, plus every charge row with student, origin, due date, status and amount), so that my accountant works from real numbers.
3. As an academy admin, I want a "Frequência por turma" report (per class, each enrolled student's presenças, faltas and % for the month), so that attendance is auditable outside the app.
4. As an academy admin, I want an "Inadimplência" report (every overdue open charge with student, amount, due date, days overdue and notifications sent), so that collections has a worklist.
5. As an academy admin, I want a "Graduações" report (promotions and degrees awarded in the semester, with student, belt, degree, awarding professor and date), so that graduation history leaves the timeline.
6. As an academy admin, I want a "Vendas da loja" report (pedidos, itens e vendas of the month with order number, buyer, product, size, quantity, amount, status), so that store performance is exportable.
7. As an academy admin, I want the CSV button to download a real file that opens correctly in pt-BR Excel, so that export means export.
8. As an academy admin, I want the PDF button to open a clean print view of the same report in a new tab, so that I can save or print it without a spreadsheet.
9. As an academy admin, I want a month picker on the reports screen (defaulting to the current month) that drives the month-windowed reports, so that I can export any past month.
10. As a professor, I want the reports surface refused for my role, so that the charter's "professor has no financial access" holds.

### Aluno — Ranking (aluno-06/07 + home card)

11. As an aluno, I want a "Ranking do mês" card on my home telling me my current position in presença, so that the ranking invites me in.
12. As an aluno, I want a full ranking screen with Por aulas / Por eventos segments, so that both kinds of dedication are visible.
13. As an aluno, I want the Por aulas ranking to list the month's most present students with position circles, gradient bars proportional to the leader and "N aulas" counts, so that the screen matches aluno-06 exactly.
14. As an aluno, I want the Por eventos ranking to count event participations in the semester, so that seasonal effort is measured on a fair window.
15. As an aluno, I want my own row highlighted with a "você" chip and an outlined card, so that I find myself at a glance.
16. As an aluno outside the top of the list, I want my own position and count still shown, so that the ranking never hides me.
17. As an aluno, I want the selos footnote (Constância for 12+ aulas, Espírito de equipe for event presence), so that the gamification promise reads exactly per the prototype.

### Professor — Ranking (professor-05/06 + dashboard)

18. As a professor, I want the dashboard's "Ranking de presença" section to show the month's real top students, so that the Phase-4 placeholder is finally paid.
19. As a professor, I want "Ver todos" to open the same full ranking screen with both segments, so that my view matches what students see.
20. As a professor, I want the ranking to cover the whole academy's active students, so that I see the mat, not just my own turmas.

### Aluno — Dados pessoais (aluno-18)

21. As an aluno, I want a Dados pessoais screen reached from my perfil with Identificação, Contato, Endereço and Contato de emergência sections, so that my registration is complete and mine to maintain.
22. As an aluno, I want to fill my CPF and RG once and see them locked afterwards (dashed field, lock icon), so that identity documents can't drift after being set.
23. As an aluno, I want my email and birth date shown but not editable, so that login identity and age-dependent rules stay where the academy manages them.
24. As an aluno, I want to edit my name, gender, phone, address (street line, Cidade / UF, CEP) and emergency contact (name, phone), so that the academy can reach me and my family.
25. As an aluno, I want Salvar to validate my CEP, UF and phone formats with clear messages, so that bad data is caught at the door.
26. As an aluno, I want my edited name reflected wherever the academy lists me, so that profile and roster never disagree.
27. As an aluno, I want a "Trocar foto" button rendered as the placeholder it is, so that the roadmap is visible without pretending to work.

### Aluno — Certificado (aluno-09)

28. As an aluno, I want "Ver certificado" on my belt-promotion timeline entries to open a rendered certificate (academy brand, my name, the belt, the date, the professor), so that a promotion has a keepsake.
29. As an aluno, I want a share/download action on the certificate that hands the rendered view to the OS share or print sheet, so that I can post or print it.
30. As an aluno, I want degree entries and the initial-belt entry to stay without the certificate action, so that certificates mean belt promotions, exactly per aluno-09.

### Cross-cutting

31. As an academy member of one academy, I want reports, rankings and profiles scoped to my academy only, so that multi-tenant isolation holds on every new read model.
32. As an academy admin of a delinquent (read-only) academy, I want reports and rankings still readable, so that read-only means read-only, not blind.
33. As any client, I want all five report windows and both ranking windows computed in the tenant timezone, so that month and semester boundaries land on the academy's calendar.

## Implementation Decisions

### Schema — additive columns on `users`, no new tables

- **Profile columns on `users`** (all nullable, additive): `gender`, `cpf`, `rg`, `address_line`, `address_city`, `address_state`, `address_zip`, `emergency_contact_name`, `emergency_contact_phone`. Placement decision: the profile is personal data about the human, not tenant data — storing it on the auth-global `users` row means one profile across academies and free reuse if guardian/professor profile screens are designed later (the handoff designed aluno only, so only the aluno surface ships). A tenant-scoped `student_profiles` table was rejected: it would duplicate the same person's CPF per academy and orphan the data on transfer.
- **Format CHECKs in the database**: `cpf` stored as 11 normalized digits (`^[0-9]{11}$` — clients render the mask), `address_zip` as 8 digits (CEP), `address_state` as 2 uppercase letters, `gender` constrained to a small fixed set. `rg` stays free-format trimmed text (state formats vary). No CPF uniqueness constraint in v1 — cross-user dedupe is not this phase's problem and admin-created students without logins can't hold one anyway; recorded.
- **CPF/RG write-once is service-enforced** (settable while NULL, 422 on any change after), not a database trigger — the lock is a product rule with a future admin-unlock story, not an immutability invariant like attendance rows.
- **Nothing else changes.** Reports and rankings are pure read models over existing tables (charges/payments, attendances/class_sessions, student_graduations, events/event_registrations, orders/order_items, notifications); no snapshot tables, no cached columns, no materialized views — the Phase-4 derive-on-read doctrine extended to its natural conclusion.
- **Dev seeds**: the fixture aluno gets a full profile with CPF/RG set (locked state demoable on first login); attendance, event-registration, graduation and order fixtures are spread so all five reports and both ranking segments render non-empty with a distinct top 3 and the fixture aluno inside the top 10.

### Backend — one `reports` module + two small additions to existing modules

A new `reports` module owns the cross-slice read models (the home spec 004 pointed at: "admin reports slice owns the console reporting surface... ranking tiles stay placeholders"). Profile endpoints land in the identity module (it owns `users`); the certificate flag is a graduation-module read-model fix.

| Route | Roles |
|---|---|
| `GET /admin/reports/:report` (JSON) | admin |
| `GET /admin/reports/:report/csv` (streamed file) | admin |
| `GET /rankings?by=lessons\|events&month=` | student, professor |
| `GET /aluno/profile` · `PUT /aluno/profile` | student |

- **Report slugs and windows**: `financeiro`, `frequencia`, `loja` take `month=YYYY-MM` (default: current month, tenant timezone); `graduacoes` takes `month` and reports the **semester containing it** (Jan–Jun / Jul–Dec, per "no semestre"); `inadimplencia` ignores `month` — it is an as-of-now snapshot ("cobranças vencidas" has no history without a snapshot table, recorded as the reason).
- **Financeiro mensal** runs the existing idempotent charge-materialization pass first (spec 006's rule: every money-displaying entry point), then reuses the shipped overview formulas — receita = succeeded payments by `paid_at` in the month, previsto = open charges due in the month, inadimplência % = overdue-open ÷ total materialized plan-charge amount — as the summary block, plus one row per charge touching the month (student, origin, competência, due date, status, amount, paid at).
- **Frequência por turma** groups by class: per enrolled student, presenças = active attendances, faltas = the class's materialized sessions in the month minus presenças, % over that same denominator — the honest-denominator rule verbatim (a day nobody opened never happened). Revoked attendances never count.
- **Inadimplência** lists every open overdue charge with days-overdue, and a "notificações enviadas" count per row = payment-category notification rows addressed to that charge's payer (the student's user, or the guardian for bill-to-guardian charges) created since the charge's due date. Notifications carry no charge FK by design (semantic routes only), so this is an honest approximation — recorded as such rather than adding a linkage column for one report.
- **Graduações** lists award rows (degree and belt kinds) in the semester, excluding reversed awards and revocation rows themselves: student, tipo (grau/faixa), belt, degree, awarding professor, date.
- **Vendas da loja** lists the month's orders that reached `paid` or beyond (canceled and never-paid excluded from totals but pending listed with status): number, date, buyer, product, size, quantity, amount, status; totals = pedidos count, itens quantity sum, vendas amount sum.
- **CSV shape**: streamed response, UTF-8 with BOM, **semicolon delimiter** and decimal-comma money — the combination pt-BR Excel opens correctly by double-click; ISO dates; `Content-Disposition: attachment` with `<slug>-<YYYY-MM>.csv` filenames. The CSV is generated server-side from the same read model as the JSON — one source of truth, two serializations.
- **Rankings**: `by=lessons` counts active (non-revoked) attendances in the calendar month; `by=events` counts `confirmed` registrations to non-canceled events whose `starts_at` falls in the current semester. Active students only, whole academy. Response: top 10 rows `{position, name, count}` with positions assigned after sorting count-desc then name-asc (deterministic ties), plus `me: {position, count} | null` — populated for a student requester outside the top 10, always null for professors (they are not ranked). Bar widths are client-derived (count ÷ leader count). **Visibility decision**: the ranking is visible to all students and professors regardless of the `gamification.streak` toggle — that toggle was scoped by spec 004 as a streak-display switch only, and the handoff ships rankings unconditionally; recorded so nobody later "discovers" an inconsistency.
- **Profile**: GET returns the users-row profile fields plus read-only `email` and `birthDate` (birth date served from the linked student row when one exists in the active academy — the enrollment record is the age-rule authority) and `cpfLocked`/`rgLocked` flags. PUT validates per the CHECK formats (CPF checksum validated in the service, stored as digits), rejects CPF/RG changes once set (422 with a PT-BR message), and **syncs `full_name` onto the linked student row in the same transaction** so rosters, chamada lists and rankings show the same name. Email and birth date in the payload are ignored-with-422 rather than silently dropped. No audit row — self-service personal data is not staff action; the charter's audit seam stays for staff writes.
- **Certificate flag**: `GET /aluno/graduation` timeline entries of kind belt-promotion get `certificateAvailable: true` (the Phase-5 placeholder shipped it false pending this phase); degree and initial-belt entries stay false. No certificate endpoint — the view renders from timeline data plus the session's academy name and brand.
- All new tenant reads run under the existing guard chain (role guard, academy-status guard, RLS backstop); reports and rankings are reads and therefore work in read-only (delinquent) academies; the profile PUT is blocked there like every write.

### Web — one screen (reports only)

- **`/admin/relatorios`** reached from the Relatórios header icon on the Visão financeira (per the admin prototype's header action): back-arrow header "Relatórios / Exporte em CSV ou PDF", a month picker (current month default), and the five rows exactly per admin-18 — title, subtitle (Financeiro mensal "Receita, inadimplência e previsto · <mês>"; Frequência por turma "Presenças e faltas por aluno · <mês>"; Inadimplência "Cobranças vencidas e notificações enviadas"; Graduações "Promoções e graus registrados no semestre"; Vendas da loja "Pedidos, itens e vendas do mês"), outlined CSV button and filled PDF button.
- **CSV downloads are authenticated fetches** saved via a blob URL (the API requires the bearer header, so a bare `<a href>` cannot work) with the server's filename. **PDF opens the print view**: a print-styled route rendering the report JSON (report title, academy name, period, summary block, table) that triggers the browser print dialog — print-to-PDF is the delivery; a server-side PDF library is recorded debt.
- No other web work: aluno, professor rankings, dados pessoais and certificado are mobile-first personas (webs serves Admin + Plataforma + Convite by the recorded routing decision) — restated so the absence of web rows is a decision, not a gap.

### Mobile — three features × three clients

- **Dados pessoais** (aluno-18): the perfil's stub row opens the screen — avatar with "Trocar foto" placeholder (disabled action), Salvar in the header, section labels IDENTIFICAÇÃO / CONTATO / ENDEREÇO / CONTATO DE EMERGÊNCIA, locked CPF/RG rendered as dashed boxes with lock icons once set (editable inputs while empty), email and birth date read-only, the Cidade / UF + CEP row per the prototype (single "Cidade / UF" input parsed on save into the two typed columns; UF validated), save → toast + refreshed state.
- **Rankings**: the aluno home gains the "Ranking do mês" entry card (pink bar-chart icon, "Você está em <N°> em presença — continue assim" from the endpoint's `me`) opening the full screen; the professor dashboard's placeholder section renders the real top 3 with "Ver todos" opening the same screen. Full screen per the four screenshots: back header with dynamic subtitle ("<Mês> · <academia>" / "Participações em eventos no semestre"), Por aulas / Por eventos segmented control, position circles (leader filled), name + "você" chip + outlined row for self (aluno only), gradient progress bars scaled to the leader, "N aulas"/"N eventos" trailing, selos footnote card as static copy.
- **Certificado**: belt-promotion timeline entries unlock "Ver certificado" opening the certificate view — academy-branded (session brand through each client's theme engine), academy name, "Certificado de graduação" composition with student name, the belt (rendered through the shared BeltBar/belt tokens — no hex literals), award date and professor signature line; a share action hands the rendered view to the platform share/print sheet (RN: view capture + share; Android/iOS: native share/print of the rendered view). Degree entries keep no button.
- All three features land identically on RN, Android and iOS per the parity rule; any client-specific shortfall is recorded in the README notes, never silently dropped.

## Testing Decisions

- Same doctrine as specs 001–012 (their suites are the prior art): externally observable behavior through the API against real Postgres with RLS active; no assertions on internals; fixtures constructed per test.
- **Backend e2e** (`reports.e2e.spec.ts` + identity/graduation additions): each report's math against constructed fixtures (financeiro totals match the shipped overview for the same month and include the materialization pass; frequência honest denominators — revoked attendance and unopened days excluded; inadimplência rows + notification counts; graduações excludes reversed awards and revocation rows; loja totals exclude canceled) and the month/semester windowing across a boundary in the tenant timezone; CSV responses asserted on BOM + delimiter + header row + filename; rankings math (counts, tie ordering, top-10 cut, `me` populated outside top 10 and null for professors, revoked/pending exclusions, active-students-only); profile round trip (GET flags, PUT validation per field, CPF/RG write-once 422, email/birthDate rejection, name sync visible on the student row); `certificateAvailable` true exactly on belt-promotion entries; full RBAC matrix (professor/aluno/guardian → 403 on reports, guardian → 403 on rankings, cross-tenant → 404 via the fail-closed meta-test pattern, read-only academy allows report/ranking reads and blocks the profile PUT) and the CI route-assertion check covering every new route.
- **Web**: page spec for relatorios per the established pattern — five rows render with month-picker-driven subtitles, CSV click issues the authenticated fetch and saves the blob, PDF click opens the print route which renders the mocked JSON.
- **Mobile** (each client): pure-logic tests for the profile form validation/lock mapping and the ranking row mapping (position styling, você detection, bar scaling); one integration test per client per feature — profile load → edit → save round trip against the mock server, ranking screen renders both segments with the você highlight, certificate view renders from a timeline entry with the branded composition.

## Out of Scope

- **Real PDF generation** (server-side pdfkit/pdfmake or client PDF lib) — the PDF button is the print-friendly HTML view; recorded debt for both reports and the certificate.
- **Report scheduling, e-mail delivery, or report history** — on-demand export only.
- **An "Eventos" report** — admin-18's five reports are Financeiro, Frequência, Inadimplência, Graduações and Vendas da loja; no events report exists in the design (recorded because early notes guessed one).
- **Foto upload** ("Trocar foto" placeholder only; avatars stay initials per the handoff) — recorded debt.
- **Guardian and professor dados pessoais screens** — storage on `users` is ready; the handoff designed the aluno screen only.
- **Editing email or birth date from the profile**, and any admin flow to unlock/correct a set CPF/RG — locked means locked in v1; corrections are a support operation, recorded.
- **CPF uniqueness/dedupe across users** — recorded above.
- **Admin ranking screens** and guardian-visible rankings — aluno + professor only, per the screenshots.
- **Selo computation or display** (Constância / Espírito de equipe badges on rows or profiles) — footnote copy only; badges are design intent without a designed surface.
- **Guardian-side certificate** (responsável filho-detalhe timeline keeps no certificate action — not in the design).
- **Snapshot tables / report history for inadimplência**, and a notifications→charge linkage column — both declined above with reasons.

## Further Notes

- This phase pays the recorded deferrals verbatim: spec 004's reports-and-rankings placeholder, spec 005's certificate placeholder, spec 008's Por eventos segment, and the aluno perfil "dados pessoais (stub)" from Phase 1 — update the README notes that recorded each.
- The "notificações enviadas" count is an approximation (payer's payment-category notifications since due date); if collections ever needs per-charge notification truth, that is the moment a charge linkage column earns its migration — recorded so the trade-off is visible when it bites.
- Semester = calendar halves (Jan–Jun, Jul–Dec) in the tenant timezone, used identically by the Graduações report and the Por eventos ranking.
- All amounts stay integer cents end-to-end; CSV and print views format pt-BR at the edge, matching every prior money surface.
- Delivery follows the fixed order DB → backend → web → mobiles (web carries only the reports leg); the checklist below is mirrored into the root README, and checking a box there is the only "ticket closing" this project has.

## Delivery Checklist

- [ ] REP.1 DB: `users` profile columns — `gender`, `cpf`, `rg`, `address_line`, `address_city`, `address_state`, `address_zip`, `emergency_contact_name`, `emergency_contact_phone`, all nullable with format CHECKs (CPF 11 digits, CEP 8 digits, UF 2 letters, gender set); no new tables, no CPF uniqueness (decisions recorded)
- [ ] REP.2 DB: dev seeds — fixture aluno with a full profile (CPF/RG set → locked state demoable) + attendance/event/graduation/order spread so all five reports and both ranking segments are non-empty with a distinct top 3
- [ ] REP.3 Backend: `reports` module — five report read models (`financeiro`, `frequencia`, `inadimplencia`, `graduacoes`, `loja`) as `GET /admin/reports/:report` JSON with month/semester windows in the tenant timezone, financeiro running the charge-materialization pass, honest denominators, reversed-award and canceled-order exclusions; admin-only
- [ ] REP.4 Backend: `GET /admin/reports/:report/csv` — streamed CSV from the same read models, UTF-8 BOM + semicolon + pt-BR money, Content-Disposition `<slug>-<YYYY-MM>.csv`
- [ ] REP.5 Backend: `GET /rankings?by=lessons|events` — academy-wide active students, month (lessons) / semester (events) windows, count-desc + name-asc ties, top 10 + `me` position for out-of-list students (null for professors); student + professor roles; visible regardless of the streak toggle (decision recorded)
- [ ] REP.6 Backend: `GET/PUT /aluno/profile` — profile read with `cpfLocked`/`rgLocked` and read-only email/birthDate (student row as birth-date authority), PUT with per-field validation, CPF checksum + digit normalization, CPF/RG write-once 422, name sync onto the linked student row in-transaction
- [ ] REP.7 Backend: graduation timeline `certificateAvailable` real — true exactly on belt-promotion entries, false on degree/initial entries; no new endpoint (certificate renders client-side from timeline + session)
- [ ] REP.8 Backend: e2e suite green — report math + windowing + CSV shape, rankings math (ties, você, exclusions), profile lock/validation/sync, certificate flag, full RBAC matrix + read-only semantics + CI route assertions
- [ ] REP.9 Web: `/admin/relatorios` per admin-18 — Relatórios header entry on the Visão financeira, month picker, five rows with exact subtitles, CSV as authenticated blob download, PDF as print-friendly view in a new tab (real PDF lib recorded debt)
- [ ] REP.10 RN: aluno Dados pessoais per aluno-18 — sections, locked CPF/RG boxes, read-only email/birthDate, Cidade / UF + CEP row, Trocar foto placeholder, Salvar round trip
- [ ] REP.11 RN: rankings — aluno home "Ranking do mês" card with live position + full screen per aluno-06/07, professor dashboard real "Ranking de presença" section + full screen per professor-05/06 (segments, bars, você highlight, selos footnote)
- [ ] REP.12 RN: certificado — belt-promotion "Ver certificado" unlocked, branded certificate view (BeltBar, name, belt, date, professor line), OS share/print action
- [ ] REP.13 Android: aluno Dados pessoais (REP.10 scope)
- [ ] REP.14 Android: rankings — aluno + professor (REP.11 scope)
- [ ] REP.15 Android: certificado (REP.12 scope)
- [ ] REP.16 iOS: aluno Dados pessoais (REP.10 scope)
- [ ] REP.17 iOS: rankings — aluno + professor (REP.11 scope)
- [ ] REP.18 iOS: certificado (REP.12 scope)
