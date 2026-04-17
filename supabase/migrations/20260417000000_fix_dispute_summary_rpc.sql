-- Fix get_dispute_summary RPC to correctly count all resolved statuses including 'won', 'partial', 'lost'
-- BUG-M1 from QA report 2026-04-11: disputes with status 'won' were showing as Active instead of Resolved.
-- The resolved_statuses array was incomplete, missing the short-form aliases used by the dispute resolution modal.
--
-- Additional fixes in this migration:
--   P1: Added auth.uid() identity check — SECURITY DEFINER was previously readable by any authenticated user.
--   P2: 'dismissed' added to total_resolved count (was excluded from both open and resolved).
--   P1: Expanded disputes CHECK constraint to include all statuses used by the codebase.
--   P2: New statuses ('in_progress', 'ombudsman', 'pending_response', 'won', 'partial', 'lost',
--       'withdrawn', 'dismissed') were referenced in code but not allowed by the DB constraint.

-- ============================================================
-- 1. EXPAND disputes STATUS CHECK CONSTRAINT
--    Adds all statuses referenced in src/lib/disputes/statuses.ts
-- ============================================================
ALTER TABLE disputes DROP CONSTRAINT IF EXISTS disputes_status_check;
ALTER TABLE disputes ADD CONSTRAINT disputes_status_check CHECK (status IN (
  -- Open statuses (in_progress, ombudsman, pending_response are new)
  'open',
  'in_progress',
  'awaiting_response',
  'escalated',
  'ombudsman',
  'pending_response',
  -- Resolved statuses (won, partial, lost, withdrawn, dismissed are new)
  'resolved_won',
  'resolved_partial',
  'resolved_lost',
  'won',
  'partial',
  'lost',
  'closed',
  'withdrawn',
  'dismissed'
));

-- ============================================================
-- 2. REWRITE get_dispute_summary RPC
--    - Switch to plpgsql so we can run procedural auth guard
--    - Guard: caller must be the user they're querying (P1 fix)
--    - Add 'dismissed' to resolved count (P2 fix)
-- ============================================================
CREATE OR REPLACE FUNCTION get_dispute_summary(p_user_id uuid)
RETURNS TABLE(
  total_open            bigint,
  total_resolved        bigint,
  total_disputed_amount numeric,
  total_recovered       numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  -- P1 security fix: prevent any authenticated user from reading another user's data
  IF auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'Unauthorized: caller % cannot query disputes for user %', auth.uid(), p_user_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  RETURN QUERY
  SELECT
    COUNT(*) FILTER (
      WHERE status NOT IN (
        'resolved_won', 'resolved_partial', 'resolved_lost',
        'won', 'partial', 'lost',
        'closed', 'withdrawn', 'dismissed'
      )
    )::bigint                                                AS total_open,
    COUNT(*) FILTER (
      WHERE status IN (
        'resolved_won', 'resolved_partial', 'resolved_lost',
        'won', 'partial', 'lost',
        'closed', 'withdrawn', 'dismissed'
      )
    )::bigint                                                AS total_resolved,
    COALESCE(SUM(disputed_amount), 0)                        AS total_disputed_amount,
    COALESCE(SUM(money_recovered), 0)                        AS total_recovered
  FROM disputes
  WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_dispute_summary(uuid) TO authenticated, service_role;
