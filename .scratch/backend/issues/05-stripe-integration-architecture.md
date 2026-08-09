# Stripe integration architecture

Type: research
Blocked by: 01, 04
Status: resolved

## Question

How should Stripe be integrated architecturally (sandbox/test mode from day one)? Research and define: the webhook endpoint design (signature verification, idempotent event handling, which events to consume), how the 2-level billing model runs on Stripe — platform→academy subscriptions (plan change next cycle, trial, delinquency, suspension) and academy→student charges (Pix, boleto, card recurrence; note Pix/boleto availability in Stripe Brazil and any gap this creates), whether Stripe Connect is used for academy repasses and delinquency-withholding, the module seam (single billing/payments module wrapping the Stripe SDK), and local-dev webhook strategy (Stripe CLI forwarding). Consumes the money/billing schema from the database map (ticket 05 there).

## Answer

Resolved by BOSS per charter. Consumes database ticket 05 (money schema, **two-stage provider decision**: v1 = simulated driver, stage 2 = Stripe Connect destination charges — recorded there, not relitigated here), backend 01 (module layout, event-emitter rules), 03 (`@Public`/`@BypassReadOnly`), 04 (REST/OpenAPI, problem+json).

### Module seam: `PaymentProviderPort` in `infra/payments/`

Same pattern as the Resend seam (`infra/notifications/`): a port interface + driver chosen by config factory. The `billing` domain module is the ONLY consumer; it never imports a provider SDK.

```ts
interface PaymentProviderPort {
  createPixCharge(i: ChargeIntent): Promise<{ providerPaymentId; qrPayload; copiaECola; expiresAt }>;
  createBoletoCharge(i: ChargeIntent): Promise<{ providerPaymentId; linhaDigitavel; barcodePayload; dueDate }>;
  createCardCharge(i: ChargeIntent & { mandateId? }): Promise<{ providerPaymentId; status }>;
  createMandate(i: MandateIntent): Promise<{ providerMandateId }>;      // card recurrence opt-in
  refund(providerPaymentId): Promise<{ providerRefundId }>;             // estorno, full-only v1
  verifyAndParseWebhook(rawBody: Buffer, signature: string): ProviderEvent[]; // normalized events
}
```

`ProviderEvent` is a small normalized union (`payment.succeeded | payment.failed | payment.refunded | subscription.past_due | subscription.active`, each carrying provider ids). The billing service consumes ONLY normalized events — whether they came from the Stripe webhook or the simulated endpoint is invisible downstream, so the entire paid-flow (charge status, receipt, notifications, repasse read model) is exercised for real in v1.

### v1 driver: `SimulatedPaymentProvider`

- Deterministic, network-free payloads keyed by charge id (e.g. copia-e-cola `TATAME-SIM-PIX-<chargeId>`, boleto linha digitável derived from a fixed template + amount + due date) stored in `payments.provider_data` — the four clients render real-looking Pix QR/boleto screens from day one.
- **Settlement = the handoff "Simular pagamento" button**: `POST /v1/billing/payments/:id/simulate` — `@BypassReadOnly()`, allowed to aluno/responsável roles, **enabled only when `PAYMENTS_PROVIDER=simulated`** (route returns 404 otherwise; it is a driver affordance, not a dev backdoor left in prod). It synthesizes `payment.succeeded` and pushes it through the exact same handler the Stripe webhook will use. Boleto "compensação simulada" = same endpoint; card charge with active mandate settles inline at creation.
- Refund: instant `payment.refunded` (the "1 dia útil" of the handoff is provider SLA copy, not v1 behavior).

### Stripe driver: wired stub, swap-ready

- `StripePaymentProvider` class exists with the SDK dependency and config (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`) but is only selected when `PAYMENTS_PROVIDER=stripe`; until then it is compile-checked, not runtime-reachable.
- **Webhook route**: `POST /v1/billing/webhooks/stripe` — `@Public()` + raw-body Stripe signature verification (per backend-03; Nest `rawBody: true` on the bootstrap for this route). Never bearer-authenticated. Answers 2xx fast, processes via the normalized-event handler.
- **Idempotency**: two layers — `payments` partial UNIQUE (`provider`,`provider_payment_id`) from db-05, plus a `provider_webhook_events` dedup table (event id PK, processed_at) that lands WITH the Stripe swap (simulated driver needs none). Events consumed at swap: `payment_intent.succeeded/payment_failed`, `charge.refunded`, `customer.subscription.updated/deleted`, `invoice.payment_failed` (platform SaaS side).
- Platform→academy SaaS billing runs as plain Stripe Billing subscriptions on the platform account; `invoice.payment_failed` → `academy_subscriptions.past_due` → `academies.status='delinquent'` (read-only + retention per charter). Local-dev webhooks via Stripe CLI forwarding — deferred to the swap; v1 needs none.
- Pix-availability gap in Stripe BR is acknowledged in db-05; the port keeps `pagarme`/`mercadopago` as drop-in alternatives.

### Charge generation: idempotent materialization on read + manual trigger (no cron in v1)

Decision per BOSS bias — a cron is infra the v1 doesn't have yet, and materialization is cheap and idempotent thanks to db-05's partial unique key (`tenant_id`,`student_id`,`academy_plan_id`,`period_start`):

1. **On-read materialization**: an idempotent `ensureCurrentCycleCharges(studentIds | tenant)` service pass runs at the entry points that display money — aluno/responsável wallet fetch (their own charges), admin financial overview (tenant-wide, capped/paginated). `INSERT … ON CONFLICT DO NOTHING` against the unique key; the same pass flips `open → overdue` where `due_date < current_date`. Emits `billing.charge.created`/`billing.charge.overdue` only for rows actually inserted/flipped.
2. **Manual admin trigger**: `POST /v1/admin/billing/charges/materialize` (admin role, audited) — runs the tenant-wide pass on demand; doubles as the ops lever and the test seam.
3. **Real cron deferred to the infra map** (added there as fog): when scheduled jobs exist, the same idempotent pass becomes a nightly job and dunning notifications gain scheduling; nothing in the module changes.

### Notification hooks (backend-01 event rules)

Billing emits domain events; `notifications` stays listener-only: `billing.charge.created` (nova cobrança), `billing.charge.paid` (comprovante/receipt), `billing.charge.overdue` (**cobrança automática da inadimplência**: notification carries the Pix deep link into the Carteira payment sheet), `billing.charge.refunded`. Guardian variants address the responsável when `charges.guardian_id` is set.

### Repasses (read-model only in v1)

`GET /v1/platform/billing/repasses` — platform controller in `billing`, `@Roles` platform `owner`/`finance` (per backend-03). Pure query per db-05: gross settled payments per academy per period − `platform_plans.fee_bps` fee = net; `withheld: true` when `academies.status='delinquent'` (charter retention rule). No money movement, no ledger writes; at Stripe stage the same view reconciles Connect transfers/payouts.

### Implications for spec 006

- Build: `infra/payments/` (port + simulated driver + Stripe stub + config factory), billing module controllers (aluno/responsável wallet + pay sheet, admin plans/charges/materialize/refund, platform repasses), materialization service, events, and the CI route-metadata assertions from backend-03 (webhook `@Public`, payment endpoints `@BypassReadOnly`, no professor route in billing).
- Testing (backend-07): e2e over the simulated driver covers the full paid-flow; contract tests pin the normalized-event handler so the Stripe swap is a driver-only PR.
