-- Attendance slice hardening + seams (spec 004, ATT.2/ATT.3/ATT.4).
-- Additive only:
-- * FORCE RLS on the three new tenant tables (mirrors 0002/0008)
-- * append-only layers on `attendances` (and, per the resolved audit
--   decision, the same treatment for `audit_logs`): UPDATE/DELETE grants
--   revoked from both runtime roles, `forbid_mutation()` guard trigger
-- * attendance_revoke — the audited void seam (professor same-day window,
--   admin any time), writing its audit row in the same transaction through
--   the existing audit_append seam
ALTER TABLE "class_sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "checkin_codes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendances" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Append-only grants (layer 1). 0002's blanket + default-privilege grants
-- gave both roles full DML on every table; history tables walk that back:
-- tatame_app keeps SELECT + INSERT (the RLS policies are SELECT + INSERT
-- only, so a future grant mistake still fails closed at the policy layer);
-- tatame_platform reads only. The sanctioned revoke UPDATE runs inside the
-- SECURITY DEFINER seam as the migrations owner — no role grant needed.
REVOKE UPDATE, DELETE ON "attendances" FROM tatame_app;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON "attendances" FROM tatame_platform;--> statement-breakpoint
-- audit_logs writes go exclusively through audit_append (0004); align its
-- grants with the append-only registry (reads stay as they were).
REVOKE INSERT, UPDATE, DELETE ON "audit_logs" FROM tatame_app;--> statement-breakpoint
REVOKE INSERT, UPDATE, DELETE ON "audit_logs" FROM tatame_platform;--> statement-breakpoint

-- Guard trigger (layer 3 — backstops grants + policies against role drift,
-- owner console sessions and SECURITY DEFINER functions, which all bypass
-- grants and/or RLS). Single sanctioned exception: on `attendances`, an
-- UPDATE whose only change is the revoke annotation
-- (revoked_at / revoked_by_user_id / revoke_reason) going from NULL to
-- non-NULL, exactly once; `updated_at` may move with it. Everything else —
-- and every DELETE — is refused, on `audit_logs` unconditionally.
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND TG_TABLE_NAME = 'attendances' THEN
    IF OLD.revoked_at IS NULL
       AND NEW.revoked_at IS NOT NULL
       AND NEW.id IS NOT DISTINCT FROM OLD.id
       AND NEW.tenant_id IS NOT DISTINCT FROM OLD.tenant_id
       AND NEW.class_session_id IS NOT DISTINCT FROM OLD.class_session_id
       AND NEW.student_id IS NOT DISTINCT FROM OLD.student_id
       AND NEW.method IS NOT DISTINCT FROM OLD.method
       AND NEW.checked_in_at IS NOT DISTINCT FROM OLD.checked_in_at
       AND NEW.recorded_by_user_id IS NOT DISTINCT FROM OLD.recorded_by_user_id
       AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at
    THEN
      RETURN NEW;
    END IF;
  END IF;
  RAISE EXCEPTION '% on % is forbidden: append-only table', TG_OP, TG_TABLE_NAME;
END
$$;--> statement-breakpoint

CREATE TRIGGER attendances_forbid_mutation
  BEFORE UPDATE OR DELETE ON "attendances"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint

CREATE TRIGGER audit_logs_forbid_mutation
  BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();--> statement-breakpoint

-- The audited void seam — the ONLY revocation path (same pattern as
-- audit_append: takes the tenant explicitly and validates the target row's
-- tenant, because SECURITY DEFINER bypasses RLS by nature).
--
-- Window rule (resolved audit decision): a professor may revoke only while
-- the session's local date is still the current date; after the day closes
-- only an admin may revoke, any time. Every revoke is audited in the same
-- transaction (action `attendance.revoked`, window same_day | admin_late).
-- The actor's role is resolved from their active memberships in the tenant —
-- an admin-capable actor always passes the window (admin wins over a
-- coexisting professor row).
--
-- Tenant timezone: v1 is single-country (charter) — the local date is
-- computed in America/Sao_Paulo; a per-academy timezone column is a future
-- concern and slots in here without a contract change.
--
-- status: revoked | not_found | already_revoked | window_closed | not_allowed
CREATE OR REPLACE FUNCTION attendance_revoke(
  p_tenant_id uuid,
  p_attendance_id uuid,
  p_revoked_by uuid,
  p_reason text DEFAULT NULL,
  p_impersonator_user_id uuid DEFAULT NULL
)
RETURNS TABLE (status text, attendance_id uuid, revoke_window text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_attendance attendances%ROWTYPE;
  v_session class_sessions%ROWTYPE;
  v_is_admin boolean;
  v_is_professor boolean;
  v_today date;
  v_window text;
BEGIN
  IF p_tenant_id IS NULL OR p_attendance_id IS NULL OR p_revoked_by IS NULL THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  SELECT a.* INTO v_attendance FROM attendances a
  WHERE a.tenant_id = p_tenant_id AND a.id = p_attendance_id
  FOR UPDATE;

  IF NOT FOUND THEN
    -- Cross-tenant ids land here too: foreign rows behave as nonexistent.
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::text;
    RETURN;
  END IF;

  IF v_attendance.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT 'already_revoked'::text, v_attendance.id, NULL::text;
    RETURN;
  END IF;

  SELECT cs.* INTO v_session FROM class_sessions cs
  WHERE cs.tenant_id = p_tenant_id AND cs.id = v_attendance.class_session_id;

  SELECT
    bool_or(m.role = 'admin'),
    bool_or(m.role = 'professor')
    INTO v_is_admin, v_is_professor
  FROM memberships m
  WHERE m.tenant_id = p_tenant_id
    AND m.user_id = p_revoked_by
    AND m.status = 'active';

  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  IF COALESCE(v_is_admin, false) THEN
    v_window := CASE WHEN v_session.session_date = v_today THEN 'same_day' ELSE 'admin_late' END;
  ELSIF COALESCE(v_is_professor, false) THEN
    IF v_session.session_date <> v_today THEN
      RETURN QUERY SELECT 'window_closed'::text, v_attendance.id, NULL::text;
      RETURN;
    END IF;
    v_window := 'same_day';
  ELSE
    RETURN QUERY SELECT 'not_allowed'::text, v_attendance.id, NULL::text;
    RETURN;
  END IF;

  -- The void annotation — the guard trigger's single sanctioned transition.
  UPDATE attendances a
  SET revoked_at = now(),
      revoked_by_user_id = p_revoked_by,
      revoke_reason = p_reason,
      updated_at = now()
  WHERE a.id = v_attendance.id;

  -- Audit in the same transaction, through the existing seam.
  PERFORM audit_append(
    p_tenant_id,
    p_revoked_by,
    p_impersonator_user_id,
    'attendance.revoked',
    'attendance',
    v_attendance.id::text,
    jsonb_build_object(
      'attendance_id', v_attendance.id,
      'class_session_id', v_attendance.class_session_id,
      'student_id', v_attendance.student_id,
      'window', v_window,
      'reason', p_reason
    )
  );

  RETURN QUERY SELECT 'revoked'::text, v_attendance.id, v_window;
END
$$;--> statement-breakpoint

-- Execution surface: the void seam is callable by tatame_app only.
REVOKE ALL ON FUNCTION attendance_revoke(uuid, uuid, uuid, text, uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION attendance_revoke(uuid, uuid, uuid, text, uuid) TO tatame_app;
