# Money & billing model (incl. Stripe object mapping)

Type: grilling
Blocked by: 03

## Question

What is the schema for money across both plan levels — platform→academy subscriptions (Essencial/Pro/Black; plan change applies next billing cycle; delinquency → withheld repasses + read-only; suspension blocks access) and academy→student plans (name, value, recurrence; monthly cobranças with status, due date, recurrence, receipt; Pix/boleto/card methods) — plus store orders and paid event registrations? Decide: how local tables map to Stripe objects (Customer, Subscription, Invoice, PaymentIntent, Connect accounts for repasses?), what is mirrored locally vs read from Stripe, currency/amount representation (integer cents), charge status lifecycle, and how repasse retention for delinquent academies is recorded.
