-- Fix get_dispute_summary RPC to correctly count all resolved statuses including 'won', 'partial', 'lost'
-- BUG-M1 from QA report 2026-04-11: disputes with status 'won' were showing as Active instead of Resolved.
-- The resolved_statuses array was incomplete, missing the short-form aliases used by the dispute resolution modal.

CREATE OR REPLACE FUNCTION get_dispute_summary(p_user_id uuid)
RETURNS TABLE(
  total_open        bigint,
  total_resolved    bigint,
  total_disputed_amount numeric,
  total_recovered   numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
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
        'closed', 'withdrawn'
      )
    )::bigint                                                AS total_resolved,
    COALESCE(SUM(disputed_amount), 0)                        AS total_disputed_amount,
    COALESCE(SUM(money_recovered), 0)                        AS total_recovered
  FROM disputes
  WHERE user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION get_dispute_summary(uuid) TO authenticated, service_role;
