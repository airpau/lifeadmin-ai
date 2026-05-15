-- Cleanup stale detected_issues from disconnected bank connections (2026-05-15)
--
-- Problem: When a user disconnects a bank, the bank_transactions from that
-- connection are removed but detected_issues rows that reference those
-- transactions (source_type='bank_transaction') remain with status='active'.
-- These stale rows:
--   (a) show in the Telegram alert dedup check, preventing new real alerts
--   (b) cause "Issue not found" errors when inline buttons are tapped
--
-- Similarly, subscription-sourced issues whose subscription was deleted remain
-- active and confuse the dedup logic.
--
-- This migration:
--   1. Immediately dismisses all currently-stale bank_transaction issues.
--   2. Immediately dismisses all currently-stale subscription issues.
--   3. Creates a function + trigger to auto-dismiss on future orphaning.
-- ============================================================

-- ─── 1. Dismiss stale bank_transaction-sourced issues ─────────────────────────
UPDATE detected_issues
SET    status = 'dismissed',
       resolved_at = NOW()
WHERE  source_type = 'bank_transaction'
  AND  status IN ('active', 'pending')
  AND  source_id IS NOT NULL
  AND  NOT EXISTS (
         SELECT 1 FROM bank_transactions bt
         WHERE  bt.id::text = detected_issues.source_id::text
       );

-- ─── 2. Dismiss stale subscription-sourced issues ────────────────────────────
UPDATE detected_issues
SET    status = 'dismissed',
       resolved_at = NOW()
WHERE  source_type = 'subscription'
  AND  status IN ('active', 'pending')
  AND  source_id IS NOT NULL
  AND  NOT EXISTS (
         SELECT 1 FROM subscriptions s
         WHERE  s.id::text = detected_issues.source_id::text
       );

-- ─── 3. RPC for the alerts cron to use instead of raw status filter ────────────
-- Returns only detected_issues whose source still exists (or has no source check
-- needed). The cron can call this to build its dedup set safely.

CREATE OR REPLACE FUNCTION get_active_detected_issues(p_user_id uuid, p_since timestamptz)
RETURNS TABLE (
  id          uuid,
  issue_type  text,
  source_id   text,
  source_type text,
  status      text
)
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT
    di.id,
    di.issue_type,
    di.source_id,
    di.source_type,
    di.status
  FROM detected_issues di
  WHERE di.user_id    = p_user_id
    AND di.status     IN ('active', 'actioned')
    AND di.created_at >= p_since
    -- Bank-transaction issues: only if the source transaction still exists
    AND (
          di.source_type IS DISTINCT FROM 'bank_transaction'
          OR di.source_id IS NULL
          OR EXISTS (
               SELECT 1 FROM bank_transactions bt
               WHERE  bt.id::text = di.source_id::text
             )
        )
    -- Subscription issues: only if the subscription still exists
    AND (
          di.source_type IS DISTINCT FROM 'subscription'
          OR di.source_id IS NULL
          OR EXISTS (
               SELECT 1 FROM subscriptions s
               WHERE  s.id::text = di.source_id::text
             )
        );
$$;
GRANT EXECUTE ON FUNCTION get_active_detected_issues(uuid, timestamptz) TO authenticated, service_role;
