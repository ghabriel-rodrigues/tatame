# 005 — Graduation (Phase 5)

Status: ready-for-agent
Personas covered: Aluno, Professor, Admin da academia, Responsável

## Problem Statement

The academy now counts every lesson but cannot answer the question the whole product is named after: what belt is this student, and how close is the next one? After Phase 4, the aluno's home graduation card shows a true lesson count against a placeholder target and links nowhere; the Graduação screen — belt hero, progress bar, evolution timeline — does not exist. The professor opens a student and has no "Adicionar grau" or "Promover faixa", no belt bar, no observações; their own profile is missing the "Graduações válidas" card. The admin has no Regras de graduação screen, so "aulas por grau" is configurable nowhere and kids belts cannot be toggled. And everywhere students are listed — admin registry rows, professor rosters, responsável dependent cards — the belt chips explicitly deferred in Phases 3 and 4 are still absent, as are the turma belt-range columns (`min_belt_id`/`max_belt_id`) Phase 3 promised this slice would add.

Underneath the UI, a charter non-negotiable is still unrealized: graduation history must be immutable — who promoted, when — and the append-only + compensation-row mechanics already resolved for this domain have no tables to protect. The data-driven model (other belt-based arts later, zero schema rewrites) also only becomes real when the shared belt catalogs land as rows, not prose.

## Solution

The graduation slice implements the domain already designed across the resolved database and design-system tickets: shared catalogs `martial_arts` → `belt_ladders` → `belts` (seeded with the BJJ adult and kids ladders — new arts are future rows, zero DDL), tenant `graduation_rules` (lessons-per-degree per belt, kids-belt toggles), and tenant `student_graduations` — append-only award rows (`degree` / `belt`) corrected only by admin-issued `revocation` compensation rows, every mutation audited.

A student's current belt is **derived**, never cached: the latest non-reversed award row, defaulting to white with zero degrees when no row exists. That derivation is folded into every surface that lists students — registry rows, rosters, dependent cards, home — so the deferred belt chips light up across the product at once. Progress is the Phase-4 lesson-counting pattern re-aimed: active attendances since the last award, measured against the academy's `lessons_per_degree` for the current belt ("26 de 40 aulas · Próximo 3º grau").

The aluno gets the Graduação screen: the purple hero card with the drawn belt and its degrees, the progress bar to the next degree, and the "Histórico de evolução" timeline — belt/degree, date, professor, observação, and a render-only "Ver certificado" placeholder on belt promotions. The professor gets the perfil do aluno: belt bar with degrees, progress line, "Adicionar grau" and "Promover faixa" (gated by the admin's "atualizar graduações" permission toggle), the stat tiles fed by Phase-4 data, and persistent observações; their own profile gains the "Graduações válidas" card and their belt chip. The admin gets the Regras de graduação screen — one row per belt in the handoff ladder order, a stepper for aulas por grau (default 40, ±5, min 10), toggles on the kids belts — plus the audited revocation path for wrong promotions.

Rendering is one component: `BeltBar`, drawn with primitives per the resolved belt-tokenization anatomy (bar, ponteira, white degree stripes, hairline outline, red tip for black-belt dans), keyed by data — components never switch on belt names. The belt color tokens already ship on all four platforms; the component itself lands on all four in this slice.

## User Stories

### Aluno — Graduação screen

1. As an aluno, I want a Graduação screen with a hero card showing my current belt drawn with its degrees ("FAIXA ATUAL · Azul · 2 graus"), so that my rank is the first thing I see.
2. As an aluno, I want the hero's progress bar toward my next degree ("Próximo 3º grau · 26 de 40 aulas") computed from my academy's rules, so that the target is my academy's truth, not a hardcoded number.
3. As an aluno at my belt's maximum degrees, I want the progress bar to point at the next belt ("Próxima faixa"), so that the bar never dead-ends.
4. As an aluno, I want a "Histórico de evolução" timeline listing every graduation — belt or degree, date, awarding professor, and their observação — so that my whole journey is visible.
5. As an aluno, I want belt promotions in the timeline to show a "Ver certificado" action, so that the certificate has a home even while generation is pending (placeholder in this phase).
6. As an aluno, I want my home graduation card fed by the real target and linking to the Graduação screen, so that the Phase-4 placeholder is finally real.
7. As an aluno, I want my home "graus na faixa" stat and my profile's belt display real, so that my rank is consistent everywhere.
8. As an aluno whose graduation was revoked, I want my belt and progress to reflect the restored previous state, so that corrections are honest.

### Professor — perfil do aluno & awards

9. As a professor, I want to open a student's profile and see their belt bar with degrees, belt name, and progress ("38 de 40 aulas para o 3º grau"), so that I can judge readiness at a glance.
10. As a professor, I want an "Adicionar grau" action that records one more degree on the current belt, so that awarding a stripe takes two taps.
11. As a professor, I want a "Promover faixa" action that promotes to the next valid belt (degrees reset to zero), so that belt promotions are equally simple.
12. As a professor, I want both actions to record me and the timestamp immutably, so that "who promoted, when" is always answerable.
13. As a professor, I want to attach an observação to an award ("Exame de faixa — aprovado com distinção."), so that the timeline carries context, not just dates.
14. As a professor, I want "Adicionar grau" blocked at the belt's maximum degrees and disabled kids belts excluded from promotion targets, so that I cannot produce an invalid rank.
15. As a professor in an academy that turned off my "atualizar graduações" permission, I want both actions rejected server-side and hidden client-side, so that the admin's toggle is enforced.
16. As a professor, I want the profile's stat tiles (frequência %, aulas no mês) fed by the Phase-4 attendance stats, so that graduation decisions sit next to real presence data.
17. As a professor, I want to see any student of my academy's profile (not only my rosters), so that grading day works across turmas.

### Professor — observações persistentes

18. As a professor, I want a persistent Observações section on the student profile — a note input plus the note history with author and date — so that coaching notes outlive any single graduation.
19. As a professor, I want my notes visible to other professors and the admin (never to the aluno), so that the coaching staff shares one memory.

### Professor — own profile

20. As a professor, I want my profile to show my own belt chip ("Faixa preta · 2º dan"), so that my rank is presented like everywhere else in the product.
21. As a professor, I want a "Graduações válidas" card on my profile showing the academy's belt ladder as chips — kids belts reflecting the admin's toggles — so that the whole staff shares the admin-defined régua.

### Admin — Regras de graduação

22. As an academy admin, I want a Regras de graduação screen listing every belt in ladder order with its swatch, "máx. 4 graus" note, and an aulas-por-grau stepper, so that the régua is configured in one place.
23. As an academy admin, I want the stepper to default to 40, step by 5, and refuse values below 10, so that configuration stays sane.
24. As an academy admin, I want toggles on the kids belts (Cinza, Amarela, Laranja, Verde) to enable or disable each for my academy, so that academies without kids programs keep a clean ladder.
25. As an academy admin, I want non-kids belts to have no toggle, so that the core ladder cannot be broken.
26. As an academy admin, I want Salvar to persist all rows at once, so that tuning the régua is one gesture.
27. As an academy admin, I want changed rules to immediately re-aim every progress bar in the academy, so that configuration is live, not advisory.

### Admin — awards, corrections & registry

28. As an academy admin, I want the same add-degree / promote-belt ability as professors (no toggle gating me), so that the academy owner can always graduate.
29. As an academy admin, I want a student's full graduation history with a "Revogar" action on any award, so that a wrong promotion is correctable.
30. As an academy admin, I want revocation to append a compensation row — never edit or delete — restoring the previous belt/degree, so that history stays immutable even through corrections.
31. As an academy admin, I want each award revocable at most once and every revocation audited with who and why, so that corrections are themselves accountable.
32. As an academy admin, I want an optional initial-belt field when registering a student, so that a transfer student starts at their real belt (left empty, they start white).
33. As an academy admin, I want belt chips on registry student rows, and min/max belt fields on the turma form rendering as "Branca a Azul" chips on class cards, so that the Phase-3 deferrals are closed.

### Responsável

34. As a responsável, I want each dependent card to show my child's drawn belt with degrees, so that their evolution is visible from the panel.

### Integrity & cross-cutting

35. As any academy member, I want belt catalogs readable by every tenant but writable by no academy, so that the ladder is shared truth.
36. As the platform, I want `student_graduations` append-only at the database level — no update or delete possible by the app role, no exceptions — so that belt history cannot be falsified even by buggy code.
37. As the platform, I want every award and revocation written to the audit log in the same transaction, so that sensitive graduation actions are traceable (impersonated ones carrying the impersonator).
38. As the platform, I want rules, graduations, and notes scoped to the academy by RLS, so that rank data never crosses tenants.
39. As an academy admin of a read-only (delinquent) academy, I want award, rule, and note writes blocked like every other mutation, so that Phase-2 status rules govern this surface too.

## Implementation Decisions

### Resolving the open data-driven graduation ticket (BOSS, inline)

The database wayfinder's graduation ticket (derived vs cached, kids-toggle home, initial belt) is resolved here as BOSS, per charter:

- **Current belt is derived, never cached**: the latest `student_graduations` award row (`kind` in degree/belt) that is not reversed by a `revocation` row, ordered by `awarded_at` then id. No row ⇒ presentation default of white belt, zero degrees — no synthetic row is written. No cached column on `students`; volumes are small and the query is a per-student window over an indexed table (same derive-on-read doctrine as Phase-4 stats).
- **Seeded initial belt at student creation is optional**: the admin student form gains an optional initial-belt select; when set, creation inserts one `kind='belt'` row (awarded_by = the creating admin, notes defaulted to "Início da jornada"). Invite signup and cadastrar filho seed nothing — those students start white.
- **Kids-belt toggles live in `graduation_rules`**: one row per (tenant, belt) with `enabled` — no separate academy-settings home. Per-academy ladder overrides beyond enable/disable and lessons-per-degree do NOT exist in v1: the ladder itself (order, colors, max degrees) is shared catalog data.

### Schema (implements the resolved entity model + belt-tokenization contracts)

- **Shared catalogs** (no `tenant_id`, per the entity model's class 3): `martial_arts` (key/name; `bjj` seeded), `belt_ladders` (martial_art FK, key `adult`/`kids`, name), `belts` (ladder FK, `position`, pt-BR `name`, `color_tokens` jsonb holding design-token slugs — `colorSlug`/`tipColorSlug`, never hex — and `max_degrees`; `UNIQUE (ladder_id, position)`). RLS forced with SELECT `USING (true)` for the app role; writes only via migrations/platform pool — catalog mutation from a tenant is impossible by construction.
- **Seeds** (production data shipped with migrations): adult ladder Branca → Azul → Roxa → Marrom → Preta (max 6 dans, red tip) → Vermelha (no degree stripes in v1); kids ladder Cinza → Amarela → Laranja → Verde (max 4 degrees each; colored belts max 4). Display order across ladders is a documented server-side merge — the kids ladder splices between Branca and Azul — reproducing the handoff's régua exactly (Branca, Cinza, Amarela, Laranja, Verde, Azul, Roxa, Marrom, Preta, Vermelha).
- **`graduation_rules`** (tenant-scoped, forced RLS): `belt_id` FK→belts, `lessons_per_degree` int NOT NULL DEFAULT 40 (CHECK ≥ 10), `enabled` boolean NOT NULL DEFAULT true; `UNIQUE (tenant_id, belt_id)`. Rows are lazily upserted on save; reads merge the catalog with overrides so an untouched academy sees the defaults. `enabled=false` is accepted only for kids-ladder belts (service-enforced); a disabled belt disappears from promotion targets and renders dimmed in régua/válidas displays.
- **`student_graduations`** (tenant-scoped, **append-only**), full shape per the resolved entity-model + audit decisions: `student_id` composite tenant FK, `belt_id` FK→belts, `degree` smallint NOT NULL (0 on belt promotions), `kind` pgEnum degree/belt/revocation, `reverses_graduation_id` self-FK nullable (CHECK: NOT NULL iff kind='revocation'; partial unique so an award is reversed at most once; composite tenant FK so a revocation can never target a foreign row), `awarded_by_user_id` FK→users NOT NULL, `awarded_at` timestamptz NOT NULL, `notes` text.
- **Append-only enforcement, verbatim from the resolved audit decision**: app role gets SELECT + INSERT only (platform role reads only); RLS policies are SELECT + INSERT only; the shared `forbid_mutation()` trigger attaches **unconditionally** — unlike attendances, there is no sanctioned UPDATE window of any kind. The table joins the append-only registry meta-test.
- **`student_notes`** (tenant-scoped, forced RLS — new table, recorded delta): `student_id` composite tenant FK, `author_user_id` FK→users NOT NULL, `body` text NOT NULL, timestamps. Plain table (not append-only — coaching notes are not charter history); v1 surfaces create + list only, newest first.
- **Phase-3 deferrals closed**: `classes` gains nullable `min_belt_id`/`max_belt_id` FK→belts (plain catalog FKs — belts are global). `memberships` gains nullable `belt_id` FK→belts + `belt_degree` smallint — display-only professor rank (recorded delta; professors have no graduation history in v1), edited on the admin professor form.

### Award & revocation semantics (one write path)

- One award service used by professor and admin endpoints. **Add degree**: new row `kind='degree'`, same belt, `degree = current + 1`; rejected when current degree = the belt's `max_degrees`. **Promote belt**: new row `kind='belt'`, `degree = 0`, explicit target `belt_id` — the client defaults to the next belt in the merged enabled order, the server accepts any _enabled, non-current_ catalog belt (transfers and skips are legitimate; revocation is the correction path). Optional `notes` on both.
- Authorization: professor requires the **`graduations.update`** permission key (professor role, default allowed) — the handoff's "atualizar graduações" toggle riding the existing data-driven permission machinery; admin is role-fixed, never toggleable. Professors may graduate any active student of the academy, not only their rosters (grading day reality; the award row records exactly who did it).
- **Revocation is admin-only, no time window** (charter: no edits, ever): insert `kind='revocation'` + `reverses_graduation_id`, optional reason in `notes`. Current belt derivation excludes reversed awards, so revoking the latest award restores the previous state; a follow-up correct award is just a new INSERT. The partial unique makes double-revocation impossible.
- **Audit, in-transaction via the existing seam**: `graduation.awarded` (belt_id, degree, kind) on every award and `graduation.revoked` (reverses_graduation_id, reason) on every revocation — no exceptions; impersonated mutations carry the impersonator via the existing interceptor. Note creation is not audited (not charter history).

### Progress & belt exposure (reuses the Phase-4 derivation doctrine)

- **Progress to next step** = count of active attendances (`revoked_at IS NULL`) with `checked_in_at` after the latest non-reversed award's `awarded_at` (lifetime count when no award exists), against the academy's `lessons_per_degree` for the **current** belt. Label: "Próximo Nº grau" below max degrees, "Próxima faixa" at max. Derived on read, tenant timezone, no caching, no jobs — the Phase-4 lesson-counting pattern with a new anchor. This supersedes Phase 4's lifetime-count placeholder on the home card (recorded semantic change).
- **Belt exposure everywhere students are listed**: a shared `currentBelt` payload — belt slug, pt-BR name, `colorSlug`/`tipColorSlug`, `maxDegrees`, current `degrees` — is folded into the existing responses for admin registry rows, professor students list and rosters/roll-call, responsável dependents, aluno home/profile, and the professor student profile. The Phases 3–4 belt-chip deferrals all close through this one payload; clients render it with `BeltBar`/chips and never re-derive.

### BeltBar (design-system contract made real on all four platforms)

- The resolved belt-tokenization ticket shipped the `color.belt.*` tokens to all four platforms but the component does not exist anywhere yet — this slice lands it: web React + RN in the design-system package, Compose and SwiftUI in the native apps' design-system modules, all drawn with primitives (never images) per the resolved anatomy: rounded bar filled by `colorSlug`, inset `belt.outline` hairline (what keeps Branca visible — no platform "fixes" it with gray), ponteira ~22% width in `tipColorSlug ?? belt.tip`, white degree stripes on the ponteira, sizes sm/md/lg. Black belt renders the red tip with white dan stripes; red belt renders no stripes; unknown `colorSlug` falls back to gray with a logged warning.
- Components consume the `BeltDef`-shaped `currentBelt` payload — keyed by data, zero hardcoded ladders — so future arts are catalog rows with no component changes. `BrandLogo`'s existing drawing routine is the anatomy's prior art on every platform.

### Module boundaries, surfaces, authorization

- Everything lands in a new `graduation` module (catalogs, rules, graduations, notes, derivation services), consuming attendance's exported lesson-count query; enrollment's student list/roster responses call graduation's exported belt-derivation service. Persona-scoped controllers under the existing guard chain: default-deny roles, academy-status guard (read-only blocks awards, rules, notes), RLS backstop; foreign student/graduation ids are 404, never 403.
- Endpoint surface (versioned prefix, generated into the OpenAPI spec):

| Endpoint                                                      | Role               | Purpose                                                                                         |
| ------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------- |
| `GET /aluno/graduation`                                       | student            | hero (currentBelt), progress, evolution timeline (certificate placeholder flag on belt entries) |
| `GET /professor/students/:id/profile`                         | professor          | currentBelt + progress + attendance tiles + notes (mensalidade tile stays placeholder)          |
| `POST /professor/students/:id/graduations`                    | professor (toggle) | add degree / promote belt                                                                       |
| `GET/POST /professor/students/:id/notes`                      | professor          | observações list / create                                                                       |
| `GET /professor/profile`                                      | professor          | own belt chip + graduações válidas (merged enabled ladder)                                      |
| `GET /admin/graduation-rules` · `PUT /admin/graduation-rules` | admin              | merged ladder with rules / bulk upsert                                                          |
| `GET /admin/students/:id/graduations`                         | admin              | full history including revocations                                                              |
| `POST /admin/students/:id/graduations`                        | admin              | award (no toggle)                                                                               |
| `POST /admin/graduations/:id/revoke`                          | admin              | compensation-row revocation                                                                     |

- Existing endpoints extended, not duplicated: `GET /aluno/home` (real progress target, graus na faixa), `GET /professor/students`, rosters, `GET /responsavel/dependents`, admin registry lists (currentBelt payload); admin turma create/update accepts `minBeltId`/`maxBeltId`; admin student create accepts `initialBeltId`; admin professor form accepts belt display fields.
- New stable problem+json codes: degree at maximum, belt disabled/invalid target, graduation already reversed, lessons-per-degree below minimum, cannot disable non-kids belt; permission-disabled reused from Phase 2.

### Client scope split

- **Web (admin console)**: Regras de graduação screen (merged ladder rows: swatch, "máx. N graus · X aulas por grau" note, ±5 stepper min 10, kids toggles, Salvar bulk upsert); registry student-row belt chips + optional initial-belt select on the student form; turma form belt-range selects + "Branca a Azul" chips on class cards; student graduation-history drawer with the audited Revogar action. The professor experience stays mobile-first — no web surface.
- **Mobile (RN, Android, iOS)** carries the full experience: aluno Graduação screen (hero, progress, timeline, certificado placeholder) + real home card + profile belt; professor perfil do aluno (BeltBar, progress line, Adicionar grau / Promover faixa with confirmation and toggle-gating, observações) + own profile (belt chip, Graduações válidas card); responsável dependent-card belts. Each platform's BeltBar is a tracked parity task.

## Testing Decisions

- Same doctrine as specs 001–004 (their suites are the prior art): tests exercise external behavior through the API against a real Postgres with RLS active; assertions on status codes, stable error codes, and observable state — never on derivation SQL or trigger internals.
- Immutability: as the app role, UPDATE and DELETE on `student_graduations` fail — grant, policy, and trigger verified independently (no revoke-window exception exists here, unlike attendances); the append-only registry meta-test covers the table; catalog tables reject tenant-role writes.
- Award/revocation e2e: degree past max rejected; promotion resets degrees; disabled kids belt rejected as target and hidden from válidas; permission toggle off → professor rejected, admin unaffected; revocation restores the previous belt/degree in every derived read; second revocation of the same award rejected; cross-tenant graduation/student ids → 404; audit rows asserted in-transaction for award and revoke; read-only academy blocks all writes.
- Derivation fixtures: no rows → white/0; degree chains; belt promotion resets progress anchor; revocation retroactively recomputes belt and progress; progress counts only active attendances after the last award; rule change re-aims targets; "Próxima faixa" at max degrees.
- Rules e2e: defaults returned untouched; upsert persists only changed rows; below-minimum lessons rejected; disabling a non-kids belt rejected.
- RBAC + RLS: aluno hitting professor/admin routes → 403; cross-tenant invisibility for the three tenant tables extends the fail-closed meta-test; catalogs readable from any tenant context.
- Web: component tests for the régua screen state machine (stepper bounds, kids-only toggles, dirty-save), belt chips, and the revoke drawer — mocking the HTTP layer per the established pattern.
- Mobile: pure-logic tests for BeltBar rendering rules (stripe count, black-dan red tip, red-belt no stripes, gray fallback) and the award-action gating; one integration test per client for the add-degree round trip and the timeline rendering.

## Out of Scope

- Certificate generation — "Ver certificado" is a render-only placeholder on all clients; PDF generation and download are a recorded debt for a later slice.
- Notifications (graduation congratulations, "aluno próximo da graduação" alerts) — the notification pipeline is its own slice.
- Ranking screens and the professor-dashboard "alunos próximos da graduação" section — stays an explicit placeholder owned by the ranking/reports slice.
- Non-BJJ martial arts UI — the schema and seeds are data-driven by construction, but no art-picker or judo/karate surface ships; likewise IBJJF split-color kids belts (`secondaryColorSlug` stays forward-compat, not built).
- Per-academy custom ladders (reordering, custom belts, custom max degrees) — only lessons-per-degree and kids toggles are configurable in v1.
- Cached current-belt columns, materialized views, or background recomputation — derivation on read only.
- Professor graduation history (own rank is display-only membership data); coral belts and 7th-dan-plus rendering (future catalog rows + token release).
- Note editing/deletion and aluno-visible notes — create + staff-visible list only in v1.

## Further Notes

- This spec implements two resolved decisions verbatim — the entity-model shapes for the belt catalogs/`graduation_rules`/`student_graduations`, and the append-only + compensation-row + audit mechanics (admin-only revocation, no window) — and resolves the previously open data-driven-graduation ticket inline (derived current belt, optional seeded initial belt, kids toggles homed in `graduation_rules`); the `.scratch` ticket should be marked resolved pointing here.
- Recorded deltas against the entity model: `graduation_rules.enabled` added (kids-toggle home), `student_notes` as a new table (handoff "observações persistentes"), `memberships.belt_id`/`belt_degree` for professor rank display, and the kids ladder seeded without a white row (Branca lives in the adult ladder; the merged display order is a documented server-side rule).
- UI truth: aluno-09 (hero card, progress, timeline with observação and certificado), professor-11 (belt bar, award buttons, tiles, observações), professor-12 (belt chip + Graduações válidas card), admin-16 (régua rows, steppers, kids toggles — Laranja shown disabled) — recreated pixel-faithful with Lumira tokens; belts render exclusively through `BeltBar`/belt tokens, any hex literal is a review reject.
- PT-BR labels (Faixa atual, Próximo 3º grau, Histórico de evolução, Adicionar grau, Promover faixa, Graduações válidas, Regras de graduação) are client copy; schema, enums, permission keys, and audit actions stay English per charter.
- The professor-11 "Paga mensalidade" tile stays a placeholder owned by the billing slice — recorded, not silently dropped.
- Delivery follows the fixed order DB → backend → web → mobiles; the checklist below is mirrored into the root README, and checking a box there is the only "ticket closing" this project has.

## Delivery Checklist

- [ ] GRD.1 DB: shared catalogs martial_arts, belt_ladders, belts (position, color_tokens slugs, max_degrees) — public-SELECT RLS, platform-only writes, BJJ adult+kids production seeds in handoff ladder order
- [ ] GRD.2 DB: graduation_rules — lessons_per_degree (default 40, CHECK ≥ 10) + enabled kids toggle, UNIQUE (tenant_id, belt_id), forced tenant RLS
- [ ] GRD.3 DB: student_graduations — kind degree/belt/revocation, reverses_graduation_id (CHECK + single-reversal partial unique, composite tenant self-FK), awarded_by/awarded_at/notes; append-only layers (SELECT+INSERT only, unconditional forbid_mutation) extending the registry meta-test
- [ ] GRD.4 DB: student_notes table (tenant RLS) + nullable classes.min_belt_id/max_belt_id + memberships.belt_id/belt_degree display columns
- [ ] GRD.5 DB: dev seeds — graduation histories per fixture academy (degree/belt/revocation rows), rule overrides, notes, written through the tenant-scoped path
- [ ] GRD.6 Backend: graduation module — current-belt derivation (latest non-reversed award, white default) exported and folded into registry rows, professor students/rosters, dependents, aluno home/profile responses
- [ ] GRD.7 Backend: progress engine (active lessons since last award vs academy rule, Próximo grau / Próxima faixa) + GET /v1/aluno/graduation (hero, progress, timeline with certificate placeholder) + home card real target
- [ ] GRD.8 Backend: awards — add degree (≤ max_degrees) / promote belt (enabled targets only, degrees reset), professor gated by graduations.update toggle, admin ungated, optional initial belt at student creation, graduation.awarded audit in-transaction
- [ ] GRD.9 Backend: admin — graduation-rules GET/PUT (defaults merged, ≥ 10, kids-only toggles), per-student history, revoke endpoint (compensation row, single reversal, graduation.revoked audit)
- [ ] GRD.10 Backend: student notes create/list + GET /v1/professor/students/:id/profile (belt, progress, attendance tiles, notes) + GET /v1/professor/profile (own belt chip, graduações válidas)
- [ ] GRD.11 Backend: e2e suite green — append-only layers, revocation semantics, award validations + permission toggle, rules validation, derivation/progress fixtures, belt exposure in list responses, read-only block, RBAC + RLS + catalog write-protection
- [ ] GRD.12 Web: BeltBar in the design system per the resolved anatomy (sizes, ponteira, degree stripes, outline, black-dan red tip, gray fallback) + belt chip variant
- [ ] GRD.13 Web: admin Regras de graduação screen — merged ladder rows with swatch and máx-graus note, ±5 stepper (default 40, min 10), kids toggles, Salvar bulk upsert
- [ ] GRD.14 Web: belt chips on registry student rows + initial-belt select on student form + turma belt-range fields with "Branca a Azul" card chips + student graduation-history drawer with audited Revogar
- [ ] GRD.15 RN: BeltBar native component in the design system (same anatomy and fallback rules)
- [ ] GRD.16 RN: aluno Graduação screen (hero card, progress bar, evolution timeline, Ver certificado placeholder) + real home graduation card + profile belt
- [ ] GRD.17 RN: professor perfil do aluno (BeltBar, progress, Adicionar grau / Promover faixa gated by toggle, observações) + professor profile graduações válidas + responsável dependent-card belts
- [ ] GRD.18 Android: BeltBar Compose component (same anatomy and fallback rules)
- [ ] GRD.19 Android: aluno Graduação screen + real home graduation card + profile belt
- [ ] GRD.20 Android: professor perfil do aluno + professor profile graduações válidas + responsável dependent-card belts
- [ ] GRD.21 iOS: BeltBar SwiftUI component (same anatomy and fallback rules)
- [ ] GRD.22 iOS: aluno Graduação screen + real home graduation card + profile belt
- [ ] GRD.23 iOS: professor perfil do aluno + professor profile graduações válidas + responsável dependent-card belts
