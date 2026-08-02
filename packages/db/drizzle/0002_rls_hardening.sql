-- RLS hardening + grants + SECURITY DEFINER pre-auth seams (tickets 02/03).
--
-- FORCE ROW LEVEL SECURITY on every auth-critical table so even the table
-- owner is subject to policies. Consequence: the SECURITY DEFINER functions
-- below MUST be owned by a role that bypasses RLS (superuser in dev/test; a
-- dedicated BYPASSRLS migrations owner in production).
ALTER TABLE "users" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credentials" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sessions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "refresh_tokens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "password_reset_tokens" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "memberships" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "role_permissions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "invites" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academies" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_users" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "platform_plans" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "academy_subscriptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Privileges. Grants are orthogonal to RLS: tatame_app gets DML privileges,
-- but rows are only ever visible/writable through its policies (fail closed —
-- a table without a policy yields zero rows / rejects writes).
GRANT USAGE ON SCHEMA public TO tatame_app, tatame_platform;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tatame_app;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO tatame_platform;--> statement-breakpoint
-- Future tables created by the migrations owner inherit the same DML grants
-- (rows still gated by RLS policies; policy-less tables stay fail-closed).
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO tatame_app, tatame_platform;--> statement-breakpoint

-- UUID v7 helper (kjmph-style) used only inside the SECURITY DEFINER seams so
-- server-minted rows keep the same time-ordered id shape the app generates.
CREATE OR REPLACE FUNCTION uuid_generate_v7() RETURNS uuid
LANGUAGE plpgsql VOLATILE AS $$
BEGIN
  RETURN encode(
    set_bit(
      set_bit(
        overlay(
          uuid_send(gen_random_uuid())
          placing substring(int8send(floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint) FROM 3)
          FROM 1 FOR 6
        ),
        52, 1
      ),
      53, 1
    ),
    'hex')::uuid;
END
$$;--> statement-breakpoint

-- ---------------------------------------------------------------------------
-- Pre-auth seams. RLS stays FORCED on the auth tables; the ONLY bypass is
-- this narrow set of SECURITY DEFINER functions, executable exclusively by
-- tatame_app (the identity module). Every function pins search_path.
-- ---------------------------------------------------------------------------

-- Login by email: identity + password credential in one lookup. The caller
-- (identity module) verifies the argon2id hash; same-shaped result whether or
-- not the email exists is the caller's concern (no enumeration).
CREATE OR REPLACE FUNCTION auth_login_lookup(p_email text)
RETURNS TABLE (
  user_id uuid,
  email text,
  full_name text,
  user_status user_status,
  credential_id uuid,
  secret_hash text,
  password_changed_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT u.id, u.email, u.full_name, u.status, c.id, c.secret_hash, c.updated_at
  FROM users u
  JOIN credentials c ON c.user_id = u.id AND c.provider = 'password'
  WHERE lower(u.email) = lower(p_email);
$$;--> statement-breakpoint

-- Own-membership resolution at login time (before any tenant context exists).
CREATE OR REPLACE FUNCTION auth_user_memberships(p_user_id uuid)
RETURNS TABLE (
  membership_id uuid,
  tenant_id uuid,
  role membership_role,
  membership_status membership_status,
  academy_name text,
  academy_slug text,
  academy_status academy_status
)
LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT m.id, m.tenant_id, m.role, m.status, a.name, a.slug, a.status
  FROM memberships m
  JOIN academies a ON a.id = m.tenant_id
  WHERE m.user_id = p_user_id;
$$;--> statement-breakpoint

-- Session mint (login / invite accept): session + first refresh token in one
-- unit. Caller has already verified credentials.
CREATE OR REPLACE FUNCTION auth_create_session(
  p_user_id uuid,
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
  INSERT INTO sessions (id, user_id, ip, user_agent, last_seen_at)
  VALUES (v_session_id, p_user_id, p_ip, p_user_agent, now());
  INSERT INTO refresh_tokens (id, session_id, token_hash, expires_at)
  VALUES (v_token_id, v_session_id, p_refresh_token_hash, p_refresh_expires_at);
  RETURN QUERY SELECT v_session_id, v_token_id;
END
$$;--> statement-breakpoint

-- Refresh rotation with mandatory reuse detection: presenting an
-- already-consumed token revokes the whole session (theft signal).
-- status: rotated | reused | expired | session_revoked | not_found
CREATE OR REPLACE FUNCTION auth_rotate_refresh_token(
  p_token_hash text,
  p_new_token_hash text,
  p_new_expires_at timestamptz
)
RETURNS TABLE (status text, session_id uuid, user_id uuid, new_refresh_token_id uuid)
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
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::uuid;
    RETURN;
  END IF;

  SELECT s.* INTO v_session FROM sessions s WHERE s.id = v_token.session_id FOR UPDATE;

  IF v_session.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT 'session_revoked'::text, v_session.id, v_session.user_id, NULL::uuid;
    RETURN;
  END IF;

  IF v_token.consumed_at IS NOT NULL THEN
    -- Reuse detected: revoke the whole family.
    UPDATE sessions s SET revoked_at = now(), updated_at = now() WHERE s.id = v_session.id;
    RETURN QUERY SELECT 'reused'::text, v_session.id, v_session.user_id, NULL::uuid;
    RETURN;
  END IF;

  IF v_token.expires_at <= now() THEN
    RETURN QUERY SELECT 'expired'::text, v_session.id, v_session.user_id, NULL::uuid;
    RETURN;
  END IF;

  v_new_id := uuid_generate_v7();
  -- Insert the successor first so the rotation-chain FK is satisfiable.
  INSERT INTO refresh_tokens (id, session_id, token_hash, expires_at)
  VALUES (v_new_id, v_session.id, p_new_token_hash, p_new_expires_at);
  UPDATE refresh_tokens rt SET consumed_at = now(), replaced_by_id = v_new_id
  WHERE rt.id = v_token.id;
  UPDATE sessions s SET last_seen_at = now(), updated_at = now() WHERE s.id = v_session.id;

  RETURN QUERY SELECT 'rotated'::text, v_session.id, v_session.user_id, v_new_id;
END
$$;--> statement-breakpoint

-- Forgot password: stores a hashed single-use token if (and only if) the
-- email maps to an active user. Caller always answers 202 regardless.
CREATE OR REPLACE FUNCTION auth_request_password_reset(
  p_email text,
  p_token_hash text,
  p_expires_at timestamptz
)
RETURNS TABLE (user_id uuid, email text, full_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_user users%ROWTYPE;
BEGIN
  SELECT u.* INTO v_user FROM users u
  WHERE lower(u.email) = lower(p_email) AND u.status = 'active';
  IF NOT FOUND THEN
    RETURN;
  END IF;
  INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
  VALUES (uuid_generate_v7(), v_user.id, p_token_hash, p_expires_at);
  RETURN QUERY SELECT v_user.id, v_user.email, v_user.full_name;
END
$$;--> statement-breakpoint

-- Reset consume: single-use, sets the new argon2id hash, revokes ALL of the
-- user's sessions (spec: whoever had the old password is signed out).
-- status: reset | invalid | not_found
CREATE OR REPLACE FUNCTION auth_consume_password_reset(
  p_token_hash text,
  p_new_secret_hash text
)
RETURNS TABLE (status text, user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
#variable_conflict use_column
-- ^ the ON CONFLICT target below must resolve to table columns, not the
--   OUT parameters of this function.
DECLARE
  v_token password_reset_tokens%ROWTYPE;
BEGIN
  SELECT t.* INTO v_token FROM password_reset_tokens t
  WHERE t.token_hash = p_token_hash
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid;
    RETURN;
  END IF;

  IF v_token.used_at IS NOT NULL OR v_token.expires_at <= now() THEN
    RETURN QUERY SELECT 'invalid'::text, NULL::uuid;
    RETURN;
  END IF;

  UPDATE password_reset_tokens t SET used_at = now() WHERE t.id = v_token.id;

  INSERT INTO credentials (id, user_id, provider, secret_hash)
  VALUES (uuid_generate_v7(), v_token.user_id, 'password', p_new_secret_hash)
  ON CONFLICT (user_id, provider)
  DO UPDATE SET secret_hash = excluded.secret_hash, updated_at = now();

  UPDATE sessions s SET revoked_at = now(), updated_at = now()
  WHERE s.user_id = v_token.user_id AND s.revoked_at IS NULL;

  RETURN QUERY SELECT 'reset'::text, v_token.user_id;
END
$$;--> statement-breakpoint

-- Public invite landing: token -> academy branding + inherited bindings.
-- status: valid | not_found | revoked | expired | exhausted
CREATE OR REPLACE FUNCTION auth_invite_landing(p_token_hash text)
RETURNS TABLE (
  status text,
  invite_id uuid,
  tenant_id uuid,
  kind invite_kind,
  class_id uuid,
  academy_plan_id uuid,
  expires_at timestamptz,
  academy_name text,
  academy_slug text,
  academy_logo_url text,
  academy_theme jsonb,
  academy_status academy_status
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_invite invites%ROWTYPE;
  v_academy academies%ROWTYPE;
  v_status text;
BEGIN
  SELECT i.* INTO v_invite FROM invites i WHERE i.token_hash = p_token_hash;
  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::invite_kind,
      NULL::uuid, NULL::uuid, NULL::timestamptz, NULL::text, NULL::text, NULL::text,
      NULL::jsonb, NULL::academy_status;
    RETURN;
  END IF;

  SELECT a.* INTO v_academy FROM academies a WHERE a.id = v_invite.tenant_id;

  v_status := CASE
    WHEN v_invite.revoked_at IS NOT NULL THEN 'revoked'
    WHEN v_invite.expires_at <= now() THEN 'expired'
    WHEN v_invite.max_uses IS NOT NULL AND v_invite.uses_count >= v_invite.max_uses THEN 'exhausted'
    ELSE 'valid'
  END;

  RETURN QUERY SELECT v_status, v_invite.id, v_invite.tenant_id, v_invite.kind,
    v_invite.class_id, v_invite.academy_plan_id, v_invite.expires_at,
    v_academy.name, v_academy.slug, v_academy.logo_url, v_academy.theme, v_academy.status;
END
$$;--> statement-breakpoint

-- Invite accept — the only signup. Atomically: validate + lock the invite,
-- create user + password credential + membership, consume one use.
-- The "minor always linked to a guardian" charter rule is enforced here as
-- defense in depth: a student-kind invite refuses a minor birth date.
-- status: accepted | not_found | revoked | expired | exhausted |
--         email_exists | minor_requires_guardian
CREATE OR REPLACE FUNCTION auth_accept_invite(
  p_token_hash text,
  p_email text,
  p_full_name text,
  p_phone text,
  p_birth_date date,
  p_secret_hash text
)
RETURNS TABLE (status text, user_id uuid, membership_id uuid, tenant_id uuid, role membership_role)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_invite invites%ROWTYPE;
  v_role membership_role;
  v_user_id uuid;
  v_membership_id uuid;
BEGIN
  SELECT i.* INTO v_invite FROM invites i WHERE i.token_hash = p_token_hash FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::membership_role;
    RETURN;
  END IF;
  IF v_invite.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT 'revoked'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::membership_role;
    RETURN;
  END IF;
  IF v_invite.expires_at <= now() THEN
    RETURN QUERY SELECT 'expired'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::membership_role;
    RETURN;
  END IF;
  IF v_invite.max_uses IS NOT NULL AND v_invite.uses_count >= v_invite.max_uses THEN
    RETURN QUERY SELECT 'exhausted'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::membership_role;
    RETURN;
  END IF;

  v_role := CASE v_invite.kind WHEN 'student' THEN 'student'::membership_role ELSE 'guardian'::membership_role END;

  IF v_invite.kind = 'student' AND p_birth_date IS NOT NULL
     AND p_birth_date > (current_date - interval '18 years') THEN
    RETURN QUERY SELECT 'minor_requires_guardian'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::membership_role;
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(p_email)) THEN
    RETURN QUERY SELECT 'email_exists'::text, NULL::uuid, NULL::uuid, NULL::uuid, NULL::membership_role;
    RETURN;
  END IF;

  v_user_id := uuid_generate_v7();
  v_membership_id := uuid_generate_v7();

  INSERT INTO users (id, email, full_name, phone, birth_date)
  VALUES (v_user_id, lower(p_email), p_full_name, p_phone, p_birth_date);

  INSERT INTO credentials (id, user_id, provider, secret_hash)
  VALUES (uuid_generate_v7(), v_user_id, 'password', p_secret_hash);

  INSERT INTO memberships (id, tenant_id, user_id, role, invite_id)
  VALUES (v_membership_id, v_invite.tenant_id, v_user_id, v_role, v_invite.id);

  UPDATE invites i SET uses_count = i.uses_count + 1, updated_at = now()
  WHERE i.id = v_invite.id;

  RETURN QUERY SELECT 'accepted'::text, v_user_id, v_membership_id, v_invite.tenant_id, v_role;
END
$$;--> statement-breakpoint

-- Execution surface: pre-auth seams are callable by tatame_app ONLY.
REVOKE ALL ON FUNCTION auth_login_lookup(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_user_memberships(uuid) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_create_session(uuid, inet, text, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_rotate_refresh_token(text, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_request_password_reset(text, text, timestamptz) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_consume_password_reset(text, text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_invite_landing(text) FROM PUBLIC;--> statement-breakpoint
REVOKE ALL ON FUNCTION auth_accept_invite(text, text, text, text, date, text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_login_lookup(text) TO tatame_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_user_memberships(uuid) TO tatame_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_create_session(uuid, inet, text, text, timestamptz) TO tatame_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_rotate_refresh_token(text, text, timestamptz) TO tatame_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_request_password_reset(text, text, timestamptz) TO tatame_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_consume_password_reset(text, text) TO tatame_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_invite_landing(text) TO tatame_app;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_accept_invite(text, text, text, text, date, text) TO tatame_app;
