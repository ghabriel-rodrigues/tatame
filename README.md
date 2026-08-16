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
- [x] EVT.14 iOS: aluno events (same scope as EVT.10)
- [x] EVT.15 iOS: responsável + professor events (same scope as EVT.11)

### Phase 9 — Store ([spec 009](docs/specs/009-store.md))

- [x] STO.1 DB: order_status enum + product_categories (UNIQUE tenant+name, restrict-delete) + products (price_cents, stock_qty + low_stock_threshold, category FK, tags/sizes arrays, monogram + gradient_preset, active/archived) with forced tenant RLS
- [x] STO.2 DB: orders (per-tenant number, buyer_user_id student-or-professor, pending→paid→ready→delivered + canceled, pickup note) + order_items (size, qty, unit_price snapshot) + charges.order_id composite-FK hardening closing the last BIL.2 stub + charges.student_id order-origin relaxation
- [x] STO.3 DB: dev seeds — prototype category/product catalog (GI/RG/FX/TS/MC/PB monograms, tags, sizes, one low-stock product) with mixed orders (pending, paid, ready, delivered, canceled+refunded) and their order-origin charges per fixture academy
- [x] STO.4 Backend: store module admin — categories CRUD (guarded delete), products CRUD + archive, overview aggregates (vendas do mês tenant-tz, pedidos no mês, estoque baixo, vendidos derived)
- [x] STO.5 Backend: storefront shared student+professor — vitrine list (search name+tags, category filter, active only), product detail, order creation (stock/size validation, number, snapshot) issuing the order-origin charge, store payment route + professor simulate role, Meus pedidos, pending cancel
- [x] STO.6 Backend: orders lifecycle — normalized-event handler extended (succeeded→paid+stock decrement, refunded→canceled+restore, idempotent), admin board + ready/delivered transitions, admin cancel via audited refund, store.* domain events + low_stock emission + audit codes
- [x] STO.7 Backend: e2e suite green — catalog CRUD + vitrine scoping, full Pix purchase through the handler contract, stock decrement/restore idempotency + oversell race, transition matrix + board exclusions, overview math, RBAC/RLS/read-only + CI route assertions (professor consumer-only)
- [x] STO.8 Web: /admin/loja Produtos — stat tiles, categorias chip row with nova/rename/guarded-delete, product rows per admin-03, produto form per admin-06 (categoria chips, tags→#chips, galeria monogram + disabled + Foto slots, Remover da loja = archive)
- [x] STO.9 Web: /admin/loja Pedidos — board per admin-04 (Recebido/Em andamento/Entregue/Cancelado chips, pending excluded), status sheet per admin-05 with atual marker, transitions and Cancelado→refund confirm
- [x] STO.10 RN: shared vitrine + detail in both shells — aluno home Loja strip + perfil row, professor perfil row, vitrine per aluno-16/professor-13 with working chip carousel and unclipped grid, detail per aluno-17 (gallery variants, size pills, qty stepper capped, Comprar com Pix → existing Pix sheet + simulate)
- [x] STO.11 RN: Meus pedidos with status chips + retirada note + pending cancel, pedido-pago success toast, Carteira histórico showing aluno order payments
- [x] STO.12 Android: shared vitrine + detail + shell entries (same scope as STO.10)
- [x] STO.13 Android: Meus pedidos + purchase feedback (same scope as STO.11)
- [x] STO.14 iOS: shared vitrine + detail + shell entries (same scope as STO.10)
- [x] STO.15 iOS: Meus pedidos + purchase feedback (same scope as STO.11)

### Phase 10 — Notifications ([spec 010](docs/specs/010-notifications.md))

- [x] NOT.1 DB: notification_category enum + notifications table (user_id recipient FK, category/chip/title/body/route/read_at, list + partial-unread indexes, forced tenant RLS) + memberships.notifications_enabled flag
- [x] NOT.2 DB: dev seeds — mixed read/unread notifications across all five categories for the fixture personas in both academies (badge and list demoable on first login)
- [x] NOT.3 Backend: emitter deltas — origin field on billing charge events + new graduation.awarded post-commit event (student+guardian audience, not emitted for initial-belt seed or revocations)
- [x] NOT.4 Backend: notifications module fan-out listeners for the full mapping table (payer/guardian addressing, plan-origin filter, tenant-wide publish fan-out with dedup, inscritos announce, guardian check-in, buyer order lifecycle, admin low stock; skip recipients without login; batch insert, catch-and-log)
- [x] NOT.5 Backend: read API — cursor list, unread-count (0 when muted), mark-read single + all, settings get/put on the active membership, @BypassReadOnly on mark-read/settings, OpenAPI updated
- [x] NOT.6 Backend: e2e suite green — fan-out via real flows per event, origin double-notify guard, mute semantics, RBAC/RLS/cross-tenant 404s, read-only bypass, listener failure isolation
- [x] NOT.7 Web: admin ConsoleShell bell + unread dot + notifications panel (cards, read-all on open); no bell on plataforma surface (platform notifications recorded debt)
- [x] NOT.8 RN: aluno — home header bell with dot, Notificações screen per aluno-20 (chips, relative timestamps, pagination, read-all on open, route taps), perfil Notificações switch wired to settings
- [x] NOT.9 RN: professor + responsável — same bell/screen/switch scope per shell (responsavel-09; guardian routes map to Pagamentos/dependents)
- [x] NOT.10 Android: aluno notifications (NOT.8 scope)
- [x] NOT.11 Android: professor + responsável notifications (NOT.9 scope)
- [x] NOT.12 iOS: aluno notifications (NOT.8 scope)
- [x] NOT.13 iOS: professor + responsável notifications (NOT.9 scope)

### Phase 11 — White-label config ([spec 011](docs/specs/011-config.md))

- [x] CFG.1 DB: academies branding finalized — `theme` jsonb placeholder replaced by `brand_deep`/`brand_vibrant`/`brand_accent` (nullable, `#RRGGBB` CHECK, all-or-none) + `auto_notifications_enabled boolean NOT NULL DEFAULT true`; `logo_url` untouched (NULL in v1); no dark-theme column (decision recorded)
- [x] CFG.2 DB: dev seeds — second fixture academy saved on a non-default preset (Oceano) so cross-tenant white-label is demoable on first login
- [x] CFG.3 Backend: typed brand in payloads — `/auth/me` `academy.theme` and public invite landing `theme` served as `{deep,vibrant,accent}|null` from the new columns; OpenAPI + shared types regenerated
- [x] CFG.4 Backend: `GET/PUT /admin/academy` — name + brand triplet + autoNotificationsEnabled, hex/name validation with case normalization, `brand:null` clears, audited update, admin-only
- [x] CFG.5 Backend: notification fan-out gated on `auto_notifications_enabled` (closes the 010 deferral — no rows written when off; per-user mute semantics untouched)
- [x] CFG.6 Backend: `GET /admin/permissions` response extended with per-role active-member counts (admin-17 group headers)
- [x] CFG.7 Backend: e2e suite green — branding validation/audit/RBAC/cross-tenant, me + invite propagation, fan-out gate via a real emitting flow, permission counts
- [x] CFG.8 Web: session-driven branding — `derivePalette` + `applyBrand` + MUI theme rebuilt from the session academy brand on login/restore/context change; default brand for plataforma and logged-out; invite flow unchanged
- [x] CFG.9 Web: `/admin/configuracoes` hub per admin-15 — identidade card (monogram, name edit, 4 preset swatches with live preview, Salvar/Cancelar revert), toggles (Tema escuro, Notificações automáticas wired, geolocalização disabled stub), entry rows to Permissões/Integrações-stub/Planos/Regras de graduação
- [x] CFG.10 Web: console dark theme — `data-theme` flip + dark MUI theme from the config toggle, persisted in localStorage
- [x] CFG.11 Web: `/admin/permissoes` per admin-17 — role groups with member-count chips, registry-driven toggle rows on the existing GET/PUT with optimistic save + rollback
- [x] CFG.12 RN: brand wiring — root ThemeProvider fed from the session academy brand with AsyncStorage last-brand cache (branded cold start, Tatame fallback); all three shells inherit
- [x] CFG.13 RN: aluno perfil Tema escuro switch real — persisted mode, full dark shell per aluno-21, status bar follows mode
- [x] CFG.14 Android: brand wiring — Compose color scheme built from the DerivePalette port on the session brand, DataStore last-brand cache
- [x] CFG.15 Android: aluno Tema escuro switch — explicit DataStore-persisted preference replaces the system-dark default (system follow = recorded debt)
- [x] CFG.16 iOS: brand wiring — TatameTheme environment constructed from the session brand with UserDefaults last-brand cache
- [x] CFG.17 iOS: aluno Tema escuro switch — persisted mode through the theme environment, full dark shell

### Phase 12 — Platform console ([spec 012](docs/specs/012-platform-console.md))

> Plataforma is a web-console persona (routing decision: web serves Admin + Plataforma + Convite + login), so this phase has no mobile leg.

- [x] PLT.1 DB: `platform_plans.features` migrated from the `{invites,store,whiteLabel}` jsonb blob to a `text[]` of registry slugs with a CHECK against the registry; seeded catalog rewritten onto the slugs that reproduce plataforma-05; no highlight/inheritance columns (derivation decision recorded)
- [x] PLT.2 DB: dev seeds — five fixture academies spanning active/trial-ending/delinquent/suspended with mixed-age subscriptions (6-month chart has slope, attention list is non-empty) + the four plataforma-10 platform team members with logins
- [x] PLT.3 Backend: `platform` module + `GET /platform/overview` — MRR with month-over-month delta, academias/alunos/inadimplência tiles, 6-month series from subscription lifetimes, "precisam de atenção" rows with PT-BR reasons; owner/finance only
- [x] PLT.4 Backend: `GET /platform/academies` + `GET /platform/academies/:id` — list with city/students/plan/status, detail with stats, subscription and pending-change state; all three platform roles
- [x] PLT.5 Backend: `POST /platform/academies` — academy + trialing subscription + find-or-create admin membership in one transaction, slug uniqueness, set-password email through the notification port outside the transaction, audited; owner only
- [x] PLT.6 Backend: `PUT /platform/academies/:id/plan` (next-cycle only, `null` clears) + `POST .../suspend` + `POST .../reactivate` with status-cache invalidation and audit rows; owner only
- [x] PLT.7 Backend: plan catalog — feature registry endpoint output, `GET/POST/PUT /platform/plans` with name/price/limit/feature validation and 409 on name collision, derived "mais assinado" and feature-inheritance in the read model; writes owner-only
- [x] PLT.8 Backend: `GET /platform/team` + `POST /platform/team` (owner-only invite reusing the set-password email, 409 on an existing platform member) + `GET /platform/integrations` read-only stub
- [x] PLT.9 Backend: e2e suite green — overview math, registration end-to-end + existing-email attach, plan change scoped to pending, suspend blocks access without cache wait, catalog validation, team invite, full RBAC matrix + CI route assertions
- [x] PLT.10 Web: plataforma nav in `ConsoleShell` (Visão/Academias/Planos/Conta, role-aware index redirect) + `/plataforma` Visão geral per plataforma-02 — MRR hero with delta, three tiles, 6-month chart, "Precisam de atenção" list
- [x] PLT.11 Web: `/plataforma/academias` per plataforma-03 + "Registrar academia" sheet per plataforma-08 with the done panel
- [x] PLT.12 Web: `/plataforma/academias/:id` per plataforma-04 — stats, plan picker with next-cycle caption and pending-change banner, Entrar como admin (role-gated), Suspender/Reativar
- [x] PLT.13 Web: `/plataforma/planos` per plataforma-05 with derived "Mais assinado" and "Tudo do X" chips + novo/editar sheet per plataforma-06/07
- [x] PLT.14 Web: `/plataforma/conta` per plataforma-12 + `/plataforma/equipe` per plataforma-10 (owner-only Convidar, role explainer) + `/plataforma/integracoes` per plataforma-11 (disabled switches)

### Phase 13 — Reports + polish ([spec 013](docs/specs/013-reports.md))

- [x] REP.1 DB: `users` profile columns — `gender`, `cpf`, `rg`, `address_line`, `address_city`, `address_state`, `address_zip`, `emergency_contact_name`, `emergency_contact_phone`, all nullable with format CHECKs (CPF 11 digits, CEP 8 digits, UF 2 letters, gender set); no new tables, no CPF uniqueness (decisions recorded)
- [x] REP.2 DB: dev seeds — fixture aluno with a full profile (CPF/RG set → locked state demoable) + attendance/event/graduation/order spread so all five reports and both ranking segments are non-empty with a distinct top 3
- [x] REP.3 Backend: `reports` module — five report read models (`financeiro`, `frequencia`, `inadimplencia`, `graduacoes`, `loja`) as `GET /admin/reports/:report` JSON with month/semester windows in the tenant timezone, financeiro running the charge-materialization pass, honest denominators, reversed-award and canceled-order exclusions; admin-only
- [x] REP.4 Backend: `GET /admin/reports/:report/csv` — streamed CSV from the same read models, UTF-8 BOM + semicolon + pt-BR money, Content-Disposition `<slug>-<YYYY-MM>.csv`
- [x] REP.5 Backend: `GET /rankings?by=lessons|events` — academy-wide active students, month (lessons) / semester (events) windows, count-desc + name-asc ties, top 10 + `me` position for out-of-list students (null for professors); student + professor roles; visible regardless of the streak toggle (decision recorded)
- [x] REP.6 Backend: `GET/PUT /aluno/profile` — profile read with `cpfLocked`/`rgLocked` and read-only email/birthDate (student row as birth-date authority), PUT with per-field validation, CPF checksum + digit normalization, CPF/RG write-once 422, name sync onto the linked student row in-transaction
- [x] REP.7 Backend: graduation timeline `certificateAvailable` real — true exactly on belt-promotion entries, false on degree/initial entries; no new endpoint (certificate renders client-side from timeline + session)
- [x] REP.8 Backend: e2e suite green — report math + windowing + CSV shape, rankings math (ties, você, exclusions), profile lock/validation/sync, certificate flag, full RBAC matrix + read-only semantics + CI route assertions
- [x] REP.9 Web: `/admin/relatorios` per admin-18 — Relatórios header entry on the Visão financeira, month picker, five rows with exact subtitles, CSV as authenticated blob download, PDF as print-friendly view in a new tab (real PDF lib recorded debt)
- [x] REP.10 RN: aluno Dados pessoais per aluno-18 — sections, locked CPF/RG boxes, read-only email/birthDate, Cidade / UF + CEP row, Trocar foto placeholder, Salvar round trip
- [x] REP.11 RN: rankings — aluno home "Ranking do mês" card with live position + full screen per aluno-06/07, professor dashboard real "Ranking de presença" section + full screen per professor-05/06 (segments, bars, você highlight, selos footnote)
- [x] REP.12 RN: certificado — belt-promotion "Ver certificado" unlocked, branded certificate view (BeltBar, name, belt, date, professor line), OS share/print action
- [x] REP.13 Android: aluno Dados pessoais (REP.10 scope)
- [x] REP.14 Android: rankings — aluno + professor (REP.11 scope)
- [x] REP.15 Android: certificado (REP.12 scope)
- [x] REP.16 iOS: aluno Dados pessoais (REP.10 scope)
- [x] REP.17 iOS: rankings — aluno + professor (REP.11 scope)
- [x] REP.18 iOS: certificado (REP.12 scope)

### Phase 14 — Release readiness ([spec 014](docs/specs/014-release.md))

- [ ] RLS.1 Fix the `api:typecheck` × `api:build` dist race — typecheck `outDir` → `out-tsc/app` (tsbuildinfo included), webpack keeps `dist/` exclusively; repeated parallel runs clean
- [ ] RLS.2 CI: replace the template `.github/workflows/ci.yml` per infra-03 — pnpm/node 24 setup, `nx-set-shas`, concurrency; parallel jobs `main` (format check + `nx affected -t lint typecheck test build`, Testcontainers Postgres), `migrations` (drizzle-kit check + generate + git-diff drift gate), `openapi` (`nx run api:openapi` + git-diff on `packages/shared/src/api/openapi.json`), `web-smoke` (compose stack + seeded fixtures + `nx e2e web-e2e`); `actionlint` clean + all commands verified locally (live run waits on RLS.H1)
- [ ] RLS.3 CI: `.github/workflows/mobile-android.yml` — path-filtered `apps/mobile-android/**`, JDK 17 temurin, setup-gradle, `./gradlew build`
- [ ] RLS.4 CI: `.github/workflows/mobile-ios.yml` — path-filtered `apps/mobile-ios/**`, macos-15, XcodeGen generate, `xcodebuild build test` with `CODE_SIGNING_ALLOWED=NO`
- [ ] RLS.5 Web deploy: `netlify.toml` (base/command/publish, SPA fallback `/* → /index.html 200`, security + caching headers, commented `/api/*` proxy redirect placeholder) + production env contract documented per deploy context (`VITE_*` only) — resolves infra-04, ticket + map updated
- [ ] RLS.6 Web: route-level code-split per web-01 — `React.lazy` at the persona-surface boundary with `Suspense` fallbacks, literal import paths, per-surface chunks verified (Convite fetches no console code); existing route/RBAC suites green unchanged
- [ ] RLS.7 Web e2e: `apps/web-e2e` via `@nx/playwright` with the six web-07 smoke specs (login happy path, silent-refresh reload, anon guard redirect, wrong-persona redirect, logout revocation, Convite invalid token) green against `vite preview` + compose API/Postgres with seeded fixtures, wired into `nx affected`
- [ ] RLS.8 Android: real Quicksand — OFL TTFs in `res/font`, `Type.kt` `QuicksandFamily` real (weights preserved), `FontFamily.Default` placeholder gone, license committed
- [ ] RLS.9 iOS: real Quicksand — TTFs as DesignSystem SPM resources with runtime registration, `Font.custom` typography helper, all `design: .rounded` usages migrated, license committed
- [ ] RLS.10 Device visual pass — compose+seed stack, Android emulator + iOS simulator + web + RN: auth, home/dashboard and check-in flows per persona plus Convite, compared against the handoff screenshots; findings filed as `docs/qa/visual-pass-014.md` with P0/P1 triage (full 79-screen pass recorded as ongoing QA, not a phase gate)
- [ ] RLS.11 Visual pass P0 fixes — every P0 mismatch from RLS.10 fixed and re-verified on device; P1s remain filed
- [ ] RLS.12 `docs/RELEASE.md` runbook — per-provider step-by-step (git host + push, Netlify, API/Postgres host per H3, Stripe live + webhook, Resend domain, EAS, App Store/Play Console, DNS), each page ending in a verify step; host-agnostic where the choice is the human's
- [ ] RLS.H1 (humano) Pick the git host/organization and push — the user's decision alone; workflows go live on first push
- [ ] RLS.H2 (humano) Create the Netlify site, link the repo, set per-context env vars (`VITE_API_URL`, `VITE_STRIPE_PUBLISHABLE_KEY`)
- [ ] RLS.H3 (humano) Choose the API + Postgres production host — shortlist Fly.io / Railway / Render / Neon / Supabase on BR latency, cost, Stripe reachability; BOSS recommends Fly.io (GRU) + Fly managed Postgres, Supabase São Paulo Postgres as fallback; provision + secrets + migrations per runbook
- [ ] RLS.H4 (humano) Stripe live mode — live keys in the API host secret store, webhook endpoint + secret registered, publishable key to Netlify/EAS
- [ ] RLS.H5 (humano) Resend — domain verification DNS records, production from-address
- [ ] RLS.H6 (humano) Expo/EAS — account, project link, `eas env` secrets, first preview + production builds
- [ ] RLS.H7 (humano) App Store + Play Console — developer accounts, app records, signing, first internal-testing uploads
- [ ] RLS.H8 (humano) DNS/domínio — domain purchase, Netlify + Resend + API host records

_RLS.H* items are user-gated — the runbook in docs/RELEASE.md walks each one._
