-- Auth seams v2 (backend slice AUTH.6–AUTH.11). Additive only:
-- * audit_logs hardening (FORCE RLS; app-side writes via audit_append only)
-- * session mint/rotation seams aware of membership, impersonation and the
--   absolute session cap added in 0003
-- * authenticated invite accept (attach membership to an existing user)
-- * platform profile + TOTP persistence seams
-- The 0002 v1 functions remain untouched (frozen contract).
ALTER TABLE "audit_logs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Session mint v2: binds the active membership, supports impersonated
-- sessions (impersonator + target tenant, no membership row) and stamps the
-- absolute session cap. Caller has already verified credentials/authority.
CREATE OR REPLACE FUNCTION auth_create_session_v2(
  p_user_id uuid,
  p_membership_id uuid,
  p_impersonator_user_id uuid,
  p_impersonated_tenant_id uuid,
  p_session_expires_at timestamptz,
  p_ip inet,
  p_user_agent text,
  p_refresh_token_hash text,
  p_refresh_expires_at timestamptz
)
RETURNS TABLE (session_id uuid, refresh_token_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_session_id uuid := uuid_generate_v7();
  v_token_id uuid := uuid_generate_v7();
BEGIN
  INSERT INTO sessions (
    id, user_id, membership_id, impersonator_user_id, impersonated_tenant_id,
    expires_at, ip, user_agent, last_seen_at
  )
  VALUES (
    v_session_id, p_user_id, p_membership_id, p_impersonator_user_id,
    p_impersonated_tenant_id, p_session_expires_at, p_ip, p_user_agent, now()
  );
  INSERT INTO refresh_tokens (id, session_id, token_hash, expires_at)
  VALUES (
    v_token_id, v_session_id, p_refresh_token_hash,
    LEAST(p_refresh_expires_at, p_session_expires_at)
  );
  RETURN QUERY SELECT v_session_id, v_token_id;
END
$$;--> statement-breakpoint

-- Refresh rotation v2: v1 semantics (mandatory family-reuse revocation) plus
-- the absolute session cap and the session context the API needs to re-mint
-- access-token claims without extra round trips.
-- status: rotated | reused | expired | session_revoked | not_found
CREATE OR REPLACE FUNCTION auth_rotate_refresh_token_v2(
  p_token_hash text,
  p_new_token_hash text,
  p_new_expires_at timestamptz
)
RETURNS TABLE (
  status text,
  session_id uuid,
  user_id uuid,
  membership_id uuid,
  impersonator_user_id uuid,
  impersonated_tenant_id uuid,
  session_expires_at timestamptz,
  new_refresh_token_id uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_token refresh_tokens%ROWTYPE;
  v_session sessions%ROWTYPE;
  v_new_id uuid;
BEGIN
  SELECT rt.* INTO v_token
  FROM refresh_tokens rt
  WHERE rt.token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::uuid,
      NULL::uuid, NULL::uuid, NULL::timestamptz, NULL::uuid;
    RETURN;
  END IF;

  SELECT s.* INTO v_session FROM sessions s WHERE s.id = v_token.session_id FOR UPDATE;

  IF v_session.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT 'session_revoked'::text, v_session.id, v_session.user_id,
      v_session.membership_id, v_session.impersonator_user_id,
      v_session.impersonated_tenant_id, v_session.expires_at, NULL::uuid;
    RETURN;
  END IF;

  IF v_token.consumed_at IS NOT NULL THEN
    -- Reuse detected: theft signal — revoke the whole family.
    UPDATE sessions s SET revoked_at = now(), revoked_reason = 'refresh_reuse', updated_at = now()
    WHERE s.id = v_session.id;
    RETURN QUERY SELECT 'reused'::text, v_session.id, v_session.user_id,
      v_session.membership_id, v_session.impersonator_user_id,
      v_session.impersonated_tenant_id, v_session.expires_at, NULL::uuid;
    RETURN;
  END IF;

  IF v_token.expires_at <= now()
     OR (v_session.expires_at IS NOT NULL AND v_session.expires_at <= now()) THEN
    RETURN QUERY SELECT 'expired'::text, v_session.id, v_session.user_id,
      v_session.membership_id, v_session.impersonator_user_id,
      v_session.impersonated_tenant_id, v_session.expires_at, NULL::uuid;
    RETURN;
  END IF;

  v_new_id := uuid_generate_v7();
  INSERT INTO refresh_tokens (id, session_id, token_hash, expires_at)
  VALUES (
    v_new_id, v_session.id, p_new_token_hash,
    LEAST(p_new_expires_at, COALESCE(v_session.expires_at, p_new_expires_at))
  );
  UPDATE refresh_tokens rt SET consumed_at = now(), replaced_by_id = v_new_id
  WHERE rt.id = v_token.id;
  UPDATE sessions s SET last_seen_at = now(), updated_at = now() WHERE s.id = v_session.id;

  RETURN QUERY SELECT 'rotated'::text, v_session.id, v_session.user_id,
    v_session.membership_id, v_session.impersonator_user_id,
    v_session.impersonated_tenant_id, v_session.expires_at, v_new_id;
END
$$;--> statement-breakpoint

-- Authenticated invite accept (BOSS ruling on existing-email invites): attach
-- a new membership to an EXISTING user atomically, consuming one invite use.
-- status: attached | already_member | not_found | revoked | expired |
--         exhausted | user_not_found
CREATE OR REPLACE FUNCTION auth_attach_invite_membership(
  p_token_hash text,
  p_user_id uuid
)
RETURNS TABLE (status text, membership_id uuid, tenant_id uuid, role membership_role)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_invite invites%ROWTYPE;
  v_role membership_role;
  v_membership_id uuid;
BEGIN
  SELECT i.* INTO v_invite FROM invites i WHERE i.token_hash = p_token_hash FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::membership_role;
    RETURN;
  END IF;
  IF v_invite.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT 'revoked'::text, NULL::uuid, NULL::uuid, NULL::membership_role;
    RETURN;
  END IF;
  IF v_invite.expires_at <= now() THEN
    RETURN QUERY SELECT 'expired'::text, NULL::uuid, NULL::uuid, NULL::membership_role;
    RETURN;
  END IF;
  IF v_invite.max_uses IS NOT NULL AND v_invite.uses_count >= v_invite.max_uses THEN
    RETURN QUERY SELECT 'exhausted'::text, NULL::uuid, NULL::uuid, NULL::membership_role;
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p_user_id) THEN
    RETURN QUERY SELECT 'user_not_found'::text, NULL::uuid, NULL::uuid, NULL::membership_role;
    RETURN;
  END IF;

  v_role := CASE v_invite.kind WHEN 'student' THEN 'student'::membership_role ELSE 'guardian'::membership_role END;

  SELECT m.id INTO v_membership_id FROM memberships m
  WHERE m.tenant_id = v_invite.tenant_id AND m.user_id = p_user_id AND m.role = v_role;
  IF FOUND THEN
    RETURN QUERY SELECT 'already_member'::text, v_membership_id, v_invite.tenant_id, v_role;
    RETURN;
  END IF;

  v_membership_id := uuid_generate_v7();
  INSERT INTO memberships (id, tenant_id, user_id, role, invite_id)
  VALUES (v_membership_id, v_invite.tenant_id, p_user_id, v_role, v_invite.id);

  UPDATE invites i SET uses_count = i.uses_count + 1, updated_at = now()
  WHERE i.id = v_invite.id;

  RETURN QUERY SELECT 'attached'::text, v_membership_id, v_invite.tenant_id, v_role;
END
$$;--> statement-breakpoint

-- Platform membership resolution (login/switch/me happen before or outside a
-- tenant context; platform_users is fail-closed for tatame_app).
CREATE OR REPLACE FUNCTION auth_platform_profile(p_user_id uuid)
RETURNS TABLE (
  platform_user_id uuid,
  role platform_role,
  status user_status,
  totp_enabled boolean,
  totp_secret text,
  totp_recovery_codes jsonb
)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT pu.id, pu.role, pu.status, pu.totp_enabled_at IS NOT NULL,
         pu.totp_secret, pu.totp_recovery_codes
  FROM platform_users pu
  WHERE pu.user_id = p_user_id;
$$;--> statement-breakpoint

-- TOTP setup: store the (encrypted) pending secret. Refused once enabled —
-- re-provisioning an armed factor must be an explicit product flow.
-- status: stored | already_enabled | not_platform
CREATE OR REPLACE FUNCTION auth_totp_set_secret(p_user_id uuid, p_secret text)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_pu platform_users%ROWTYPE;
BEGIN
  SELECT pu.* INTO v_pu FROM platform_users pu WHERE pu.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_platform';
  END IF;
  IF v_pu.totp_enabled_at IS NOT NULL THEN
    RETURN 'already_enabled';
  END IF;
  UPDATE platform_users pu
  SET totp_secret = p_secret, totp_recovery_codes = NULL, updated_at = now()
  WHERE pu.id = v_pu.id;
  RETURN 'stored';
END
$$;--> statement-breakpoint

-- TOTP enable: arms the factor (caller verified the code against the pending
-- secret) and stores the hashed single-use recovery codes.
-- status: enabled | no_pending_secret | already_enabled | not_platform
CREATE OR REPLACE FUNCTION auth_totp_enable(p_user_id uuid, p_recovery_codes jsonb)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_pu platform_users%ROWTYPE;
BEGIN
  SELECT pu.* INTO v_pu FROM platform_users pu WHERE pu.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 'not_platform';
  END IF;
  IF v_pu.totp_enabled_at IS NOT NULL THEN
    RETURN 'already_enabled';
  END IF;
  IF v_pu.totp_secret IS NULL THEN
    RETURN 'no_pending_secret';
  END IF;
  UPDATE platform_users pu
  SET totp_enabled_at = now(), totp_recovery_codes = p_recovery_codes, updated_at = now()
  WHERE pu.id = v_pu.id;
  RETURN 'enabled';
END
$$;--> statement-breakpoint

-- Consume one recovery code (login fallback). True when the hash matched and
-- was removed (single-use). Recovery codes are stored as a jsonb array of
-- sha256 hex strings.
CREATE OR REPLACE FUNCTION auth_totp_consume_recovery(p_user_id uuid, p_code_hash text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_pu platform_users%ROWTYPE;
  v_remaining jsonb;
BEGIN
  SELECT pu.* INTO v_pu FROM platform_users pu WHERE pu.user_id = p_user_id FOR UPDATE;
  IF NOT FOUND OR v_pu.totp_recovery_codes IS NULL THEN
    RETURN false;
  END IF;
  SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb) INTO v_remaining
  FROM jsonb_array_elements(v_pu.totp_recovery_codes) AS elem
  WHERE elem <> to_jsonb(p_code_hash);
  IF jsonb_array_length(v_remaining) = jsonb_array_length(v_pu.totp_recovery_codes) THEN
    RETURN false;
  END IF;
  UPDATE platform_users pu
  SET totp_recovery_codes = v_remaining, updated_at = now()
  WHERE pu.id = v_pu.id;
  RETURN true;
END
$$;--> statement-breakpoint

-- Audit append: the ONLY app-side write path into audit_logs (FORCE RLS, no
-- app policies). Used by the impersonation-mutation interceptor.
CREATE OR REPLACE FUNCTION audit_append(
  p_tenant_id uuid,
  p_actor_user_id uuid,
  p_impersonator_user_id uuid,
  p_action text,
  p_target_type text,
  p_target_id text,
  p_metadata jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid := uuid_generate_v7();
BEGIN
  INSERT INTO audit_logs (
    id, tenant_id, actor_user_id, impersonator_user_id, action,
    target_type, target_id, metadata
  )
  VALUES (
    v_id, p_tenant_id, p_actor_user_id, p_impersonator_user_id, p_action,
    p_target_type, p_target_id, p_metadata
  );
  RETURN v_id;
END
$$;--> statement-breakpoint

-- Execution surface: v2 seams are callable by tatame_app only.
REVOKE ALL ON FUNCTION auth_create_session_v2(uuid, uuid, uuid, uuid, timestamptz, inet, text, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_rotate_refresh_token_v2(text, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_attach_invite_membership(text, uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_platform_profile(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_totp_set_secret(uuid, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_totp_enable(uuid, jsonb) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_totp_consume_recovery(uuid, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION audit_append(uuid, uuid, uuid, text, text, text, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_create_session_v2(uuid, uuid, uuid, uuid, timestamptz, inet, text, text, timestamptz) TO tatame_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_rotate_refresh_token_v2(text, text, timestamptz) TO tatame_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_attach_invite_membership(text, uuid) TO tatame_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_platform_profile(uuid) TO tatame_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_totp_set_secret(uuid, text) TO tatame_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_totp_enable(uuid, jsonb) TO tatame_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_totp_consume_recovery(uuid, text) TO tatame_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION audit_append(uuid, uuid, uuid, text, text, text, jsonb) TO tatame_app;
