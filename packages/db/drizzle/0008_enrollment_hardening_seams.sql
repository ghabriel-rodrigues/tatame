-- Enrollment slice hardening + seams (spec 003, ENR.2/ENR.4). Additive only:
-- * FORCE RLS on the five new tenant tables (policies land in 0007; forcing
--   mirrors 0002 so even the table owner is subject to them)
-- * auth_accept_invite_v2 — extends the atomic invite-accept seam to persist
--   what Phase 2 only validated: the students row (aluno kind) or the
--   guardians row + dependent students (responsavel kind), each enrolled
--   into the invite-bound class when capacity allows. The v1 function stays
--   untouched (frozen contract).
ALTER TABLE "students" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "guardians" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "classes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "class_schedules" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "enrollments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint

-- Invite accept v2 — the only signup, now persisting the registry rows in
-- the same transaction it already owns. Semantics:
-- * aluno kind: user + credential + membership + students row (linked to the
--   new user, inheriting the invite's plan binding).
-- * responsavel kind: user + credential + membership + guardians row + one
--   students row per submitted dependent (guardian-linked by construction;
--   p_dependents is a jsonb array of {"full_name","birth_date"}).
-- * class binding: each created student is enrolled under a FOR UPDATE lock
--   on the class row — the same lock the service capacity paths take. A full
--   (or meanwhile archived) class never fails the signup: the enrollment is
--   skipped and surfaced via enrollment_skipped (admin sees an unassigned
--   student; notification deferred to the notifications slice).
-- * minor rule: a student-kind invite refuses a minor birth date (defense in
--   depth, unchanged from v1); dependents may be minors by construction.
-- status: accepted | not_found | revoked | expired | exhausted |
--         email_exists | minor_requires_guardian | birth_date_required |
--         invalid_dependent
CREATE OR REPLACE FUNCTION auth_accept_invite_v2(
  p_token_hash text,
  p_email text,
  p_full_name text,
  p_phone text,
  p_birth_date date,
  p_secret_hash text,
  p_dependents jsonb DEFAULT '[]'::jsonb
)
RETURNS TABLE (
  status text,
  user_id uuid,
  membership_id uuid,
  tenant_id uuid,
  role membership_role,
  student_id uuid,
  guardian_id uuid,
  dependent_student_ids uuid[],
  enrolled_student_ids uuid[],
  enrollment_skipped boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_invite invites%ROWTYPE;
  v_class classes%ROWTYPE;
  v_role membership_role;
  v_user_id uuid;
  v_membership_id uuid;
  v_student_id uuid;
  v_guardian_id uuid;
  v_dependent_ids uuid[] := '{}';
  v_enrolled_ids uuid[] := '{}';
  v_skipped boolean := false;
  v_seats integer := 0;
  v_has_class boolean := false;
  v_dependent jsonb;
  v_dep_name text;
  v_dep_birth date;
  v_new_student uuid;
BEGIN
  SELECT i.* INTO v_invite FROM invites i WHERE i.token_hash = p_token_hash FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'not_found'::text, NULL::uuid, NULL::uuid, NULL::uuid,
      NULL::membership_role, NULL::uuid, NULL::uuid, NULL::uuid[], NULL::uuid[], NULL::boolean;
    RETURN;
  END IF;
  IF v_invite.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT 'revoked'::text, NULL::uuid, NULL::uuid, NULL::uuid,
      NULL::membership_role, NULL::uuid, NULL::uuid, NULL::uuid[], NULL::uuid[], NULL::boolean;
    RETURN;
  END IF;
  IF v_invite.expires_at <= now() THEN
    RETURN QUERY SELECT 'expired'::text, NULL::uuid, NULL::uuid, NULL::uuid,
      NULL::membership_role, NULL::uuid, NULL::uuid, NULL::uuid[], NULL::uuid[], NULL::boolean;
    RETURN;
  END IF;
  IF v_invite.max_uses IS NOT NULL AND v_invite.uses_count >= v_invite.max_uses THEN
    RETURN QUERY SELECT 'exhausted'::text, NULL::uuid, NULL::uuid, NULL::uuid,
      NULL::membership_role, NULL::uuid, NULL::uuid, NULL::uuid[], NULL::uuid[], NULL::boolean;
    RETURN;
  END IF;

  v_role := CASE v_invite.kind WHEN 'student' THEN 'student'::membership_role ELSE 'guardian'::membership_role END;

  IF v_invite.kind = 'student' THEN
    -- students.birth_date is NOT NULL — the person record needs it.
    IF p_birth_date IS NULL THEN
      RETURN QUERY SELECT 'birth_date_required'::text, NULL::uuid, NULL::uuid, NULL::uuid,
        NULL::membership_role, NULL::uuid, NULL::uuid, NULL::uuid[], NULL::uuid[], NULL::boolean;
      RETURN;
    END IF;
    IF p_birth_date > (current_date - interval '18 years') THEN
      RETURN QUERY SELECT 'minor_requires_guardian'::text, NULL::uuid, NULL::uuid, NULL::uuid,
        NULL::membership_role, NULL::uuid, NULL::uuid, NULL::uuid[], NULL::uuid[], NULL::boolean;
      RETURN;
    END IF;
  ELSE
    -- Validate the dependents payload before writing anything.
    IF p_dependents IS NULL OR jsonb_typeof(p_dependents) <> 'array' THEN
      RETURN QUERY SELECT 'invalid_dependent'::text, NULL::uuid, NULL::uuid, NULL::uuid,
        NULL::membership_role, NULL::uuid, NULL::uuid, NULL::uuid[], NULL::uuid[], NULL::boolean;
      RETURN;
    END IF;
    FOR v_dependent IN SELECT * FROM jsonb_array_elements(p_dependents) LOOP
      v_dep_name := NULLIF(trim(v_dependent->>'full_name'), '');
      BEGIN
        v_dep_birth := (v_dependent->>'birth_date')::date;
      EXCEPTION WHEN others THEN
        v_dep_birth := NULL;
      END;
      IF v_dep_name IS NULL OR v_dep_birth IS NULL THEN
        RETURN QUERY SELECT 'invalid_dependent'::text, NULL::uuid, NULL::uuid, NULL::uuid,
          NULL::membership_role, NULL::uuid, NULL::uuid, NULL::uuid[], NULL::uuid[], NULL::boolean;
        RETURN;
      END IF;
    END LOOP;
  END IF;

  IF EXISTS (SELECT 1 FROM users u WHERE lower(u.email) = lower(p_email)) THEN
    RETURN QUERY SELECT 'email_exists'::text, NULL::uuid, NULL::uuid, NULL::uuid,
      NULL::membership_role, NULL::uuid, NULL::uuid, NULL::uuid[], NULL::uuid[], NULL::boolean;
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

  -- Class binding: lock the class row (the same serialization point the
  -- service capacity paths use) and compute free seats once.
  IF v_invite.class_id IS NOT NULL THEN
    SELECT c.* INTO v_class FROM classes c
    WHERE c.tenant_id = v_invite.tenant_id AND c.id = v_invite.class_id
    FOR UPDATE;
    IF FOUND AND v_class.status = 'active' THEN
      v_has_class := true;
      SELECT v_class.capacity - count(*) INTO v_seats
      FROM enrollments e
      WHERE e.tenant_id = v_invite.tenant_id
        AND e.class_id = v_invite.class_id
        AND e.status = 'active';
    END IF;
  END IF;

  IF v_invite.kind = 'student' THEN
    v_student_id := uuid_generate_v7();
    INSERT INTO students (id, tenant_id, user_id, full_name, birth_date, academy_plan_id)
    VALUES (v_student_id, v_invite.tenant_id, v_user_id, p_full_name, p_birth_date,
            v_invite.academy_plan_id);

    IF v_invite.class_id IS NOT NULL THEN
      IF v_has_class AND v_seats > 0 THEN
        INSERT INTO enrollments (id, tenant_id, class_id, student_id)
        VALUES (uuid_generate_v7(), v_invite.tenant_id, v_invite.class_id, v_student_id);
        v_enrolled_ids := array_append(v_enrolled_ids, v_student_id);
      ELSE
        v_skipped := true;
      END IF;
    END IF;
  ELSE
    v_guardian_id := uuid_generate_v7();
    INSERT INTO guardians (id, tenant_id, user_id, full_name, phone, email)
    VALUES (v_guardian_id, v_invite.tenant_id, v_user_id, p_full_name, p_phone, lower(p_email));

    FOR v_dependent IN SELECT * FROM jsonb_array_elements(p_dependents) LOOP
      v_new_student := uuid_generate_v7();
      INSERT INTO students (id, tenant_id, full_name, birth_date, guardian_id, academy_plan_id)
      VALUES (v_new_student, v_invite.tenant_id,
              trim(v_dependent->>'full_name'), (v_dependent->>'birth_date')::date,
              v_guardian_id, v_invite.academy_plan_id);
      v_dependent_ids := array_append(v_dependent_ids, v_new_student);

      IF v_invite.class_id IS NOT NULL THEN
        IF v_has_class AND v_seats > 0 THEN
          INSERT INTO enrollments (id, tenant_id, class_id, student_id)
          VALUES (uuid_generate_v7(), v_invite.tenant_id, v_invite.class_id, v_new_student);
          v_enrolled_ids := array_append(v_enrolled_ids, v_new_student);
          v_seats := v_seats - 1;
        ELSE
          v_skipped := true;
        END IF;
      END IF;
    END LOOP;
  END IF;

  UPDATE invites i SET uses_count = i.uses_count + 1, updated_at = now()
  WHERE i.id = v_invite.id;

  RETURN QUERY SELECT 'accepted'::text, v_user_id, v_membership_id, v_invite.tenant_id,
    v_role, v_student_id, v_guardian_id, v_dependent_ids, v_enrolled_ids, v_skipped;
END
$$;--> statement-breakpoint

-- Execution surface: the v2 seam is callable by tatame_app only.
REVOKE ALL ON FUNCTION auth_accept_invite_v2(text, text, text, text, date, text, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_accept_invite_v2(text, text, text, text, date, text, jsonb) TO tatame_app;
