# Money & billing model (incl. Stripe object mapping)

Type: grilling
Blocked by: 03
Status: resolved

## Question

What is the schema for money across both plan levels — platform→academy subscriptions (Essencial/Pro/Black; plan change applies next billing cycle; delinquency → withheld repasses + read-only; suspension blocks access) and academy→student plans (name, value, recurrence; monthly cobranças with status, due date, recurrence, receipt; Pix/boleto/card methods) — plus store orders and paid event registrations? Decide: how local tables map to Stripe objects (Customer, Subscription, Invoice, PaymentIntent, Connect accounts for repasses?), what is mirrored locally vs read from Stripe, currency/amount representation (integer cents), charge status lifecycle, and how repasse retention for delinquent academies is recorded.

## Answer

Resolved by BOSS per charter (`agents/boss.md`), consistent with tickets 02 (RLS classes), 03 (shells: integer cents, composite FKs) and 06 (audit actions). Handoff truth: Carteira (R$ 180 mensalidade, Pix QR + copia-e-cola, boleto linha digitável, cartão + recorrência, histórico), Admin Visão (receita, inadimplência, previsão, vencimentos dia 5/10/15 chips), plataforma faturamento/repasses com retenção de inadimplente, estorno em 1 dia útil, botão "Simular pagamento" nos protótipos.

### The two-stage provider decision (recorded explicitly — do not relitigate)

- **Stage 1 (v1, ships with spec 006)**: a **SIMULATED payment provider driver** (same pattern as the Resend `ConsoleNotificationDriver` in `apps/api/src/infra/notifications/`). No Stripe API calls, no webhooks, instant/deterministic settlement via a dev "simular pagamento" endpoint. All provider columns below are written with `provider = 'simulated'`.
- **Stage 2 (post-v1 swap)**: **Stripe Connect with destination charges** on a single platform Stripe account — each academy gets a connected account; a student/guardian payment is a PaymentIntent on the platform account with `transfer_data.destination` = the academy's connected account and `application_fee_amount` = platform fee; repasse retention for delinquent academies = pausing payouts/transfers on the connected account. The platform→academy SaaS fee itself is a plain Stripe Billing subscription on the platform account (NOT Connect).
- **Why Connect over single-account + internal ledger**: the charter's repasse-retention rule is native in Connect (hold payouts) and a hand-rolled money ledger is exactly the kind of liability v1 must not carry; Connect adds zero v1 cost because v1 is simulated anyway. Known gap: Stripe Pix in Brazil is limited-availability — the simulated driver hides this in v1, and the `payment_provider` enum is extensible (`pagarme`/`mercadopago` can implement the same port if Stripe Pix is still gated at swap time).
- **Schema consequence**: every provider reference below is a **nullable text column + `payment_provider` pgEnum (`simulated`,`stripe`)** so Stripe swaps in **without migration** (only additive enum values ever).

### New enums (`enums.ts`)

- `billing_recurrence`: `monthly`, `quarterly`, `semiannual`, `yearly` — the handoff "recorrência via chips" (mensal/trimestral/…).
- `charge_origin`: `plan`, `event`, `order` (per 03).
- `charge_status`: `open`, `paid`, `overdue`, `canceled`, `refunded` (03's `pending` renamed `open` — the shells were declared fixed but unbuilt; renaming pre-implementation is free and matches the Carteira "Em aberto" label).
- `payment_status`: `pending`, `succeeded`, `failed`, `refunded` (attempt lifecycle; Pix/boleto are async at Stripe stage).
- `payment_method`: `pix`, `boleto`, `card`.
- `payment_provider`: `simulated`, `stripe`.
- `mandate_status`: `active`, `canceled`.

### Tables (all tenant-scoped, RLS class 1, composite `(tenant_id, …)` FKs per 03)

**academy_plans** — academy→student plan catalog ("planos de mensalidade para alunos").
- `id` · `tenant_id` · `name` text NOT NULL · `amount_cents` integer NOT NULL · `currency` char(3) DEFAULT 'BRL' · `recurrence` billing_recurrence NOT NULL · `due_day` smallint NOT NULL, CHECK `BETWEEN 1 AND 28` (no Feb problems; the admin UI offers exactly the handoff chips 5/10/15 — DB stays permissive so adding a chip is not a migration) · `is_active` boolean DEFAULT true (soft archive, per 03 shell) · timestamps · UNIQUE (`tenant_id`,`name`).
- Follow-up for spec 006: upgrade the plain-uuid `academy_plan_id` stubs in `enrollment.ts` (students) and `tenancy.ts` (invites) to composite FKs → this table.

**charges** — one receivable ("cobrança"), any origin.
- `id` · `tenant_id` · `student_id` composite FK NOT NULL (who the charge is *about*) · `guardian_id` composite FK→guardians NULL (bill-to for minors, denormalized at issuance; NULL = student pays self).
- **Origin hardened to per-origin FKs** (settles 03's open question — polymorphic bare uuid rejected): `origin` charge_origin NOT NULL + `academy_plan_id` composite FK NULL + `event_registration_id` composite FK NULL + `order_id` composite FK NULL + CHECK (exactly the column matching `origin` is NOT NULL). Real FK integrity beats a generic `origin_id`.
- Recurrence linkage: `period_start` date NULL / `period_end` date NULL (competência of a plan cycle) + **partial UNIQUE (`tenant_id`,`student_id`,`academy_plan_id`,`period_start`) WHERE origin = 'plan'** — this is the idempotency key for charge materialization (backend ticket 05).
- `amount_cents` NOT NULL · `currency` · `due_date` date NOT NULL (from plan `due_day` for plan charges) · `status` charge_status DEFAULT 'open' · `canceled_at` timestamptz NULL · timestamps.
- Lifecycle: `open → paid → refunded`; `open → overdue → paid|canceled`; `open → canceled`. **`overdue` is derived truth** (`status='open' AND due_date < current_date`); the column is flipped lazily by the same idempotent materialization pass (backend 05) so dashboards can filter on the column, but queries computing money truth always use the predicate, never trust the flip having run.
- Index (`tenant_id`,`status`,`due_date`) per 03 (admin financial overview + previsão de recebimentos).

**payments** — one settlement attempt against a charge.
- `id` · `tenant_id` · `charge_id` composite FK NOT NULL · `method` payment_method NOT NULL · `status` payment_status DEFAULT 'pending' · `amount_cents` NOT NULL · `currency`.
- Provider refs: `provider` payment_provider NOT NULL · `provider_payment_id` text NULL (Stripe: `pi_…`; simulated: generated) · `provider_data` jsonb NULL (snapshot of what the client renders: Pix QR payload + copia-e-cola, boleto linha digitável + barcode; deterministic strings from the simulated driver) · partial UNIQUE (`provider`,`provider_payment_id`) WHERE NOT NULL (webhook idempotency).
- Settlement/receipt: `paid_at` timestamptz NULL · `receipt_url` text NULL (comprovante; simulated driver renders an internal receipt route).
- Refund (estorno, full-only in v1 — 1 business day is provider SLA, not schema): `refunded_at` timestamptz NULL · `provider_refund_id` text NULL · `refund_reason` text NULL. A refund sets payment `refunded` + charge `refunded` + audit `billing.charge.refunded` (06's audit_logs, new action codes `billing.charge.created/paid/refunded/canceled`). Partial refunds/ledger: out of scope v1.

**payment_mandates** — card recurrence opt-in ("recorrência ativa" toggle).
- `id` · `tenant_id` · `student_id` composite FK NOT NULL · `payer_user_id` FK→users NOT NULL · `method` payment_method NOT NULL (v1: `card` only) · `status` mandate_status DEFAULT 'active' · `provider` · `provider_mandate_id` text NULL (Stripe: PaymentMethod/SetupIntent id) · `canceled_at` · timestamps · partial UNIQUE (`tenant_id`,`student_id`) WHERE status='active'. Charges are still materialized per cycle; an active mandate just means the provider driver auto-settles them at due date.

**billing_customers** — Stripe Customer mapping, created now so the swap is migration-free.
- `id` · `tenant_id` · `user_id` FK→users NOT NULL · `provider` · `provider_customer_id` text NOT NULL · UNIQUE (`tenant_id`,`user_id`,`provider`). **Topology decided: one Stripe Customer per paying user per academy connected context** (BOSS bias confirmed — a guardian paying in two academies is two Customers; Customers live under the platform account with destination charges, so tenant-scoping the row keeps contexts clean). Empty in v1 (simulated driver never writes it).

### Platform-level additions (RLS class 2, additive columns)

- `academies`: + `provider_account_id` text NULL (Stripe connected account `acct_…`).
- `academy_subscriptions`: + `provider` payment_provider NULL · `provider_customer_id` text NULL · `provider_subscription_id` text NULL (Stripe Billing on the platform account). Status mapping: Stripe `past_due` → local `past_due` → `academies.status='delinquent'`; local DB is source of truth for access control, Stripe is source of truth for money events (mirrored via webhook, never read in request path).
- `platform_plans`: + `fee_bps` integer NULL (platform take on academy revenue, basis points; NULL = 0 until product prices it). Feeds the repasse read model.

### Delinquency — two separate derivations (decided: they never couple)

1. **Student-level delinquency** (feeds Carteira alert, admin inadimplência list, cobrança automática): purely **derived**, no column — a student is delinquent iff EXISTS charge with `origin='plan' AND status='open' AND due_date < current_date`. Automatic dunning = notification event with Pix deep link (backend 05).
2. **Academy-level delinquency** (SaaS): `academy_subscriptions.status='past_due'` ⇒ `academies.status='delinquent'` ⇒ read-only mode + repasse retention (charter). Set only by the platform billing flow (webhook at Stripe stage, platform admin action in v1). **Students not paying an academy NEVER makes the academy delinquent** — those are different creditors.

### Repasses (v1: read-model only)

No repasse/ledger table in v1. Repasse = query over `payments` (`succeeded`, joined to charges/tenant): gross = sum of settled charges per academy per period; platform fee = gross × `platform_plans.fee_bps`; net = gross − fee; `withheld = (academies.status = 'delinquent')` flag on the read model — no money moves in v1, the plataforma faturamento/repasses screen renders this query. At Stripe stage the same numbers become Connect transfers/payouts and retention becomes payout pausing; the read model stays as the reconciliation view.

### Implications for spec 006

- Implement in `packages/db`: the 5 new tables + 7 enums + additive columns above; upgrade the two `academy_plan_id` uuid stubs to composite FKs; RLS policies per class-1 template; index set as listed.
- Backend consumes this via backend ticket 05 (PaymentProviderPort, simulated driver, materialization job strategy, webhook seam).
- Audit: new action codes `billing.charge.created/paid/refunded/canceled`, `billing.mandate.created/canceled` on 06's audit_logs; charges/payments are NOT append-only tables (status mutates), money truth is protected by the audit trail + provider ids instead.
