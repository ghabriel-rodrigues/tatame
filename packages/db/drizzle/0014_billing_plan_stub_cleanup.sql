-- BIL.4 pre-step (003 debt, mirrors the 0006 invites.class_id precedent):
-- `students.academy_plan_id` and `invites.academy_plan_id` have been plain
-- uuid stubs since Phase 3 because `academy_plans` did not exist. The next
-- (generated) migration creates `academy_plans` and hardens both columns into
-- composite `(tenant_id, academy_plan_id)` FKs. Since `academy_plans` is
-- brand new, every pre-existing non-NULL binding is dangling by definition —
-- NULL them so the constraints apply cleanly over prior-phase data (a student
-- or invite without a plan binding stays valid; the Carteira shows its empty
-- state instead of invented money).
UPDATE students SET academy_plan_id = NULL, updated_at = now() WHERE academy_plan_id IS NOT NULL;--> statement-breakpoint
UPDATE invites SET academy_plan_id = NULL, updated_at = now() WHERE academy_plan_id IS NOT NULL;
