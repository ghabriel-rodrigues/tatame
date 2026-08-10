-- Config slice hardening (spec 011, CFG.1/CFG.3). The public invite landing
-- seam served the academy branding from the dropped `theme` jsonb placeholder;
-- it now returns the typed brand columns. The return table changes, so the
-- function is dropped and recreated (grants re-applied — DROP loses them).
DROP FUNCTION IF EXISTS auth_invite_landing(text);--> statement-breakpoint

-- Public invite landing: token -> academy branding + inherited bindings.
-- status: valid | not_found | revoked | expired | exhausted
CREATE FUNCTION auth_invite_landing(p_token_hash text)
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
  academy_brand_deep text,
  academy_brand_vibrant text,
  academy_brand_accent text,
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
      NULL::text, NULL::text, NULL::text, NULL::academy_status;
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
    v_academy.name, v_academy.slug, v_academy.logo_url,
    v_academy.brand_deep::text, v_academy.brand_vibrant::text, v_academy.brand_accent::text,
    v_academy.status;
END
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION auth_invite_landing(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION auth_invite_landing(text) TO tatame_app;
