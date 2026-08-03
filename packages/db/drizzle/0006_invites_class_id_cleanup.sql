-- ENR.3 pre-step (001 debt): `invites.class_id` was a plain uuid because
-- `classes` did not exist in Phase 2. The next (generated) migration creates
-- `classes` and hardens the column into a composite `(tenant_id, class_id)`
-- FK. Since `classes` is brand new, every pre-existing non-NULL binding is
-- dangling by definition — NULL them so the constraint applies cleanly over
-- Phase-2 data (an invite without a class binding stays valid).
UPDATE invites SET class_id = NULL, updated_at = now() WHERE class_id IS NOT NULL;
