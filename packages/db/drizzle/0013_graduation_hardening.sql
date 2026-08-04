-- Graduation slice hardening (spec 005, GRD.1–GRD.4). Additive only:
-- * FORCE RLS on the three shared catalogs and the three new tenant tables
--   (mirrors 0002/0008/0011)
-- * catalog write-protection: belts/ladders/arts are readable by every
--   tenant (public SELECT policy, 0012) but writable by no academy —
--   INSERT/UPDATE/DELETE revoked from tatame_app; writes happen only via
--   migrations or the platform (BYPASSRLS) pool
-- * append-only layers on `student_graduations` (resolved audit decision,
--   stricter than attendances): UPDATE/DELETE revoked from tatame_app,
--   INSERT/UPDATE/DELETE revoked from tatame_platform (platform reads only),
--   and the shared `forbid_mutation()` guard trigger attached
--   UNCONDITIONALLY — no sanctioned UPDATE window of any kind; corrections
--   are `kind='revocation'` compensation rows, admin-only, always audited.
ALTER TABLE "martial_arts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "belt_ladders" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "belts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "graduation_rules" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_graduations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "student_notes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Shared catalogs: tenant writes impossible by construction (grant layer on
-- top of the SELECT-only policy layer — a future policy mistake still fails
-- closed at the grants). The platform pool keeps its 0002 default grants for
-- the catalog seed path.
REVOKE INSERT, UPDATE, DELETE ON "martial_arts" FROM tatame_app;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON "belt_ladders" FROM tatame_app;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON "belts" FROM tatame_app;--> statement-breakpoint

-- Append-only grants on student_graduations: tatame_app keeps SELECT +
-- INSERT (policies are SELECT + INSERT only, 0012); tatame_platform reads
-- only. History cannot be falsified even by buggy code.
REVOKE UPDATE, DELETE ON "student_graduations" FROM tatame_app;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON "student_graduations" FROM tatame_platform;--> statement-breakpoint

-- Guard trigger (backstops grants + policies against role drift, owner
-- console sessions and SECURITY DEFINER functions). `forbid_mutation()`
-- (0011) special-cases `attendances` only — on student_graduations every
-- UPDATE and DELETE raises, including for the table owner.
CREATE TRIGGER student_graduations_forbid_mutation
  BEFORE UPDATE OR DELETE ON "student_graduations"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
