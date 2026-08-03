-- Professor registration seam (spec 003, ENR.7). Additive only.
--
-- "Registering a professor" = reuse-or-create the GLOBAL user by email
-- (cross-tenant reuse per the registry semantics) + create the professor
-- membership in the calling tenant. tatame_app cannot touch other users'
-- rows (self policies only), so the reuse-or-create step needs a
-- SECURITY DEFINER seam — the same pattern as the auth_* functions.
--
-- The tenant is read from the `app.tenant_id` transaction GUC, so the seam
-- MUST be called inside `withTenant` — it refuses to run without a bound
-- tenant. No credential is created here: the set-your-password flow goes
-- through the existing password-reset seam (single-use, short-lived token).
--
-- status: registered | already_member | no_tenant
CREATE OR REPLACE FUNCTION enrollment_register_professor(
  p_email text,
  p_full_name text
)
RETURNS TABLE (
  status text,
  user_id uuid,
  membership_id uuid,
  user_created boolean,
  has_password boolean,
  email text,
  full_name text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_tenant_id uuid;
  v_user users%ROWTYPE;
  v_membership_id uuid;
  v_user_created boolean := false;
  v_has_password boolean := false;
BEGIN
  v_tenant_id := NULLIF(current_setting('app.tenant_id', true), '')::uuid;
  IF v_tenant_id IS NULL THEN
    RETURN QUERY SELECT 'no_tenant'::text, NULL::uuid, NULL::uuid,
      NULL::boolean, NULL::boolean, NULL::text, NULL::text;
    RETURN;
  END IF;

  SELECT u.* INTO v_user FROM users u WHERE lower(u.email) = lower(p_email);

  IF NOT FOUND THEN
    INSERT INTO users (id, email, full_name)
    VALUES (uuid_generate_v7(), lower(p_email), p_full_name)
    RETURNING * INTO v_user;
    v_user_created := true;
  END IF;

  v_has_password := EXISTS (
    SELECT 1 FROM credentials c
    WHERE c.user_id = v_user.id AND c.provider = 'password'
  );

  SELECT m.id INTO v_membership_id FROM memberships m
  WHERE m.tenant_id = v_tenant_id
    AND m.user_id = v_user.id
    AND m.role = 'professor';

  IF FOUND THEN
    RETURN QUERY SELECT 'already_member'::text, v_user.id, v_membership_id,
      v_user_created, v_has_password, v_user.email, v_user.full_name;
    RETURN;
  END IF;

  v_membership_id := uuid_generate_v7();
  INSERT INTO memberships (id, tenant_id, user_id, role)
  VALUES (v_membership_id, v_tenant_id, v_user.id, 'professor');

  RETURN QUERY SELECT 'registered'::text, v_user.id, v_membership_id,
    v_user_created, v_has_password, v_user.email, v_user.full_name;
END
$$;--> statement-breakpoint

-- Execution surface: callable by tatame_app only (inside withTenant).
REVOKE ALL ON FUNCTION enrollment_register_professor(text, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION enrollment_register_professor(text, text) TO tatame_app;
