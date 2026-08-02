# Stripe integration architecture

Type: research
Blocked by: 01, 04

## Question

How should Stripe be integrated architecturally (sandbox/test mode from day one)? Research and define: the webhook endpoint design (signature verification, idempotent event handling, which events to consume), how the 2-level billing model runs on Stripe — platform→academy subscriptions (plan change next cycle, trial, delinquency, suspension) and academy→student charges (Pix, boleto, card recurrence; note Pix/boleto availability in Stripe Brazil and any gap this creates), whether Stripe Connect is used for academy repasses and delinquency-withholding, the module seam (single billing/payments module wrapping the Stripe SDK), and local-dev webhook strategy (Stripe CLI forwarding). Consumes the money/billing schema from the database map (ticket 05 there).
