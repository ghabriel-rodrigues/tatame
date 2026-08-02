-- Runtime DB roles (ticket 02 — tenant isolation strategy).
--
-- tatame_app      : RLS-enforced role for all tenant-persona traffic.
-- tatame_platform : BYPASSRLS role for the platform module only (MRR,
--                   academies CRUD, SaaS billing). Cross-tenant by design.
--
-- Both are NOLOGIN: pools authenticate as a login user (which must be GRANTed
-- these roles, or be superuser in dev/test) and immediately `SET ROLE`.
-- Creation is guarded because roles are cluster-wide while migrations are
-- per-database.
DO $$
BEGIN
  CREATE ROLE tatame_app NOLOGIN;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
--> statement-breakpoint
DO $$
BEGIN
  CREATE ROLE tatame_platform NOLOGIN BYPASSRLS;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;
