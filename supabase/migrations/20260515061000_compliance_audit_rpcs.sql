-- Migration: 20260515061000_compliance_audit_rpcs
-- Adds the compliance audit RPCs that the Telegram daily digest calls.
-- Already applied to project kcxxlesishltdmfctlmo on 2026-05-15.
-- All functions are service_role-only, search_path-pinned, SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.audit_compliance_snapshot()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT jsonb_build_object(
    'legal_refs_total',           (SELECT COUNT(*) FROM legal_references),
    'legal_refs_url_dead',        (SELECT COUNT(*) FROM legal_references WHERE consecutive_url_failures >= 3),
    'legal_refs_stale',           (SELECT COUNT(*) FROM legal_references WHERE is_stale = true AND unapplied_effects = true),
    'pending_corrections',        (SELECT COUNT(*) FROM legal_ref_corrections WHERE status = 'pending'),
    'pending_corrections_high',   (SELECT COUNT(*) FROM legal_ref_corrections WHERE status = 'pending' AND confidence = 'high'),
    'pending_candidates',         (SELECT COUNT(*) FROM legal_ref_candidates WHERE status IN ('new','pending','review')),
    'last_discovery_run_at',      (SELECT MAX(run_at) FROM legal_ref_discovery_runs)
  );
$$;

CREATE OR REPLACE FUNCTION public.audit_top_pending_corrections(p_limit integer DEFAULT 5)
RETURNS TABLE (
  id uuid, before_law_name text, proposed_status text, confidence text,
  proposed_at timestamptz, has_proposed_content boolean
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
  SELECT c.id, c.before_law_name, c.proposed_status, c.confidence, c.proposed_at,
         (c.proposed_law_name IS NOT NULL OR c.proposed_source_url IS NOT NULL) AS has_proposed_content
    FROM legal_ref_corrections c
   WHERE c.status = 'pending'
   ORDER BY (c.confidence = 'high') DESC, c.proposed_at DESC NULLS LAST
   LIMIT GREATEST(p_limit, 1);
$$;

CREATE OR REPLACE FUNCTION public.audit_apply_correction(p_correction_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_correction legal_ref_corrections%ROWTYPE;
BEGIN
  SELECT * INTO v_correction FROM legal_ref_corrections WHERE id = p_correction_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'correction_not_found'); END IF;
  IF v_correction.status <> 'pending' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_pending', 'status', v_correction.status);
  END IF;
  IF v_correction.proposed_law_name IS NULL AND v_correction.proposed_source_url IS NULL
     AND v_correction.proposed_status IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_proposed_content');
  END IF;

  UPDATE legal_references r
     SET law_name            = COALESCE(v_correction.proposed_law_name, r.law_name),
         source_url          = COALESCE(v_correction.proposed_source_url, r.source_url),
         verification_status = COALESCE(v_correction.proposed_status, r.verification_status),
         superseded_by       = COALESCE(v_correction.superseded_by, r.superseded_by),
         auto_corrected      = true,
         is_stale            = false,
         unapplied_effects   = false,
         updated_at          = NOW(),
         last_verified       = NOW()
   WHERE r.id = v_correction.ref_id;

  UPDATE legal_ref_corrections
     SET status='applied', reviewed_at=NOW(), reviewed_by='telegram_audit', applied_at=NOW()
   WHERE id = p_correction_id;

  RETURN jsonb_build_object('ok', true, 'ref_id', v_correction.ref_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_snooze_correction(p_correction_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
BEGIN
  UPDATE legal_ref_corrections
     SET status='snoozed', reviewed_at=NOW(), reviewed_by='telegram_audit'
   WHERE id = p_correction_id AND status='pending';
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason','not_pending'); END IF;
  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Bulk-ack: clear noise from high-confidence no-content corrections in one call.
CREATE OR REPLACE FUNCTION public.audit_bulk_ack_no_content_corrections()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE v_count integer;
BEGIN
  WITH targets AS (
    SELECT c.id, c.ref_id FROM legal_ref_corrections c
     WHERE c.status='pending' AND c.confidence='high'
       AND c.proposed_law_name IS NULL AND c.proposed_source_url IS NULL
  ),
  ref_updates AS (
    UPDATE legal_references r
       SET is_stale=false, unapplied_effects=false, last_verified=NOW(), updated_at=NOW(),
           verification_notes = COALESCE(r.verification_notes,'') ||
             E'\n[' || to_char(NOW(),'YYYY-MM-DD') || '] ack: high-confidence still-current via telegram_audit'
      FROM targets t WHERE r.id = t.ref_id RETURNING r.id
  ),
  correction_updates AS (
    UPDATE legal_ref_corrections c
       SET status='applied', applied_at=NOW(), reviewed_at=NOW(),
           reviewed_by='telegram_audit_bulk', notes = COALESCE(c.notes,'') || ' [bulk ack no-content]'
      FROM targets t WHERE c.id = t.id RETURNING c.id
  )
  SELECT COUNT(*) INTO v_count FROM correction_updates;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_compliance_snapshot()                  FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_top_pending_corrections(integer)       FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_apply_correction(uuid)                 FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_snooze_correction(uuid)                FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_bulk_ack_no_content_corrections()      FROM PUBLIC, anon, authenticated;

GRANT  EXECUTE ON FUNCTION public.audit_compliance_snapshot()                  TO service_role;
GRANT  EXECUTE ON FUNCTION public.audit_top_pending_corrections(integer)       TO service_role;
GRANT  EXECUTE ON FUNCTION public.audit_apply_correction(uuid)                 TO service_role;
GRANT  EXECUTE ON FUNCTION public.audit_snooze_correction(uuid)                TO service_role;
GRANT  EXECUTE ON FUNCTION public.audit_bulk_ack_no_content_corrections()      TO service_role;
