-- STO.2 pre-step (006 debt, mirrors the 0017 stub-cleanup precedent):
-- `charges.order_id` has been a plain uuid stub since BIL.2 because `orders`
-- did not exist. The next (generated) migration creates the table and hardens
-- the column into a composite `(tenant_id, order_id)` FK — the last of the
-- two BIL.2 origin stubs (Phase 8 closed the `event_registration_id` twin).
-- Since `orders` is brand new, every pre-existing non-NULL binding is
-- dangling by definition — and, as with 0017, the per-origin CHECK
-- (charges_origin_ck) forbids nulling the column on an order-origin charge.
-- Such charges are definitionally unlinkable (the table they claim to bill
-- for never existed; the v1 runtime never materialized order charges), so
-- they are removed together with their settlement attempts rather than left
-- to break the constraint.
DELETE FROM payments USING charges
  WHERE payments.tenant_id = charges.tenant_id
    AND payments.charge_id = charges.id
    AND charges.origin = 'order';--> statement-breakpoint
DELETE FROM charges WHERE origin = 'order';
