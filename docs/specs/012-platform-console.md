# 012 — Platform Console (Phase 12)

Status: ready-for-agent
Personas covered: Plataforma (SaaS owner)

Follows the to-spec template. UI truth: plataforma-02-visao-mrr (Visão geral — MRR hero, stat tiles, 6-month chart, "Precisam de atenção"), plataforma-03-academias (academy list), plataforma-04-academia-detalhe (stats, plan picker, entrar como admin, suspender), plataforma-05-planos-saas / plataforma-06-novo-plano-features-toggles / plataforma-07-editar-plano (plan catalog + editor), plataforma-08-registrar-academia (register sheet), plataforma-10-equipe (team), plataforma-11-integracoes (integrations), plataforma-12-conta (Conta hub). Business truth: `agents/boss.md` (two plan levels never conflated; plan change applies next cycle; suspension blocks access; delinquency → withheld repasses + read-only; platform roles Owner/Suporte/Financeiro; "entrar como admin" = audited impersonation) and the handoff README's Mantenedor da plataforma section.

## Problem Statement

The platform persona is the only one of the six with a login and no product. A SaaS owner can authenticate, switch into the `/plataforma` surface, and land on exactly one real screen — Faturamento e repasses (BIL.15) — with every other route falling through to the "Em construção" shell. Everything the persona exists to do is unreachable from the console: they cannot see the business (MRR, academies, students on the base, delinquency), cannot list the academies they sell to, cannot onboard a new one, cannot move an academy between plans, cannot suspend a defaulting academy, cannot edit the plan catalog they sell, and cannot see or grow their own team.

The backend is in the same state. The tenant root, the plan catalog, the subscription table with its `pending_platform_plan_id` next-cycle column, the platform-users table with its three roles, the impersonation grant and the repasse read model all exist and are exercised — but the only platform-scoped write route in the product is `POST /platform/academies/:id/impersonate`. There is no way to create an academy at all: every fixture academy in the database was put there by the dev seed, so the product's own onboarding path (register the academy, invite its admin by email, start it on Trial) has never been implemented. The charter rules that depend on these writes — plan change applies next cycle, suspension blocks access — are enforced downstream (the AcademyStatusGuard blocks suspended tenants today) but no surface can ever trigger them.

Two smaller gaps ride along. The plan catalog stores its feature set as an ad-hoc `{invites, store, whiteLabel}` jsonb blob that no client renders and no screen can edit, while plataforma-05/06 show plan cards built from labeled feature chips and a create form driven by a fixed feature list. And Phase 10 explicitly recorded platform notifications as debt (NOT.7 shipped the bell on the admin surface only), leaving the plataforma persona with no signal channel at all.

## Solution

Build the platform console: a real `/plataforma` surface with four sections mirroring the prototype's tab bar — Visão, Academias, Planos, Conta — served by one new NestJS `platform` module that owns every platform-scoped read model and write.

**Visão geral** (plataforma-02) is a single overview endpoint: the MRR hero (sum of live subscription prices, with the month-over-month delta), the three stat tiles (academias, alunos na base, inadimplência %), the 6-month MRR bar chart, and the "Precisam de atenção" list. Every number is derived from rows that already exist — MRR history from subscription lifetimes against plan prices, students from active student rows, attention from trial end dates and delinquent statuses. No new aggregate tables, no fabricated series.

**Academias** (plataforma-03/04/08) is the persona's core loop: the list with city, student count, plan and status chip; the register sheet that creates the academy, its Trial subscription and its admin's membership in one transaction and emails that admin a set-password link — the product's first real onboarding path; and the detail screen with stats, the plan picker whose change lands on `pending_platform_plan_id` ("vale no próximo ciclo", never mid-cycle), Suspender/Reativar wired to the status the access guard already enforces, and the shipped "Entrar como admin" impersonation grant.

**Planos** (plataforma-05/06/07) turns the catalog into an editable product surface. The feature blob becomes a **slug array driven by a feature registry** (the admin-17 permission-registry pattern: the API serves labels, the client renders whatever the registry defines), so the plan cards show real chips and the create/edit sheet's toggles are the registry rows. The "Tudo do Essencial" / "Tudo do Pro" inheritance chips and the "Mais assinado" badge are **derived** — from feature-set containment and live subscription counts respectively — rather than stored flags.

**Conta** (plataforma-12/10/11) is the hub: Equipe (the platform team with role chips and an owner-only invite that reuses the set-password email path), Faturamento e repasses (the shipped screen, now reachable), and Integrações rendered as the honest read-only stub the handoff calls for.

RBAC follows the charter's role split, which the Equipe screen itself states in prose: **Owner** owns money and catalog writes, **Suporte** works academies and impersonation but never money, **Financeiro** sees money but never impersonates. The console home routes per role so Suporte lands on Academias instead of a 403.

## User Stories

### Plataforma — Visão geral (plataforma-02)

1. As the platform owner, I want a "Visão geral" home with my monthly recurring revenue as the hero number, so that the health of the business is the first thing I see.
2. As the platform owner, I want the MRR hero to carry the change against last month ("+12% vs. julho"), so that I read direction, not just level.
3. As the platform owner, I want stat tiles for academias na plataforma, alunos na base and inadimplência %, so that scale and risk sit next to revenue.
4. As the platform owner, I want a 6-month MRR bar chart with the current month highlighted, so that the trend is visible without a report.
5. As the platform owner, I want a "Precisam de atenção" list naming academies whose trial is ending or whose subscription is overdue, with the reason in plain PT-BR ("Trial termina em 9 dias", "Assinatura vencida há 12 dias"), so that I know who to call today.
6. As the platform owner, I want each attention row to open that academy's detail, and a "Todas as academias" link to the full list, so that the overview is a launchpad.
7. As a finance-role member, I want the same overview, so that revenue is visible to the role that owns it.
8. As a support-role member, I want the console to open on Academias instead of a screen I am not allowed to see, so that my role has a working home.

### Plataforma — Academias (plataforma-03/04/08)

9. As a platform member, I want an "Academias" list showing each academy's monogram, name, city/UF, student count, plan name and status chip (Ativa / Trial / Inadimplente / Suspensa), so that the whole customer base is one screen.
10. As a platform member, I want the list header to state how many schools, academies and teams are on the platform, so that the count is stated, not counted by eye.
11. As the platform owner, I want a "Registrar academia" form with academy name, cidade/UF, email do administrador and a plan picker, so that onboarding a customer is a single action.
12. As the platform owner, I want the registered academy to start on **Trial** with a subscription on the chosen plan, so that the charter's trial-first rule is the default path.
13. As the platform owner, I want the academy's admin to receive an email with a link to set their password, so that they can configure their identity without me creating credentials for them.
14. As the platform owner, I want registering with an email that already belongs to a user to attach an admin membership to that existing person, so that one human can run two academies without a second account.
15. As the platform owner, I want the success state to confirm the invite went out ("O admin recebeu o convite por email"), so that I know the handoff happened.
16. As a platform member, I want an academy detail screen with monogram, city, "desde <mês ano>", status chip and the three stat tiles (alunos, mensalidade/mês, professores), so that a customer's shape is legible at a glance.
17. As the platform owner, I want a "Plano da plataforma" picker on the detail with the three plans and their prices, the current one marked, so that moving a customer between plans is one tap.
18. As the platform owner, I want the plan change to be scheduled for the **next billing cycle** and told to me as such ("A mudança vale a partir do próximo ciclo"), so that the charter's rule is visible truth and no customer is re-priced mid-cycle.
19. As the platform owner, I want to cancel a scheduled plan change before the cycle turns, so that a mistake is recoverable.
20. As the platform owner, I want "Suspender academia" to block that academy's access immediately, and the button to become "Reativar academia" afterwards, so that suspension is a real lever.
21. As a support-role member, I want "Entrar como admin da academia" to open an audited impersonated session, so that I can support a customer from inside their console.
22. As a finance-role member, I want the impersonation button denied for my role, so that the charter's separation holds where money and access split.

### Plataforma — Planos (plataforma-05/06/07)

23. As a platform member, I want a "Planos" screen with one card per plan showing name, monthly price, student limit, how many academies subscribe to it and its feature chips, so that I see the catalog exactly as I sell it.
24. As a platform member, I want the most-subscribed plan badged "Mais assinado" and outlined, so that the flagship is obvious — derived from live subscriptions, not a hardcoded flag.
25. As a platform member, I want a plan whose features contain everything a cheaper plan offers to show "Tudo do <plano>" plus only its additions, so that the cards read like the pricing page instead of repeating themselves.
26. As the platform owner, I want a "Novo plano da plataforma" sheet with plan name, monthly price, feature toggles and student-limit chips (80 / 150 / 250 / 500 / Ilimitado), so that the catalog is mine to extend.
27. As the platform owner, I want the new plan to become available for new academy subscriptions immediately, so that I can sell it the same day.
28. As the platform owner, I want to edit an existing plan (name, price, features, limit) with the sheet told to me as "Mudanças valem no próximo ciclo das assinantes", so that repricing never surprises a current customer.
29. As the platform owner, I want a plan name that collides with an existing plan rejected with a clear message, so that the catalog stays unambiguous.
30. As a finance-role member, I want to read the catalog but not write it, so that pricing changes stay with the owner.

### Plataforma — Conta (plataforma-12/10/11)

31. As a platform member, I want a "Conta" screen listing my own identity and entry rows to Equipe, Faturamento e repasses and Integrações, so that the non-daily areas have one home.
32. As a platform member, I want an "Equipe da plataforma" screen listing each member with avatar, email and role chip, so that I know who has access.
33. As a platform member, I want a footer explaining what each role can do (Owner controla faturamento e planos; Suporte pode entrar como admin de academias; Financeiro vê repasses), so that the role model is documented where it is used.
34. As the platform owner, I want to invite a team member by name, email and role, so that the team grows without a database console.
35. As the platform owner, I want the invited member to receive the same set-password email, so that onboarding staff and onboarding an academy admin work the same way.
36. As a non-owner platform member, I want the Convidar action hidden and refused by the API, so that the team roster cannot be changed by support or finance.
37. As a platform member, I want an "Integrações" screen listing the payment rails (Pix, Boleto, Cartão) with their settlement terms and a disabled switch, so that the roadmap is visible and honestly not operable in v1.
38. As a platform member, I want "Sair" from the Conta screen to end my session, so that the persona's shell is complete.

## Implementation Decisions

### Schema — one migration, no new tables for the read models

- **`platform_plans.features` becomes `text[]` of registry slugs** (`platform_plan_features`), replacing the `{invites, store, whiteLabel}` jsonb blob. The registry lives in shared code with PT-BR labels and stable slugs — `attendance` (Presença e turmas), `graduations` (Graduações), `pix_payments` (Pagamentos Pix), `store` (Loja da academia), `events` (Eventos), `full_finance` (Financeiro completo), `white_label` (White-label), `multi_unit` (Multiunidades), `advanced_reports` (Relatórios avançados), `api` (API) — following the admin-17 permission-registry precedent: the API serves `{slug,label}` rows, the client renders whatever the registry defines, and there is no client-side list to drift. A CHECK constraint rejects unknown slugs at the database boundary. The migration rewrites the three seeded rows onto the slug arrays that reproduce the plataforma-05 cards.
- **No `is_highlighted` / "mais assinado" column and no `inherits_plan_id`.** Both are derived at read time: the badge goes to the plan with the most live subscriptions (ties → lower `sort_order`); the "Tudo do X" chip is emitted when a plan's feature set is a strict superset of the next-cheaper plan's, and that plan's shared chips are then suppressed. Storing either would let the display drift from the truth it summarizes.
- **No new columns for suspension or plan change.** `academies.status` already carries `suspended` and the AcademyStatusGuard already blocks it; `academy_subscriptions.pending_platform_plan_id` already models the next-cycle change. This phase writes them for the first time.
- **No MRR snapshot table.** The 6-month series is computed from subscription lifetimes (`created_at`, `canceled_at`, status) against plan prices: a subscription contributes its plan price to month _M_ when it existed for any part of _M_ and was not canceled before _M_ started. Real history from real rows; a snapshot table would only be needed once prices change often enough that today's price misdescribes an old month, which is recorded as a limitation rather than pre-built.
- **Dev seeds** grow to make the console demoable on first login: five fixture academies spanning every status (active ×2, trial ending inside the attention window, delinquent, suspended) with subscriptions of mixed ages so the 6-month chart has slope, plus the four platform team members from plataforma-10 (one owner, two support, one finance) with logins.

### Backend — one `platform` module, RBAC by charter role

A new `apps/api/src/modules/platform` module owns the console. The two existing platform routes stay where they are (`platform/academies/:id/impersonate` in identity, `platform/billing/repasses` in billing) — they are already shipped, tested and correctly placed with the services they use; the new module registers alongside them under the same `/v1/platform` prefix.

Every route runs on the **platform (BYPASSRLS) pool** — the persona is cross-tenant by definition — except the two writes that must land inside a tenant (the new academy's admin membership, and the audited status flips), which go through `withTenant` so the tenant policies still apply.

| Route                                                                                          | Roles                   |
| ---------------------------------------------------------------------------------------------- | ----------------------- |
| `GET /platform/overview`                                                                       | owner, finance          |
| `GET /platform/academies` · `GET /platform/academies/:id`                                      | owner, support, finance |
| `POST /platform/academies`                                                                     | owner                   |
| `PUT /platform/academies/:id/plan` (`{platformPlanId}` or `null` to cancel a scheduled change) | owner                   |
| `POST /platform/academies/:id/suspend` · `/reactivate`                                         | owner                   |
| `POST /platform/academies/:id/impersonate` (shipped)                                           | owner, support          |
| `GET /platform/plans`                                                                          | owner, support, finance |
| `POST /platform/plans` · `PUT /platform/plans/:id`                                             | owner                   |
| `GET /platform/team`                                                                           | owner, support, finance |
| `POST /platform/team`                                                                          | owner                   |
| `GET /platform/integrations`                                                                   | owner, support, finance |
| `GET /platform/billing/repasses` (shipped)                                                     | owner, finance          |

- **Registering an academy** is one transaction: insert the academy (status `trial`, slug derived from the name with a uniqueness suffix, `contact_email` = the admin's email), insert its `academy_subscriptions` row (`trialing`, on the chosen plan, `current_period_end` = +14 days so the trial lands in the attention window on schedule), find-or-create the admin `users` row, and insert the `admin` membership through `withTenant`. Then — outside the transaction, fire-and-acknowledge like the existing forgot-password path — issue a single-use reset token and send it through the existing `NotificationPort`, so a mail failure never rolls back a created customer. Audited as `academy.registered`.
- **Plan change** writes `pending_platform_plan_id` only. It never touches `platform_plan_id`, never re-prices the current period, and `null` clears a scheduled change. The response echoes the pending plan so the UI can render "Muda para X no próximo ciclo". Cycle rollover itself (a job that promotes pending → current at `current_period_end`) is **out of scope and recorded**: v1 has no scheduler, and the charter rule this phase must honour is "does not apply now", which the column already guarantees.
- **Suspend / reactivate** flips `academies.status` between `suspended` and its pre-suspension status (`delinquent` if the subscription is `past_due`, else `active`; a trial that is suspended returns to `trial`), and calls `AcademyStatusService.invalidate(academyId)` so the 30-second guard cache cannot serve a stale allow. Audited as `academy.suspended` / `academy.reactivated`.
- **Plan catalog writes** validate name (trimmed, 2–40 chars, unique — 409 on collision), `priceCents` (integer ≥ 0), `studentLimit` (positive integer or `null` = unlimited), and features (every slug in the registry). `feeBps` is **not** editable from this screen — the repasse fee is priced by contract, not by the plan editor; the field keeps its seeded value on create (defaults to the catalog's tier value) and is left untouched on edit. Recorded so its absence from plataforma-06 is a decision, not an omission.
- **Team invite** creates the `users` row when the email is new, inserts `platform_users` with the chosen role, and sends the same set-password email. An email that already holds a platform membership is a 409. Audited as `platform_user.invited`.
- **Integrations** is a read-only projection of the configured payment provider: the three rails with their PT-BR labels and settlement copy, each carrying `enabled: true` and `configurable: false`. No table, no writes. This is the handoff's "(stubs)" read literally, and the disabled-switch precedent set by CFG.9's geolocalização row.

### Web — the console gains its nav and five routes

- **`ConsoleShell` learns the plataforma nav** (today it renders a nav for `/admin` only): Visão, Academias, Planos, Conta — with Visão hidden for support, whose index redirect points at Academias. The bell stays admin-only (platform notifications remain Phase-10 debt).
- **`/plataforma`** — Visão geral: gradient hero card with MRR and the delta pill, three stat tiles, the 6-month bar chart (bars from the design system's chart primitive already used by admin-02's Visão financeira), and the "Precisam de atenção" card list with monogram, reason line and status chip, plus the "Todas as academias" link.
- **`/plataforma/academias`** — list with header count line, `ListRow` per academy (monogram, `Cidade / UF · N alunos · plano X`, status chip) and the "Registrar academia" action opening the sheet per plataforma-08 (nome, cidade/UF, email do administrador, plan chips with prices, "Registrar e convidar admin", success state per plataforma-08's done panel).
- **`/plataforma/academias/:id`** — detail per plataforma-04: back header, identity block, status chip, three stat tiles, the "Plano da plataforma" card with the three plan options and the next-cycle caption (plus the "Muda para X no próximo ciclo" banner with Cancelar when a change is pending), the primary "Entrar como admin da academia" button (hidden for finance, which the API refuses anyway) and the danger-tinted Suspender/Reativar button.
- **`/plataforma/planos`** — plan cards per plataforma-05 (name, price with `/mês` suffix, limit + subscriber line, feature chips with the derived "Tudo do X", "Mais assinado" badge and purple outline on the leader, Editar plano action) and the create/edit sheet per plataforma-06/07 (nome, preço, feature toggle rows from the registry, limit chips, contextual title/subtitle/CTA and done panel).
- **`/plataforma/conta`** — hub per plataforma-12 with the member's identity card and entry rows to Equipe, Faturamento e repasses (the shipped `/plataforma/repasses`) and Integrações, plus Sair. **`/plataforma/equipe`** per plataforma-10 (member rows with role chips, owner-only Convidar sheet, role-explainer footer) and **`/plataforma/integracoes`** per plataforma-11 (rail rows with disabled switches and a "v1" note).
- All copy is PT-BR per the handoff; all colors come from design-system tokens (status chips reuse the `tone` prop already used by the repasses list). Every new page ships a page spec in the established pattern.

## Testing Decisions

- Same doctrine as specs 001–011: externally observable behavior through the API against real Postgres with RLS active; no assertions on internals.
- **Backend e2e** (`platform-console.e2e.spec.ts`): overview math against a known fixture set (MRR = live subscription prices, delta vs. previous month, student count, delinquency rate, 6-month series shape, attention rows and their reasons); academy registration end-to-end (academy + trialing subscription + admin membership created, reset email dispatched through the port double, existing-email path attaches instead of duplicating, slug collision suffixed); plan change writes `pending_platform_plan_id` only and leaves the current plan and price untouched, `null` clears it; suspend flips status, a request from that academy's admin is then blocked by the guard **without waiting out the cache**, reactivate restores the pre-suspension status; plan CRUD validation (name collision 409, unknown feature slug 400, negative price 400, `studentLimit: null` accepted) and the derived badge/inheritance being read-model output rather than stored; team invite creates the platform user and refuses duplicates; the full RBAC matrix per the table above (support → 403 on overview/money/writes, finance → 403 on impersonation and catalog writes, academy roles → 403/404 on every platform route) and the CI route-assertion check that every new route is covered.
- **Web**: page specs per the established pattern — visao (hero + tiles + chart + attention list from a mocked overview, support redirect), academias (list renders, register sheet posts the expected body and shows the done panel), academia-detalhe (plan pick posts and renders the pending banner, suspend flips the button label, impersonation button hidden for finance), planos (cards render registry chips, derived badge and "Tudo do X", create and edit sheets post the expected bodies), conta/equipe/integracoes (rows, owner-only Convidar, disabled switches).
- **No mobile work.** The plataforma persona is web-console only by the routing decision recorded in `.scratch/web/issues/02-routing-persona-priority.md` (web serves Admin + Plataforma + Convite + login; Aluno/Professor/Responsável stay mobile-first). Restated here so the absence of RN/Kotlin/Swift rows in the checklist is a decision, not a dropped slice.

## Out of Scope

- **Billing-cycle rollover job** — nothing promotes `pending_platform_plan_id` to the current plan when the period ends; v1 has no scheduler. Recorded debt, called out above.
- **Real money movement on SaaS subscriptions** — no Stripe Billing subscription is created for a registered academy; `provider*` columns stay NULL as they do today (the stage-2 swap is spec 006's territory).
- **Editing `fee_bps` from the plan editor** — repasse pricing is contractual; recorded above.
- **Deleting or archiving platform plans** — `is_active` exists but plataforma-05/06/07 show no delete affordance; not built.
- **Editing or removing platform team members, and role changes after invite** — plataforma-10 shows Convidar only.
- **Platform notifications** (the prototype's `notifsP` view and a plataforma bell) — still Phase-10 debt; "Precisam de atenção" carries the same signals with real data.
- **Operable integrations** — read-only stub per the handoff's "(stubs)"; no per-rail pause, no platform settings table.
- **Multiunidades** — a plan feature chip in the catalog, not a product capability in v1.
- **Platform-side branding** — the console stays on the default Tatame brand (spec 011 recorded this).
- **Academy deletion** — suspension is the only off switch.

## Further Notes

- This phase writes `academies` rows through the application for the first time; the seed's academy creation stays as-is (seeds run on the platform pool and are not the product path).
- The `features` jsonb → `text[]` migration rewrites the three seeded rows; nothing else in the codebase reads the old blob (verified: no consumer outside the seed).
- The MRR series describes each historical month with **today's** plan prices. Once catalog prices change often, that becomes a real distortion and the snapshot table this spec declined becomes justified — recorded so the trade-off is visible when it bites.
- Delivery follows the fixed order DB → backend → web; there is no mobile leg for this persona. The checklist below is mirrored into the root README, and checking a box there is the only "ticket closing" this project has.

## Delivery Checklist

- [ ] PLT.1 DB: `platform_plans.features` migrated from the `{invites,store,whiteLabel}` jsonb blob to a `text[]` of registry slugs with a CHECK against the registry; seeded catalog rewritten onto the slugs that reproduce plataforma-05; no highlight/inheritance columns (derivation decision recorded)
- [ ] PLT.2 DB: dev seeds — five fixture academies spanning active/trial-ending/delinquent/suspended with mixed-age subscriptions (6-month chart has slope, attention list is non-empty) + the four plataforma-10 platform team members with logins
- [ ] PLT.3 Backend: `platform` module + `GET /platform/overview` — MRR with month-over-month delta, academias/alunos/inadimplência tiles, 6-month series from subscription lifetimes, "precisam de atenção" rows with PT-BR reasons; owner/finance only
- [ ] PLT.4 Backend: `GET /platform/academies` + `GET /platform/academies/:id` — list with city/students/plan/status, detail with stats, subscription and pending-change state; all three platform roles
- [ ] PLT.5 Backend: `POST /platform/academies` — academy + trialing subscription + find-or-create admin membership in one transaction, slug uniqueness, set-password email through the notification port outside the transaction, audited; owner only
- [ ] PLT.6 Backend: `PUT /platform/academies/:id/plan` (next-cycle only, `null` clears) + `POST .../suspend` + `POST .../reactivate` with status-cache invalidation and audit rows; owner only
- [ ] PLT.7 Backend: plan catalog — feature registry endpoint output, `GET/POST/PUT /platform/plans` with name/price/limit/feature validation and 409 on name collision, derived "mais assinado" and feature-inheritance in the read model; writes owner-only
- [ ] PLT.8 Backend: `GET /platform/team` + `POST /platform/team` (owner-only invite reusing the set-password email, 409 on an existing platform member) + `GET /platform/integrations` read-only stub
- [ ] PLT.9 Backend: e2e suite green — overview math, registration end-to-end + existing-email attach, plan change scoped to pending, suspend blocks access without cache wait, catalog validation, team invite, full RBAC matrix + CI route assertions
- [ ] PLT.10 Web: plataforma nav in `ConsoleShell` (Visão/Academias/Planos/Conta, role-aware index redirect) + `/plataforma` Visão geral per plataforma-02 — MRR hero with delta, three tiles, 6-month chart, "Precisam de atenção" list
- [ ] PLT.11 Web: `/plataforma/academias` per plataforma-03 + "Registrar academia" sheet per plataforma-08 with the done panel
- [ ] PLT.12 Web: `/plataforma/academias/:id` per plataforma-04 — stats, plan picker with next-cycle caption and pending-change banner, Entrar como admin (role-gated), Suspender/Reativar
- [ ] PLT.13 Web: `/plataforma/planos` per plataforma-05 with derived "Mais assinado" and "Tudo do X" chips + novo/editar sheet per plataforma-06/07
- [ ] PLT.14 Web: `/plataforma/conta` per plataforma-12 + `/plataforma/equipe` per plataforma-10 (owner-only Convidar, role explainer) + `/plataforma/integracoes` per plataforma-11 (disabled switches)
