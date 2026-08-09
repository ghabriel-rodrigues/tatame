-- EVT.2 pre-step (006 debt, mirrors the 0006/0014 stub-cleanup precedent):
-- `charges.event_registration_id` has been a plain uuid stub since BIL.2
-- because `event_registrations` did not exist. The next (generated) migration
-- creates the table and hardens the column into a composite
-- `(tenant_id, event_registration_id)` FK. Since `event_registrations` is
-- brand new, every pre-existing non-NULL binding is dangling by definition —
-- but unlike the nullable invites.class_id / academy_plan_id stubs, the
-- per-origin CHECK (charges_origin_ck) forbids nulling the column on an
-- event-origin charge. Such charges are definitionally unlinkable (the table
-- they claim to bill for never existed; the v1 runtime only materialized plan
-- charges), so they are removed together with their settlement attempts
-- rather than left to break the constraint.
DELETE FROM payments USING charges
  WHERE payments.tenant_id = charges.tenant_id
    AND payments.charge_id = charges.id
    AND charges.origin = 'event';--> statement-breakpoint
DELETE FROM charges WHERE origin = 'event';
