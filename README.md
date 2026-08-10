# Tatame

Mobile-first SaaS for managing jiu-jitsu academies — students, teachers, guardians, academy admins, and the platform owner, each with their own app surface. Built from the high-fidelity design handoff at `/Users/gupy/Desktop/design_handoff_jiujitsu_app/` (Lumira design system).

Governance: **AGENTE BOSS** (`agents/boss.md`) keeps implementation aligned with business goals. Planning lives in `.scratch/` (wayfinder maps); specs live in `docs/specs/`; **this README's checklist is the single source of delivery truth** — a box is checked only when the item is implemented and verified.

## Stack

| Part | Tech |
|---|---|
| Monorepo | nx + pnpm + docker |
| Backend | NestJS + TypeScript |
| Database | Postgres 16 (docker-compose) |
| Web | React + TanStack Query + MUI (no Next) |
| Design system | `packages/design-system` — Lumira tokens, themes MUI + RN + web |
| Mobile | Expo/React Native (TS) · Kotlin (Android) · Swift (iOS) |
| Services | Stripe (payments) · Resend (email) · Netlify (web deploy) |

## Getting started

```sh
cp .env.example .env
docker compose up -d
pnpm install
```

## Delivery policy

Per feature: **DB schema → backend → web → mobiles (RN → Kotlin → Swift)**. Auth ships first — it unblocks login screens for every persona.

## Master checklist

> Generated from wayfinder planning + specs (see `docs/specs/`). Item numbering is stable; do not renumber. Mark `[x]` only with working, tested code.

### Phase 0 — Foundation
- [x] 0.1 Nx + pnpm monorepo scaffold
- [x] 0.2 Postgres via docker-compose + `.env.example` (Stripe/Resend/Netlify placeholders)
- [x] 0.3 AGENTE BOSS charter + project governance (CLAUDE.md, agents/boss.md)
- [x] 0.4 Wayfinder maps charted per subsystem (`.scratch/`)
- [x] 0.5 Specs written: [001-auth](docs/specs/001-auth.md), [002-design-system](docs/specs/002-design-system.md)
- [x] 0.6 Apps and packages generated: `api`, `api-e2e`, `web`, `@tatame/shared`, `@tatame/design-system`, `@tatame/db`

### Phase 1 — Design system foundation ([spec 002](docs/specs/002-design-system.md))

> Runs in parallel with Phase 2's DB/backend slices; DS.1–DS.7 gate the web and RN login screens.

- [x] DS.1 Scaffold `packages/design-system` exports map (`.`, `./native`, `./tokens`, `./tokens/native`) + peerDependencies; web and RN resolve their entry points
- [x] DS.2 Convert Lumira `colors_and_type.css` into DTCG `tokens.json` (light + dark, ink tokens, `color.belt.*`); freeze CSS as reference
- [x] DS.3 style-dictionary v4 `design-system:tokens` target emitting 4 outputs: `tokens.css` + TS (web), RN TS module, `LumiraTokens.kt`, `LumiraTokens.swift`
- [x] DS.4 `palette-recipe.json` + canonical TS `derivePalette()` + `applyBrand()` + 4 presets + `palette-fixtures.json` golden tests passing
- [x] DS.5 `createTatameTheme()` (MUI v6, cssVariables, palette/typography/shape/shadows, component overrides, glass mixins) integrated into web shell
- [x] DS.6 Six P0 components web (TatameButton, FormField, Card, Toast, BrandLogo, ScreenHeader) reviewed against handoff screenshots
- [x] DS.7 Six P0 components RN under `./native` (+ ThemeProvider, Text primitive, fonts, motion presets) reviewed against handoff screenshots
- [x] DS.8 Kotlin token export (`LumiraTokens.kt` + `DerivePalette.kt`) committed in Android project, golden tests passing
- [x] DS.9 Swift token export (`LumiraTokens.swift` + `DerivePalette.swift`) committed in iOS project, golden tests passing

### Phase 2 — Auth &amp; authorization ([spec 001](docs/specs/001-auth.md))

- [x] AUTH.1 DB: Drizzle schema for auth-critical tables (users, credentials, sessions, refresh_tokens, password_reset_tokens, memberships, role_permissions, invites, academies, platform_users, platform_plans, academy_subscriptions) — UUIDv7 PKs, composite tenant FKs, enums
- [x] AUTH.2 DB: forced RLS everywhere — tenant policies, self policies, narrow platform reads, fail-closed defaults
- [x] AUTH.3 DB: SECURITY DEFINER functions for pre-auth seams (login-by-email, refresh rotation, password reset, invite landing/accept)
- [x] AUTH.4 DB: migrations apply cleanly to fresh database + RLS fail-closed meta-test
- [x] AUTH.5 DB: seeds — platform plan catalog + dev fixtures (2 academies, all 6 personas) via tenant-scoped path
- [x] AUTH.6 Backend: identity module — login (membership resolution + TOTP challenge), refresh rotation + family-reuse revocation, switch, logout, logout-all, me
- [x] AUTH.7 Backend: password reset via Resend (single-use 1h token, 202-always, revoke-all) + platform TOTP setup/enable
- [x] AUTH.8 Backend: public invite endpoints — landing payload + atomic accept transaction (minor-requires-guardian); existing email → 409 + authenticated accept
- [x] AUTH.9 Backend: global guard chain (JWT+CLS, academy status + bypass decorator, default-deny roles, permissions) + permission-toggle endpoints + `POST /v1/invites`
- [x] AUTH.10 Backend: impersonation (owner/support, audited mint, 1h session, actor claim) + audit interceptor + restrictions
- [x] AUTH.11 Backend: e2e suite green (39 e2e + 14 unit + 26 db) — RBAC matrix, refresh reuse, invite flows, reset single-use, suspension/read-only, impersonation audit, route-metadata meta-test; guardian-dependent 404 deferred to enrollment slice
- [x] AUTH.12 Web: login page pixel-perfect per handoff (Lumira tokens, forgot-password, invite notice)
- [x] AUTH.13 Web: session bootstrap — memory access token, httpOnly refresh cookie, silent refresh, single-flight 401, cache clear on auth loss
- [x] AUTH.14 Web: route guards + post-login redirects for /admin and /plataforma + download-the-app landing for mobile-only personas
- [x] AUTH.15 Web: admin and plataforma empty shells — membership switcher, logout, impersonation banner with end action
- [x] AUTH.16 Web: convite flow shell — public landing with inherited academy/class/plan, stepped signup, logged-in success
- [x] AUTH.17 RN: login screen (splash → login per handoff) with password recovery entry
- [x] AUTH.18 RN: secure session — expo-secure-store refresh, memory access, silent cold-start refresh, single-flight 401, logout
- [x] AUTH.19 RN: role-gated navigation — one binary, aluno/professor/responsável shells, web-console screen for admin/platform
- [x] AUTH.20 RN: three authenticated empty shells rendering session context + suspension/read-only states
- [x] AUTH.21 Android: login screen per handoff wired to generated API client
- [x] AUTH.22 Android: session — Keystore-encrypted TokenStore, memory access, single-flight Authenticator, logout + session-expired
- [x] AUTH.23 Android: role gate — shell by role, blocking screens for suspended/web-only
- [x] AUTH.24 iOS: login screen per handoff wired through generated client + auth middleware
- [x] AUTH.25 iOS: session — Keychain refresh (this-device-only), refresh-coordinator actor, logout + session-expired
- [x] AUTH.26 iOS: role gate — shell by role, blocking screens for suspended/web-only

### Phase 3 — Enrollment ([spec 003](docs/specs/003-enrollment.md))

- [x] ENR.1 DB: Drizzle schema for students, guardians, classes (+age range), class_schedules, enrollments — UUIDv7 PKs, composite tenant FKs, status enums, uniques per the entity model
- [x] ENR.2 DB: forced RLS with fail-closed tenant policies on all five new tables, extending the RLS meta-test
- [x] ENR.3 DB: migration hardening `invites.class_id` to a composite tenant FK onto classes, applying cleanly over Phase-2 data
- [x] ENR.4 DB: invite-accept SECURITY DEFINER seam extended to persist student/guardian + dependents + class enrollments atomically
- [x] ENR.5 DB: dev seeds — sample classes with schedules, enrollments, guardians with dependents per fixture academy, written through the tenant-scoped path
- [x] ENR.6 Backend: enrollment module registry CRUD — students/guardians create + list (segment filters, derived Ativo/Pendente), name-only edit, soft archive ending enrollments, minor-requires-guardian enforcement
- [x] ENR.7 Backend: professor registration — user reuse-or-create + professor membership + set-your-password email via the reset-token seam
- [x] ENR.8 Backend: classes — create recurring turma (weekday chips → schedule rows), list/detail with occupancy and Lotada, name-only edit, soft archive
- [x] ENR.9 Backend: enrollments — roster add/remove with row-locked capacity enforcement, reactivation upsert, archived-class rejection, atomic bulk move with all-or-nothing capacity check
- [x] ENR.10 Backend: professor surface — own-classes list/detail/roster endpoints with ownership filtering (foreign class → 404)
- [x] ENR.11 Backend: responsável surface — dependents list/detail (foreign id → 404), cadastrar filho behind the dependents.register toggle with auto guardian link, age-suggestion endpoint + auto-enrollment
- [x] ENR.12 Backend: e2e suite green — guardian 404 (001 debt closed), professor 404, capacity race, atomic move, invite dependents persisted, full-class invite fallback, toggle-off denial, archive semantics, RBAC + read-only + RLS coverage
- [x] ENR.13 Web: Cadastros screen per handoff — four segments, list rows with badges, FAB creation forms per type (minor⇒guardian validation)
- [x] ENR.14 Web: multi-select mode + Mover para turma sheet with destination picker, capacity feedback, and atomic result handling
- [x] ENR.15 Web: turma surfaces — nova turma recorrente form (chips, time+duration, professor, limit, optional age range) and turma detail with schedule, occupancy, attendance placeholder tiles, roster add/remove
- [x] ENR.16 Web: name-only edit and excluir (soft archive) flows with confirmation across all four segments
- [x] ENR.17 RN: professor Minhas turmas list + turma detail read views (schedules, occupancy, roster, placeholder tiles) per handoff
- [x] ENR.18 RN: professor Adicionar aluno picker + remove-from-roster action wired to the professor endpoints
- [x] ENR.19 RN: responsável dependents panel + child detail read views with class schedule
- [x] ENR.20 RN: responsável Cadastrar aluno sheet — name, birth date, age-suggested class chip, auto link + enrollment, toggle-off hidden state
- [x] ENR.21 Android: professor classes list + detail read views per handoff
- [x] ENR.22 Android: professor roster add/remove + responsável dependents panel read views
- [x] ENR.23 Android: responsável Cadastrar aluno sheet with age suggestion
- [x] ENR.24 iOS: professor classes list + detail read views per handoff
- [x] ENR.25 iOS: professor roster add/remove + responsável dependents panel read views
- [x] ENR.26 iOS: responsável Cadastrar aluno sheet with age suggestion

### Phase 4 — Attendance / check-in ([spec 004](docs/specs/004-attendance.md))

- [x] ATT.1 DB: Drizzle schema for class_sessions, checkin_codes (+qr_token, opened_by), attendances (+revoked cols) — UUIDv7 PKs, composite tenant FKs, method/status enums, session unique per class per day, partial unique active check-in
- [x] ATT.2 DB: forced RLS fail-closed tenant policies on all three tables (SELECT+INSERT only on attendances), extending the RLS meta-test
- [x] ATT.3 DB: append-only layer — no UPDATE/DELETE grants or policies on attendances, forbid_mutation trigger with the revoke-columns-only exception, append-only registry meta-test
- [x] ATT.4 DB: attendance_revoke SECURITY DEFINER seam — tenant-validated, professor same-day window, admin any-time, audit rows (attendance.revoked, attendance.recorded_manual) in-transaction
- [x] ATT.5 DB: dev seeds — materialized sessions with mixed-method attendances (some revoked) per fixture academy, written through the tenant-scoped path
- [x] ATT.6 Backend: attendance module — idempotent session materialization, open/close/reopen chamada with code+QR mint, TTL (slot end + 15 min grace), one active code per session
- [x] ATT.7 Backend: aluno check-in endpoint — qr/code/manual resolution to one validated INSERT, enrollment + today + window checks, duplicate → already-checked-in state, race-safe, fresh stats in response
- [x] ATT.8 Backend: professor manual roll call — roster with attendance states (self check-ins pre-toggled), per-row mark (manual, recorded_by) and same-day revoke endpoints
- [x] ATT.9 Backend: admin surface — any-time audited revoke endpoint and turma sessions list with attendance counts
- [x] ATT.10 Backend: realtime — stream-ticket mint (HMAC, ~60 s, single-purpose), SSE stream with checkin/revoke events + 20 s heartbeat via post-commit event bridge and per-room registry, snapshot/polling endpoint, OpenAPI-documented exception
- [x] ATT.11 Backend: derived stats — aluno home (presença % month, streak, graduation lesson count, gamification.streak toggle honored) and professor dashboard (alunos hoje, presença média, hero check-in count)
- [x] ATT.12 Backend: GET /v1/professor/students with non-enrolled-in-class filter (closes the Adicionar aluno picker debt)
- [x] ATT.13 Backend: e2e suite green — immutability layers, revoke windows, re-check-in after revoke, duplicate race, code expiry/close/reopen, foreign-tenant 404s, SSE ticket auth + event delivery, stats fixtures, gamification toggle, read-only block, RBAC + RLS coverage
- [x] ATT.14 Web: turma detail session list with per-session attendance counts replacing the Phase-3 placeholder tiles (empty state included)
- [x] ATT.15 RN: aluno check-in bottom sheet — 3-method segmented control (QR scan, 4-digit code, manual with location stub) wired to the check-in endpoint
- [x] ATT.16 RN: aluno success pop with streak line, already-registered state, hero flip to Presença registrada, live stat tiles + graduation progress bar on Início
- [x] ATT.17 RN: professor chamada ao vivo — code/QR/expiry screen with SSE counter+list (react-native-sse wrapper, snapshot-then-stream, 5 s polling fallback), encerrar/reopen
- [x] ATT.18 RN: professor manual chamada (immediate toggles, N presentes header, manual markers) + dashboard tiles + Adicionar aluno picker rewired to /professor/students
- [x] ATT.19 Android: aluno check-in sheet, success pop + streak, duplicate state, Início stat tiles per handoff
- [x] ATT.20 Android: professor chamada ao vivo with OkHttp SSE wrapper + polling fallback, encerrar/reopen
- [x] ATT.21 Android: professor manual chamada + dashboard tiles + Adicionar aluno picker rewired
- [x] ATT.22 iOS: aluno check-in sheet, success pop + streak, duplicate state, Início stat tiles per handoff
- [x] ATT.23 iOS: professor chamada ao vivo with URLSession SSE parser + polling fallback, encerrar/reopen
- [x] ATT.24 iOS: professor manual chamada + dashboard tiles + Adicionar aluno picker rewired

### Phase 5 — Graduation ([spec 005](docs/specs/005-graduation.md))

- [x] GRD.1 DB: shared catalogs martial_arts, belt_ladders, belts (position, color_tokens slugs, max_degrees) — public-SELECT RLS, platform-only writes, BJJ adult+kids production seeds in handoff ladder order
- [x] GRD.2 DB: graduation_rules — lessons_per_degree (default 40, CHECK ≥ 10) + enabled kids toggle, UNIQUE (tenant_id, belt_id), forced tenant RLS
- [x] GRD.3 DB: student_graduations — kind degree/belt/revocation, reverses_graduation_id (CHECK + single-reversal partial unique, composite tenant self-FK), awarded_by/awarded_at/notes; append-only layers (SELECT+INSERT only, unconditional forbid_mutation) extending the registry meta-test
- [x] GRD.4 DB: student_notes table (tenant RLS) + nullable classes.min_belt_id/max_belt_id + memberships.belt_id/belt_degree display columns
- [x] GRD.5 DB: dev seeds — graduation histories per fixture academy (degree/belt/revocation rows), rule overrides, notes, written through the tenant-scoped path
- [x] GRD.6 Backend: graduation module — current-belt derivation (latest non-reversed award, white default) exported and folded into registry rows, professor students/rosters, dependents, aluno home/profile responses
- [x] GRD.7 Backend: progress engine (active lessons since last award vs academy rule, Próximo grau / Próxima faixa) + GET /v1/aluno/graduation (hero, progress, timeline with certificate placeholder) + home card real target
- [x] GRD.8 Backend: awards — add degree (≤ max_degrees) / promote belt (enabled targets only, degrees reset), professor gated by graduations.update toggle, admin ungated, optional initial belt at student creation, graduation.awarded audit in-transaction
- [x] GRD.9 Backend: admin — graduation-rules GET/PUT (defaults merged, ≥ 10, kids-only toggles), per-student history, revoke endpoint (compensation row, single reversal, graduation.revoked audit)
- [x] GRD.10 Backend: student notes create/list + GET /v1/professor/students/:id/profile (belt, progress, attendance tiles, notes) + GET /v1/professor/profile (own belt chip, graduações válidas)
- [x] GRD.11 Backend: e2e suite green — append-only layers, revocation semantics, award validations + permission toggle, rules validation, derivation/progress fixtures, belt exposure in list responses, read-only block, RBAC + RLS + catalog write-protection
- [x] GRD.12 Web: BeltBar in the design system per the resolved anatomy (sizes, ponteira, degree stripes, outline, black-dan red tip, gray fallback) + belt chip variant
- [x] GRD.13 Web: admin Regras de graduação screen — merged ladder rows with swatch and máx-graus note, ±5 stepper (default 40, min 10), kids toggles, Salvar bulk upsert
- [x] GRD.14 Web: belt chips on registry student rows + initial-belt select on student form + turma belt-range fields with "Branca a Azul" card chips + student graduation-history drawer with audited Revogar
- [x] GRD.15 RN: BeltBar native component in the design system (same anatomy and fallback rules)
- [x] GRD.16 RN: aluno Graduação screen (hero card, progress bar, evolution timeline, Ver certificado placeholder) + real home graduation card + profile belt
- [x] GRD.17 RN: professor perfil do aluno (BeltBar, progress, Adicionar grau / Promover faixa gated by toggle, observações) + professor profile graduações válidas + responsável dependent-card belts
- [x] GRD.18 Android: BeltBar Compose component (same anatomy and fallback rules)
- [x] GRD.19 Android: aluno Graduação screen + real home graduation card + profile belt
- [x] GRD.20 Android: professor perfil do aluno + professor profile graduações válidas + responsável dependent-card belts
- [x] GRD.21 iOS: BeltBar SwiftUI component (same anatomy and fallback rules)
- [x] GRD.22 iOS: aluno Graduação screen + real home graduation card + profile belt
- [x] GRD.23 iOS: professor perfil do aluno + professor profile graduações válidas + responsável dependent-card belts

### Phase 6 — Billing / wallet ([spec 006](docs/specs/006-billing.md))

- [x] BIL.1 DB: 7 billing enums + academy_plans (amount_cents, recurrence, due_day CHECK 1–28, is_active soft archive, UNIQUE tenant+name) with forced tenant RLS
- [x] BIL.2 DB: charges — per-origin columns + CHECK (plan FK now, event/order plain uuid pending their slices), guardian bill-to, competência + partial-unique materialization key, lazy-overdue lifecycle, (tenant, status, due_date) index, forced RLS
- [x] BIL.3 DB: payments (provider refs + provider_data snapshot + receipt + refund columns, provider partial unique) + payment_mandates (single-active partial unique) + billing_customers (empty in v1), forced RLS
- [x] BIL.4 DB: additive platform columns (academies.provider_account_id, academy_subscriptions provider trio, platform_plans.fee_bps) + composite-FK upgrade of students.academy_plan_id and invites.academy_plan_id onto academy_plans
- [x] BIL.5 DB: dev seeds — plans per fixture academy, open/paid/overdue charge histories with mixed-method payments, an active card mandate, a delinquent-academy fixture for repasses
- [x] BIL.6 Backend: payments infra seam — PaymentProviderPort + SimulatedPaymentProvider (deterministic Pix/boleto payloads in provider_data, mandate inline settle, instant refund) + compile-checked Stripe stub + provider config factory
- [x] BIL.7 Backend: billing module — idempotent ensureCurrentCycleCharges (on-read at wallet/admin entry points, open→overdue flip, events only for inserted/flipped rows) + audited admin materialize trigger, no cron
- [x] BIL.8 Backend: aluno wallet — GET payload (plan header, current charge, recurrence banner, histórico, empty state), payment creation per method, mandate create-on-toggle/cancel, simulate endpoint (@BypassReadOnly, 404 unless simulated) settling through the normalized-event handler, receipt route, home alert flag
- [x] BIL.9 Backend: responsável payments — per-dependent charges with guardian bill-to addressing, pay + Pix per dependent, consolidated histórico, dependent-card alert data
- [x] BIL.10 Backend: admin — overview aggregates (receita mês/ano, previsão pós-materialização, inadimplência % by value, 6-month series, próximos vencimentos groups, inadimplentes), plans CRUD + student/invite plan assignment, audited full-refund endpoint
- [x] BIL.11 Backend: platform repasses read model (gross − fee_bps = net, withheld on delinquent) gated owner/finance + billing.* domain events with guardian variants + audit action codes + CI assertions (no professor billing route, payment routes @BypassReadOnly)
- [x] BIL.12 Backend: e2e suite green — materialization idempotency/race, full simulated paid-flow (Pix/boleto/cartão + mandate auto-settle), normalized-event contract tests, refund, aggregates & repasse math, RBAC/RLS/404s, read-only bypass on payment routes, simulate 404 gating
- [x] BIL.13 Web: admin Visão financeira per admin-02 replacing the index shell — hero receita card (mês, no ano, previsão, inadimplência %), 6-month bar chart, próximos vencimentos, inadimplência list
- [x] BIL.14 Web: admin Planos de mensalidade in Configurações per admin-15 — list + Novo plano/edit sheet (nome, valor, recorrência chips, vencimento chips 5/10/15), archive, student-form plan select
- [x] BIL.15 Web: plataforma Faturamento e repasses per plataforma-09 — SaaS totals tiles + per-academy repasse list with Repassado/Em trânsito/Retido from the read model
- [x] BIL.16 RN: aluno Carteira per aluno-12 (mensalidade card with Em aberto/Paga chip, plan header, recurrence banner, histórico, empty state) replacing the shell + real home mensalidade alert with Carteira deep link
- [x] BIL.17 RN: payment sheets per aluno-13/14/15 — Pix QR + copia-e-cola + Simular pagamento (gated), boleto linha digitável + barcode + Simular compensação, cartão form + recurrence toggle — success pop, Ver comprovante
- [x] BIL.18 RN: responsável Pagamentos per responsavel-04/05 — per-dependent charge cards with plan subtitle, Pix per dependent, Ver comprovante, consolidated histórico + dependent-card alerts
- [x] BIL.19 Android: aluno Carteira + real home mensalidade alert
- [x] BIL.20 Android: payment sheets (Pix/boleto/cartão + recurrence toggle, simulate gating, success pop, comprovante)
- [x] BIL.21 Android: responsável Pagamentos + Pix per dependent + consolidated histórico
- [x] BIL.22 iOS: aluno Carteira + real home mensalidade alert
- [x] BIL.23 iOS: payment sheets (Pix/boleto/cartão + recurrence toggle, simulate gating, success pop, comprovante)
- [x] BIL.24 iOS: responsável Pagamentos + Pix per dependent + consolidated histórico

### Phase 7 — Agenda / calendar ([spec 007](docs/specs/007-agenda.md))

- [x] AGD.1 Backend: agenda module — `GET /v1/aluno/agenda?weekday=` with enrolled-class slot items (times, professor, level fields, occupancy), tenant-timezone `isToday` + read-only `checkedIn` state, `events: []`
- [x] AGD.2 Backend: persona calendars — `GET /v1/{aluno|professor|admin}/calendar?month=` returning persona-scoped weekday recurrence buckets + `events: []`, no session reads or writes
- [x] AGD.3 Backend: e2e suite green — scoping per persona, weekday filter, checkedIn with/without session and after revoke, read purity (no rows created), month validation, RBAC + RLS, read-only academies served
- [x] AGD.4 Web: `/admin/calendario` console page + nav link — month grid with dot expansion, "aulas recorrentes"/"evento" legend, selected-day list, "Nada agendado neste dia." empty state, page component spec
- [x] AGD.5 RN: aluno Agenda tab real — day pills (today default), class cards with check-in button → Phase-4 sheet / green check, "Sem aulas neste dia", Eventos do mês empty section, hero "Ver agenda" CTA enabled
- [x] AGD.6 RN: aluno month calendar behind the "Mês" button + professor calendar behind the dashboard header icon — dots, legend, day agenda, persona empty states
- [x] AGD.7 Android: aluno Agenda tab real (same scope as AGD.5)
- [x] AGD.8 Android: aluno + professor month calendar screens (same scope as AGD.6)
- [x] AGD.9 iOS: aluno Agenda tab added to the shell + real Agenda screen (same scope as AGD.5)
- [x] AGD.10 iOS: aluno + professor month calendar screens (same scope as AGD.6)

### Phase 8 — Events ([spec 008](docs/specs/008-events.md))

- [x] EVT.1 DB: event_status + event_registration_status enums + events table (banner_preset slug, nullable starts_at/location with published CHECK, price_cents NULL = gratuito, responsible_user_id, status lifecycle, (tenant,status,starts_at) index) with forced tenant RLS
- [x] EVT.2 DB: event_registrations (composite event/student FKs, confirmed_by_user_id, status, UNIQUE tenant+event+student) + charges.event_registration_id composite-FK hardening closing the BIL.2 stub
- [x] EVT.3 DB: dev seeds — draft/published free/paid events per fixture academy with mixed registrations (confirmed free, paid-settled, pending_payment) and their event-origin charges
- [x] EVT.4 Backend: events module admin — CRUD + publish/cancel lifecycle (cancel cancels open charges), inscritos list with confirmados/inscritos/arrecadado totals, Comunicar endpoint emitting events.announcement.requested + audit only
- [x] EVT.5 Backend: aluno — home upcomingEvents (next 2 with own state), event detail, free confirm/cancel, paid registration issuing the event-origin charge (guardian bill-to path shared) paid via existing wallet + simulate rails, normalized-event handler extended (succeeded→confirmed, refunded→canceled)
- [x] EVT.6 Backend: responsável events with per-dependent states + confirm/pay/cancel per dependent; professor dashboard eventos-futuros count + list (read-only, no professor write route)
- [x] EVT.7 Backend: AGD contracts filled — agenda "Eventos do mês" + dated month events in all three persona calendars, tenant-timezone bucketing, published-only visibility
- [x] EVT.8 Backend: e2e suite green — lifecycle + publish validation, free/paid/refund registration transitions through the handler contract, charge cancel on registration cancel, guardian scoping 404s, month windows, announce gating, RBAC/RLS/read-only + CI route assertions
- [x] EVT.9 Web: /admin/eventos console page + nav link per admin-13 — gradient-preset cards with valor chip and inscritos line, criar/editar/publicar/cancelar form (valor vazio = gratuito), inscritos view, Comunicar toast; admin calendar pink dots real
- [x] EVT.10 RN: aluno — home Próximos eventos section, Agenda Eventos do mês real, event detail per aluno-10 (Confirmar presença / Pagar inscrição → existing Pix sheet + simulate / Cancelar participação / confirmed banner), calendar event dots + day Evento entries
- [x] EVT.11 RN: responsável Eventos tab real per responsavel-06 (per-dependent chips with check, Pix per dependent) + professor dashboard eventos-futuros tile and list + professor calendar event dots
- [x] EVT.12 Android: aluno events (same scope as EVT.10)
- [x] EVT.13 Android: responsável + professor events (same scope as EVT.11)
- [ ] EVT.14 iOS: aluno events (same scope as EVT.10)
- [ ] EVT.15 iOS: responsável + professor events (same scope as EVT.11)

_Next phases (store, notifications, white-label config, platform console, reports, release) get their specs as each phase ships._
