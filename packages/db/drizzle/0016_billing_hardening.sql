-- Billing slice hardening (spec 006, BIL.1–BIL.3). Additive only: FORCE RLS
-- on the five new tenant tables so even the table owner is subject to the
-- fail-closed tenant policies (mirrors 0002/0008/0011/0013). Charges and
-- payments are deliberately NOT append-only (status mutates through the
-- lifecycle); money truth is protected by the audit trail
-- (billing.charge.created/paid/refunded/canceled, billing.mandate.*) plus
-- provider ids — the resolved money-ticket decision.
ALTER TABLE "academy_plans" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "charges" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payment_mandates" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_customers" FORCE ROW LEVEL SECURITY;
