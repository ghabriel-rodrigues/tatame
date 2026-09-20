# 006 — Billing & Wallet (Phase 6)

Status: ready-for-agent
Personas covered: Aluno, Responsável, Admin da academia, Plataforma

## Problem Statement

Money is the one charter pillar with zero working surface. The aluno's Carteira tab is still the Phase-2 empty shell; the home "mensalidade em aberto" alert has no truth to point at; there is no Pix QR, no boleto, no cartão, no histórico. The responsável cannot see or pay a dependent's mensalidade. The admin opens the console and lands on an "Em construção" placeholder where the handoff's Visão financeira belongs — receita, inadimplência, previsão, gráfico de 6 meses, próximos vencimentos are all undrawn — and Configurações has nowhere to create the "planos de mensalidade para alunos" the whole billing loop starts from. The plataforma persona has no Faturamento e repasses screen, so the charter's repasse-retention rule for delinquent academies exists only as prose.

Underneath, the schema debts are explicit: the `academy_plan_id` columns on students and invites have been plain-uuid stubs since Phase 3, waiting for a plan catalog that doesn't exist; there are no charge, payment, or mandate tables; and the two resolved wayfinder tickets — the money/billing data model and the payment-provider architecture — are implementation contracts with no implementation. Until this slice lands, "SaaS for academies" is a product that cannot bill anyone.

## Solution

The billing slice implements the two resolved tickets verbatim. The data model lands as five tenant-scoped tables — `academy_plans` (the admin's mensalidade catalog: name, integer-cents value, recurrence, due day), `charges` (one receivable per student per cycle, origin-hardened to plan/event/order columns), `payments` (settlement attempts carrying provider ids and the render-ready Pix/boleto payloads), `payment_mandates` (the card "recorrência ativa" opt-in), and `billing_customers` (the Stripe Customer mapping, empty in v1) — plus additive provider columns on the platform tables and the composite-FK upgrade of the two `academy_plan_id` stubs.

Payments run through a single provider seam: a `PaymentProviderPort` in the payments infra (same pattern as the notifications driver), with a **simulated driver** as the only runtime provider in v1 and a compile-checked Stripe Connect stub waiting for the stage-2 swap. The simulated driver produces deterministic Pix QR/copia-e-cola and boleto linha-digitável payloads, and the handoff's "Simular pagamento" button becomes a real endpoint that synthesizes `payment.succeeded` through the exact handler the Stripe webhook will use — so the entire paid-flow (charge status, receipt, events, repasse read model) is exercised for real from day one.

Charges are never cron-generated: an idempotent materialization pass runs at every money-displaying entry point (aluno/responsável wallet, admin overview) and on an audited admin trigger, inserting the current cycle's plan charges against a partial-unique idempotency key and lazily flipping `open → overdue`. Delinquency stays two uncoupled derivations: a student is delinquent iff an open plan charge is past due; an academy is delinquent only via its SaaS subscription status — students not paying never make the academy delinquent.

On top of this the four client surfaces light up: the aluno Carteira (mensalidade card with Em aberto/Paga states, Pix/boleto/cartão sheets, recurrence banner, histórico) and the real home alert; the responsável Pagamentos (one card per dependent, Pix per child, consolidated histórico); the admin Visão financeira dashboard (hero receita card, 6-month chart, próximos vencimentos) and the Planos de mensalidade CRUD inside Configurações; and the plataforma Faturamento e repasses screen rendering the read-model query — gross, platform fee, net, and the Retido flag on delinquent academies. No money moves in v1; every number is real anyway.

## User Stories

### Aluno — Carteira

1. As an aluno, I want a Carteira screen showing my current mensalidade ("Mensalidade · agosto", R$ 180,00, "Vence em 10 de agosto") with an Em aberto or Paga status chip, so that my payment situation is one glance.
2. As an aluno, I want the Carteira header to show my plan's recurrence and value ("Plano mensal recorrente · R$ 180,00"), so that I know what I signed up for.
3. As an aluno with an open charge, I want a primary "Pagar com Pix" button and secondary "Boleto" and "Cartão" buttons on the mensalidade card, so that every payment method is two taps away.
4. As an aluno, I want a Histórico list of my settled charges (month, paid date, method, amount, green check), so that my payment record is always visible.
5. As an aluno, I want a receipt ("comprovante") available for every settled payment, so that I can prove I paid.
6. As an aluno with an active card mandate, I want a recurrence banner ("Cobrança recorrente ativa. A próxima mensalidade chega em 1 de setembro com aviso automático."), so that auto-pay is transparent, not silent.
7. As an aluno with an open mensalidade, I want the home "mensalidade em aberto" alert fed by real charge data and deep-linking into the Carteira, so that the design's placeholder finally tells the truth.
8. As an aluno with no assigned plan, I want the Carteira to show a clean empty state instead of fabricated charges, so that billing never invents money.

### Aluno — payment sheets

9. As an aluno, I want the Pix sheet ("Pagar com Pix" · "Mensalidade de agosto · Horizonte BJJ") with a QR code, the amount, and a "Copiar código Pix" copia-e-cola button, so that paying by Pix works like every Brazilian app.
10. As an aluno in the simulated environment, I want a "Simular pagamento" button on the Pix sheet that settles the charge instantly, so that the full paid-flow is demonstrable end to end.
11. As an aluno, I want the boleto sheet ("Boleto bancário") with barcode, linha digitável, "Copiar linha digitável", and "Simular compensação", so that boleto settlement (async in real life) is exercised the same way.
12. As an aluno, I want the cartão sheet with número, nome impresso, validade, CVV, and a "Usar este cartão na recorrência mensal" toggle above "Pagar R$ 180,00", so that card payment and recurrence opt-in are one gesture.
13. As an aluno who enabled the recurrence toggle, I want future cycles auto-settled at the due date by my mandate, so that "recorrência ativa" means I never think about it again.
14. As an aluno, I want to cancel my card recurrence from the Carteira, so that opting out is as easy as opting in.
15. As an aluno whose payment settles, I want the mensalidade card to flip to Paga with the success treatment, so that confirmation is immediate.
16. As an aluno of a delinquent (read-only) academy, I want payment actions to still work, so that the academy's debt to the platform never blocks me from paying mine.

### Responsável — Pagamentos

17. As a responsável, I want a Pagamentos screen with one card per dependent ("Pedro · agosto", R$ 150,00, "Vence em 10 de agosto · plano Kids mensal", Em aberto), so that each child's mensalidade is separately visible.
18. As a responsável, I want "Pagar com Pix" per dependent opening the Pix sheet addressed to that child ("Mensalidade de agosto · Pedro Silveira"), so that I pay the right charge.
19. As a responsável whose dependent's charge settled via card recurrence, I want the card to show Paga with "Pago em 02/08 via recorrência no cartão" and a "Ver comprovante" action, so that auto-paid children need no attention.
20. As a responsável, I want a consolidated Histórico across all dependents (child, month, date, method, amount), so that the family's payment record is one list.
21. As a responsável, I want the charges of my minor dependents billed to me (I am the payer of record), so that responsibility follows the guardian link.
22. As a responsável, I want each dependent card on my Filhos panel to keep its mensalidade alert fed by real data, so that delinquency is visible where I look daily.

### Admin — Visão financeira

23. As an academy admin, I want the console home to be the Visão financeira per the handoff — hero card with "RECEITA DE <MÊS>" and the month's received total, plus "no ano", "previsão <próximo mês>", and "inadimplência %" sub-stats — so that money is the first thing I see.
24. As an academy admin, I want a "Receita mensal" bar chart of the last 6 months with per-month values, so that the trend is visible without a report.
25. As an academy admin, I want a "Próximos vencimentos" section listing upcoming open charges grouped by due day, so that I know what money is arriving when.
26. As an academy admin, I want an inadimplência view derived from overdue open charges (which students, how much, since when), so that dunning has a target list.
27. As an academy admin, I want a "materialize charges" action that generates the current cycle's charges tenant-wide on demand, so that I never wait for a student to open their wallet to see the month's receivables.
28. As an academy admin, I want a full-refund action on a settled payment (audited), so that a wrong charge is correctable through the provider path, not by editing rows.

### Admin — Planos de mensalidade

29. As an academy admin, I want a "Planos de mensalidade" section in Configurações listing my plans and a "Novo plano" action, so that what my students subscribe to is configured in one place.
30. As an academy admin, I want the plan form with nome, valor, recorrência via chips (mensal/trimestral/semestral/anual), and vencimento via day chips (5/10/15), so that creating a plan matches the handoff exactly.
31. As an academy admin, I want to edit a plan or archive it (never hard-delete), so that history referencing the plan stays intact.
32. As an academy admin, I want to assign a plan to a student on the student form, so that materialization knows what to charge.
33. As an academy admin, I want invites to carry a plan so that invite-accepted students land already assigned, closing the Phase-1/3 stub.

### Plataforma — Faturamento e repasses

34. As a platform operator (owner/finance), I want a Faturamento e repasses screen with the SaaS totals ("assinaturas · mês" and "taxa de pagamento") and a per-academy repasse list (academy, period, student count, net amount), so that platform revenue is one screen.
35. As a platform operator, I want each repasse row flagged Repassado / Em trânsito / Retido, with delinquent academies always Retido ("assinatura vencida"), so that the charter's retention rule is visible truth.
36. As a platform operator, I want the repasse numbers computed as gross settled payments minus the platform fee (basis points from the academy's SaaS plan), so that the read model already reconciles what Connect will later move.
37. As a platform support user, I want the repasses screen denied to me, so that platform RBAC (finance-only money) holds.

### Integrity & cross-cutting

38. As the platform, I want every billing table tenant-scoped with forced RLS and composite tenant FKs, so that money never crosses academies.
39. As the platform, I want a professor to have zero billing routes — enforced by CI metadata assertions, not convention — so that "professor has no financial access" is structural.
40. As the platform, I want charge materialization idempotent under concurrency (unique-key upsert), so that two simultaneous wallet opens never double-bill a student.
41. As the platform, I want every charge lifecycle transition audited (`billing.charge.created/paid/refunded/canceled`, mandate created/canceled) with impersonation attribution, so that money history is accountable even though rows mutate.
42. As the platform, I want billing to emit domain events (created, paid, overdue with Pix deep link, refunded — guardian variants when a guardian is the payer) with notifications as a listener-only concern, so that dunning plugs in later without touching billing.
43. As the platform, I want the provider behind the port to be invisible to everything downstream of normalized events, so that the Stripe swap is a driver-only change.
44. As the platform, I want the "Simular pagamento" endpoint to exist only when the simulated provider is configured (404 otherwise), so that it is a driver affordance, never a production backdoor.

## Implementation Decisions

This spec implements two resolved tickets **verbatim** — the money/billing data model (database wayfinder ticket 05) and the payment-provider architecture (backend wayfinder ticket 05). Their decisions are restated here as the contract; neither is relitigated.

### The two-stage provider decision (recorded, not relitigated)

- **Stage 1 (this spec)**: a **simulated payment provider driver** — no Stripe API calls, no webhooks, deterministic payloads, instant settlement via the simulate endpoint. All provider columns are written with `provider = 'simulated'`.
- **Stage 2 (post-v1)**: **Stripe Connect destination charges** on a single platform account (student payments carry `transfer_data.destination` to the academy's connected account + `application_fee_amount`); repasse retention = pausing payouts; the platform→academy SaaS fee is plain Stripe Billing on the platform account. Every provider reference is a nullable text column + `payment_provider` enum (`simulated`, `stripe`) so the swap needs **no migration** — only additive enum values ever (`pagarme`/`mercadopago` stay drop-in alternatives if Stripe Pix in Brazil is still gated at swap time).

### Schema (implements database ticket 05 verbatim)

- **Seven new enums**: `billing_recurrence` (monthly/quarterly/semiannual/yearly — the handoff recurrence chips), `charge_origin` (plan/event/order), `charge_status` (open/paid/overdue/canceled/refunded), `payment_status` (pending/succeeded/failed/refunded), `payment_method` (pix/boleto/card), `payment_provider` (simulated/stripe), `mandate_status` (active/canceled).
- **`academy_plans`** (tenant-scoped, forced RLS): name, `amount_cents` integer, currency BRL default, recurrence, `due_day` smallint CHECK 1–28 (UI offers exactly the handoff chips 5/10/15; DB stays permissive so a new chip is not a migration), `is_active` soft archive, UNIQUE (tenant, name).
- **`charges`**: `student_id` (who the charge is about) + nullable `guardian_id` (bill-to for minors, denormalized at issuance; NULL = student pays self); origin hardened to **per-origin columns + CHECK** (exactly the column matching `origin` is non-null) — polymorphic bare uuid rejected; `period_start`/`period_end` competência + **partial UNIQUE (tenant, student, plan, period_start) WHERE origin='plan'** as the materialization idempotency key; `amount_cents`, `due_date`, `status` default open, `canceled_at`; index (tenant, status, due_date) for the admin overview and previsão. Lifecycle: `open → paid → refunded`; `open → overdue → paid|canceled`; `open → canceled`. **`overdue` is derived truth** (`open AND due_date < current_date`) — the column is flipped lazily by the materialization pass so dashboards can filter on it, but money-truth queries always use the predicate.
- **`payments`**: `charge_id`, method, status default pending, amount/currency; `provider` + `provider_payment_id` + `provider_data` jsonb (the snapshot clients render: Pix QR payload + copia-e-cola, boleto linha digitável + barcode) + partial UNIQUE (provider, provider_payment_id); `paid_at`, `receipt_url` (simulated driver renders an internal receipt route); refund columns `refunded_at`/`provider_refund_id`/`refund_reason` (full refund only in v1 — the handoff's "1 dia útil" is provider SLA copy, not schema).
- **`payment_mandates`**: student + `payer_user_id`, method (v1: card only), status, provider refs, partial UNIQUE (tenant, student) WHERE active. Charges are still materialized per cycle; an active mandate means the driver auto-settles them at due date.
- **`billing_customers`**: user↔provider-customer mapping, UNIQUE (tenant, user, provider) — one Stripe Customer per paying user per academy context. Created now so the swap is migration-free; **empty in v1** (the simulated driver never writes it).
- **Platform additions (additive columns)**: `academies.provider_account_id`; `academy_subscriptions.provider/provider_customer_id/provider_subscription_id`; `platform_plans.fee_bps` (platform take in basis points, NULL = 0 until product prices it — feeds the repasse read model).
- **Stub upgrades**: the plain-uuid `academy_plan_id` columns on students and invites become composite tenant FKs onto `academy_plans`; invite acceptance copies the invite's plan onto the created student.
- **Recorded delta**: `charges.event_registration_id` and `charges.order_id` ship as plain nullable uuid columns with the CHECK in place — the composite FKs are added by the events and store slices when their tables exist (same hardening pattern as the Phase-3 `invites.class_id` migration). Only plan charges are materialized in v1.
- Charges and payments are **not** append-only tables (status mutates); money truth is protected by the audit trail plus provider ids instead.

### Provider seam (implements backend ticket 05 verbatim)

The `billing` domain module is the **only** consumer of a `PaymentProviderPort` in the payments infra (same port/driver/config-factory pattern as the notifications seam); it never imports a provider SDK. Port shape from the resolved ticket (decision-precise, inlined):

```ts
interface PaymentProviderPort {
  createPixCharge(
    i,
  ): Promise<{ providerPaymentId; qrPayload; copiaECola; expiresAt }>;
  createBoletoCharge(
    i,
  ): Promise<{ providerPaymentId; linhaDigitavel; barcodePayload; dueDate }>;
  createCardCharge(
    i /* + mandateId? */,
  ): Promise<{ providerPaymentId; status }>;
  createMandate(i): Promise<{ providerMandateId }>;
  refund(providerPaymentId): Promise<{ providerRefundId }>;
  verifyAndParseWebhook(rawBody, signature): ProviderEvent[];
}
```

`ProviderEvent` is a small normalized union (`payment.succeeded | payment.failed | payment.refunded | subscription.past_due | subscription.active`). The billing service consumes **only** normalized events — simulated endpoint or future Stripe webhook is invisible downstream.

- **`SimulatedPaymentProvider`** (the only runtime driver): deterministic, network-free payloads keyed by charge id (copia-e-cola `TATAME-SIM-PIX-<chargeId>`, linha digitável from a fixed template + amount + due date), stored in `payments.provider_data`. Card charge with an active mandate settles inline at creation; refund emits `payment.refunded` instantly.
- **Simulate endpoint** — the handoff's "Simular pagamento" / "Simular compensação" button: `POST /v1/billing/payments/:id/simulate`, allowed to aluno/responsável roles, `@BypassReadOnly`, **enabled only when the simulated provider is configured** (404 otherwise). It synthesizes `payment.succeeded` through the same normalized-event handler the Stripe webhook will use.
- **`StripePaymentProvider`**: compile-checked stub with SDK dependency and config keys, selected only by provider config; the webhook route, `provider_webhook_events` dedup table, and Stripe CLI forwarding land **with the swap**, not now.

### Charge materialization: on-read + manual trigger (no cron in v1)

1. An idempotent `ensureCurrentCycleCharges` pass runs at every money-displaying entry point — aluno/responsável wallet fetch (own charges), admin financial overview (tenant-wide, capped/paginated). Insert-on-conflict-do-nothing against the partial unique key; the same pass flips `open → overdue` where past due. Events `billing.charge.created`/`billing.charge.overdue` are emitted **only** for rows actually inserted/flipped.
2. `POST /v1/admin/billing/charges/materialize` (admin role, audited) runs the tenant-wide pass on demand — the ops lever and the test seam.
3. A real nightly cron is deferred to the infra map; when it exists, the same idempotent pass is scheduled and nothing in the module changes.

- Plan charges materialize only for active students with an assigned active plan; `due_date` comes from the plan's `due_day` within the cycle's competência; charge subtitle data (month name, plan name) is derived client-side from the payload.

### Delinquency — two uncoupled derivations

- **Student-level** (Carteira alert, home alert, admin inadimplência, dunning event): purely derived — a student is delinquent iff an open plan charge is past due. No column.
- **Academy-level** (SaaS): `academy_subscriptions.status='past_due'` ⇒ academy delinquent ⇒ read-only mode + repasse retention. Set only by the platform billing flow (platform admin action in v1, webhook at Stripe stage). **Students not paying never make the academy delinquent.** Payment-flow routes (pay, simulate, mandate) carry `@BypassReadOnly` so students of a read-only academy can still pay.

### Admin aggregates (Visão financeira)

- **Receita mensal/anual**: sum of succeeded payments by `paid_at` in the tenant timezone (month hero + "no ano" + the 6-month bar series). Derived on read, no caching, no jobs — the established doctrine.
- **Previsão (next month)**: sum of open charges due in the target month after the tenant-wide materialization pass (so the forecast reflects every plan, not just wallets already opened).
- **Inadimplência %**: overdue-open amount ÷ total materialized plan-charge amount for the current month, by value — matching the hero sub-stat.
- **Próximos vencimentos**: upcoming open charges ordered/grouped by due date (the handoff's day-5/10/15 chips), with count and amount per group.

### Repasses (read-model only)

`GET /v1/platform/billing/repasses` — platform roles owner/finance only. Pure query: gross = settled payments per academy per period; fee = gross × the academy's SaaS plan `fee_bps`; net = gross − fee; `withheld: true` when the academy is delinquent. Status labels map: withheld → Retido; settled periods → Repassado; current period → Em trânsito. No ledger writes, no money movement; at Stripe stage the same view reconciles Connect transfers/payouts.

### Events, audit, authorization

- Billing emits domain events; notifications stay listener-only (delivery is a later slice): `billing.charge.created`, `billing.charge.paid` (receipt), `billing.charge.overdue` (dunning payload carries the Pix deep link into the Carteira sheet), `billing.charge.refunded` — guardian variants address the responsável when the charge has a bill-to guardian.
- New audit action codes on the existing audit seam, in-transaction: `billing.charge.created/paid/refunded/canceled`, `billing.mandate.created/canceled`; the admin materialize trigger and refund are audited with impersonation attribution.
- Everything lands in a new `billing` module behind the existing guard chain (default-deny roles, academy-status guard, RLS backstop); foreign charge/payment ids are 404, never 403. CI route-metadata assertions per the established pattern: no professor route exists in billing; payment-flow endpoints carry `@BypassReadOnly`; the future webhook route is `@Public`.
- Endpoint surface (versioned prefix, generated into the OpenAPI spec):

| Endpoint                                          | Role                     | Purpose                                                                                         |
| ------------------------------------------------- | ------------------------ | ----------------------------------------------------------------------------------------------- |
| `GET /aluno/wallet`                               | student                  | plan header, current-cycle charge (materializes), recurrence banner, histórico                  |
| `POST /aluno/wallet/charges/:id/payments`         | student                  | create payment attempt (pix/boleto/card; card accepts the mandate toggle)                       |
| `DELETE /aluno/wallet/mandate`                    | student                  | cancel card recurrence                                                                          |
| `GET /responsavel/payments`                       | guardian                 | per-dependent current charges + consolidated histórico (materializes)                           |
| `POST /responsavel/payments/charges/:id/payments` | guardian                 | pay a dependent's charge (same methods)                                                         |
| `POST /billing/payments/:id/simulate`             | student, guardian        | simulated settlement (404 unless simulated provider)                                            |
| `GET /billing/payments/:id/receipt`               | student, guardian, admin | comprovante render                                                                              |
| `GET /admin/billing/overview`                     | admin                    | receita mês/ano, previsão, inadimplência %, 6-month series, próximos vencimentos, inadimplentes |
| `GET/POST/PATCH /admin/billing/plans` (+ archive) | admin                    | planos de mensalidade CRUD                                                                      |
| `POST /admin/billing/charges/materialize`         | admin                    | tenant-wide materialization (audited)                                                           |
| `POST /admin/billing/payments/:id/refund`         | admin                    | full refund via provider port (audited)                                                         |
| `GET /platform/billing/repasses`                  | platform owner/finance   | repasse read model                                                                              |

- Existing endpoints extended, not duplicated: aluno home gains the real mensalidade-em-aberto flag + charge deep-link data; responsável dependents keep their per-child alert fed by the same derivation; admin student create/update accepts `academyPlanId`; invite create accepts a plan and invite-accept persists it.
- New stable problem+json codes: charge not payable (already paid/canceled), method-mandate mismatch, mandate already active, refund on unsettled payment, simulate unavailable (when not 404-hidden), plan archived/invalid on assignment.

### Client scope split

- **Web (admin console + plataforma)**: the admin index route becomes the Visão financeira per admin-02 (hero receita card with sub-stats, 6-month bar chart, stat tiles, próximos vencimentos, inadimplência) — replacing the "Em construção" shell; a Configurações area hosting the "Planos de mensalidade" section per admin-15 (list + Novo plano sheet with recurrence and due-day chips, edit, archive) — the rest of Configurações (identidade, permissões toggles UI, integrações) stays owned by its own slice; the student form gains the plan select. The plataforma surface gains the Faturamento e repasses screen per plataforma-09 (SaaS totals tiles + per-academy repasse list with Repassado/Em trânsito/Retido), replacing that shell route.
- **Mobile (RN, Android, iOS)** carries the aluno and responsável experiences: Carteira per aluno-12 (mensalidade card + status chip, Pagar com Pix / Boleto / Cartão, recurrence banner, histórico) replacing the Phase-2 shell, the three payment sheets per aluno-13/14/15 (Pix QR + copia-e-cola + Simular pagamento; boleto barcode + linha digitável + Simular compensação; cartão form + recurrence toggle) with the success pop, the real home mensalidade alert; responsável Pagamentos per responsavel-04/05 (per-dependent cards with plan subtitle, Pix per child, Ver comprovante, consolidated histórico). The simulate button renders only when the API reports the simulated provider. Each platform is a tracked parity task.

## Testing Decisions

- Same doctrine as specs 001–005 (their suites are the prior art): tests exercise external behavior through the API against a real Postgres with RLS active; assertions on status codes, stable error codes, and observable state — never on SQL or driver internals.
- The e2e suite runs the **full paid-flow over the simulated driver**: wallet fetch materializes exactly one charge per student per cycle (repeat fetches insert nothing; concurrent fetches race safely on the unique key); pay-by-Pix → simulate → charge paid + receipt + `billing.charge.paid` event + audit row; boleto compensação via the same endpoint; card with mandate toggle creates the mandate and settles inline; next-cycle materialization auto-settles under an active mandate; mandate cancel stops auto-settlement.
- **Contract tests pin the normalized-event handler** (succeeded/failed/refunded transitions, idempotent re-delivery via the provider-payment unique key) so the Stripe swap is a driver-only PR.
- Lifecycle and derivation fixtures: overdue flip is lazy but the predicate is truth (a stale column never leaks into money aggregates); refund sets payment + charge refunded; canceled charges leave history intact; aggregates (receita, previsão, inadimplência %, 6-month series, vencimento groups) asserted against seeded fixtures in the tenant timezone; repasse math asserted including `fee_bps` NULL→0 and the withheld flag on a delinquent academy.
- RBAC + RLS: professor hitting any billing route → 403 and the CI metadata assertion proves no professor route exists; cross-tenant charge/payment/plan ids → 404; platform support denied repasses; read-only academy blocks plan CRUD but not payment/simulate routes; simulate returns 404 when the provider is not simulated; guardian can pay only own dependents' charges.
- Web: component tests for the overview dashboard states (loading/empty/data), the plan form chip state machine, and the repasse status mapping — mocking the HTTP layer per the established pattern.
- Mobile: pure-logic tests for wallet state mapping (open/paid/overdue chip, recurrence banner, simulate-button gating) and one integration test per client for the Pix pay → simulate → Paga round trip.

## Out of Scope

- Real Stripe: the Connect swap, webhook endpoint + signature verification, `provider_webhook_events` dedup table, Stripe CLI forwarding, and `billing_customers` population — all stage 2, a driver-only PR by construction.
- Store and event charges: `charge_origin` and the origin columns are wired, but only plan charges are materialized; event-pago and store-Pix flows belong to their slices (which will also add the origin FKs).
- Notifications delivery: billing emits events only; the notification pipeline (push, e-mail, the "aviso automático" copy) is its own slice.
- Estorno UI: the audited admin refund endpoint ships; no client screen exposes it in v1. Partial refunds and any money ledger stay out entirely.
- Platform SaaS billing beyond the repasses read model: academy subscription invoicing/automation, plan-change proration, and academy-status management UI are owned by the platform slice; v1 reads existing statuses.
- Scheduled jobs: no cron, no dunning scheduler — materialization is on-read + manual trigger until the infra map lands jobs.
- Pix/boleto mandates (card-only recurrence in v1), multi-currency (BRL only), and payment-integration toggles UI ("Integrações de pagamento" row stays a stub owned by the config slice).
- The professor "Paga mensalidade" tile stays a render-only placeholder: the charter denies professors financial access, and no professor billing route exists — recorded, not silently dropped.

## Further Notes

- This spec implements the two resolved wayfinder tickets verbatim — database 05 (money/billing model, two-stage provider decision, schema shapes, delinquency derivations, repasse read model) and backend 05 (provider port, simulated driver, simulate endpoint, materialization strategy, events, repasses endpoint); both should be marked as consumed pointing here.
- Recorded deltas against the tickets: `charges.event_registration_id`/`order_id` land as plain uuid columns pending the events/store tables (hardening pattern precedent: Phase-3 invite `class_id`); the plan select on the admin student form and plan-on-invite persistence are the concrete closure of the composite-FK stub upgrade.
- UI truth: aluno-12/13/14/15 (Carteira, Pix, boleto, cartão sheets), responsavel-04/05 (Pagamentos, Pix per dependent), admin-02 (Visão financeira), admin-15 (Planos de mensalidade in Configurações), plataforma-09 (Faturamento e repasses) — recreated pixel-faithful with Lumira tokens; QR codes via a real QR lib rendering the simulated payload; no hardcoded colors.
- PT-BR labels (Carteira, Em aberto, Paga, Pagar com Pix, Copiar código Pix, Simular pagamento, Boleto bancário, Copiar linha digitável, Simular compensação, Usar este cartão na recorrência mensal, Ver comprovante, Próximos vencimentos, Planos de mensalidade, Faturamento e repasses, Repassado/Em trânsito/Retido) are client copy; schema, enums, event names, and audit actions stay English per charter.
- Amounts are integer cents everywhere in schema and API; clients format `R$` in pt-BR locale.
- Delivery follows the fixed order DB → backend → web → mobiles; the checklist below is mirrored into the root README, and checking a box there is the only "ticket closing" this project has.

## Delivery Checklist

- [ ] BIL.1 DB: 7 billing enums + academy_plans (amount_cents, recurrence, due_day CHECK 1–28, is_active soft archive, UNIQUE tenant+name) with forced tenant RLS
- [ ] BIL.2 DB: charges — per-origin columns + CHECK (plan FK now, event/order plain uuid pending their slices), guardian bill-to, competência + partial-unique materialization key, lazy-overdue lifecycle, (tenant, status, due_date) index, forced RLS
- [ ] BIL.3 DB: payments (provider refs + provider_data snapshot + receipt + refund columns, provider partial unique) + payment_mandates (single-active partial unique) + billing_customers (empty in v1), forced RLS
- [ ] BIL.4 DB: additive platform columns (academies.provider_account_id, academy_subscriptions provider trio, platform_plans.fee_bps) + composite-FK upgrade of students.academy_plan_id and invites.academy_plan_id onto academy_plans
- [ ] BIL.5 DB: dev seeds — plans per fixture academy, open/paid/overdue charge histories with mixed-method payments, an active card mandate, a delinquent-academy fixture for repasses
- [ ] BIL.6 Backend: payments infra seam — PaymentProviderPort + SimulatedPaymentProvider (deterministic Pix/boleto payloads in provider_data, mandate inline settle, instant refund) + compile-checked Stripe stub + provider config factory
- [ ] BIL.7 Backend: billing module — idempotent ensureCurrentCycleCharges (on-read at wallet/admin entry points, open→overdue flip, events only for inserted/flipped rows) + audited admin materialize trigger, no cron
- [ ] BIL.8 Backend: aluno wallet — GET payload (plan header, current charge, recurrence banner, histórico, empty state), payment creation per method, mandate create-on-toggle/cancel, simulate endpoint (@BypassReadOnly, 404 unless simulated) settling through the normalized-event handler, receipt route, home alert flag
- [ ] BIL.9 Backend: responsável payments — per-dependent charges with guardian bill-to addressing, pay + Pix per dependent, consolidated histórico, dependent-card alert data
- [ ] BIL.10 Backend: admin — overview aggregates (receita mês/ano, previsão pós-materialização, inadimplência % by value, 6-month series, próximos vencimentos groups, inadimplentes), plans CRUD + student/invite plan assignment, audited full-refund endpoint
- [ ] BIL.11 Backend: platform repasses read model (gross − fee_bps = net, withheld on delinquent) gated owner/finance + billing.* domain events with guardian variants + audit action codes + CI assertions (no professor billing route, payment routes @BypassReadOnly)
- [ ] BIL.12 Backend: e2e suite green — materialization idempotency/race, full simulated paid-flow (Pix/boleto/cartão + mandate auto-settle), normalized-event contract tests, refund, aggregates & repasse math, RBAC/RLS/404s, read-only bypass on payment routes, simulate 404 gating
- [ ] BIL.13 Web: admin Visão financeira per admin-02 replacing the index shell — hero receita card (mês, no ano, previsão, inadimplência %), 6-month bar chart, próximos vencimentos, inadimplência list
- [ ] BIL.14 Web: admin Planos de mensalidade in Configurações per admin-15 — list + Novo plano/edit sheet (nome, valor, recorrência chips, vencimento chips 5/10/15), archive, student-form plan select
- [ ] BIL.15 Web: plataforma Faturamento e repasses per plataforma-09 — SaaS totals tiles + per-academy repasse list with Repassado/Em trânsito/Retido from the read model
- [ ] BIL.16 RN: aluno Carteira per aluno-12 (mensalidade card with Em aberto/Paga chip, plan header, recurrence banner, histórico, empty state) replacing the shell + real home mensalidade alert with Carteira deep link
- [ ] BIL.17 RN: payment sheets per aluno-13/14/15 — Pix QR + copia-e-cola + Simular pagamento (gated), boleto linha digitável + barcode + Simular compensação, cartão form + recurrence toggle — success pop, Ver comprovante
- [ ] BIL.18 RN: responsável Pagamentos per responsavel-04/05 — per-dependent charge cards with plan subtitle, Pix per dependent, Ver comprovante, consolidated histórico + dependent-card alerts
- [ ] BIL.19 Android: aluno Carteira + real home mensalidade alert
- [ ] BIL.20 Android: payment sheets (Pix/boleto/cartão + recurrence toggle, simulate gating, success pop, comprovante)
- [ ] BIL.21 Android: responsável Pagamentos + Pix per dependent + consolidated histórico
- [ ] BIL.22 iOS: aluno Carteira + real home mensalidade alert
- [ ] BIL.23 iOS: payment sheets (Pix/boleto/cartão + recurrence toggle, simulate gating, success pop, comprovante)
- [ ] BIL.24 iOS: responsável Pagamentos + Pix per dependent + consolidated histórico
