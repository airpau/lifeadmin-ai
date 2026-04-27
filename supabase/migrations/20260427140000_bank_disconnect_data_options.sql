-- ============================================================
-- Bank disconnect data-retention options (2026-04-27)
--
-- Adds the columns and audit table required to give the user three
-- choices when disconnecting a bank:
--
--   1. keep_history     - revoke consent, keep transactions visible
--                         (current default — no schema change needed)
--   2. delete_transactions - revoke consent, set deleted_at on every
--                            transaction for that connection.
--                            A 30-day cron purges deleted_at rows older
--                            than 30 days. Until then the user can
--                            restore via the UI.
--   3. erase_all        - revoke consent, hard-delete the transactions
--                         and the connection row. Audit-logged for
--                         GDPR right-to-erasure compliance.
-- ============================================================

-- 1. Soft-delete column on bank_transactions. Partial index keeps the
--    common "show me my live transactions" query fast.
ALTER TABLE bank_transactions
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_bank_transactions_live
  ON bank_transactions (user_id, timestamp DESC)
  WHERE deleted_at IS NULL;

-- 2. Audit log for hard deletes. Required for GDPR right-to-erasure
--    requests so we can prove the data was removed and when.
CREATE TABLE IF NOT EXISTS bank_disconnect_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connection_id UUID,            -- nullable: hard-delete removes the row
  bank_name TEXT,
  provider TEXT,                 -- 'truelayer' | 'yapily'
  mode TEXT NOT NULL CHECK (mode IN ('keep_history', 'delete_transactions', 'erase_all', 'restore')),
  transactions_affected INTEGER NOT NULL DEFAULT 0,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE bank_disconnect_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can read own disconnect audit" ON bank_disconnect_audit;
CREATE POLICY "Users can read own disconnect audit"
  ON bank_disconnect_audit FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_bank_disconnect_audit_user
  ON bank_disconnect_audit (user_id, created_at DESC);

COMMENT ON TABLE bank_disconnect_audit IS
  'Audit trail for bank disconnects. Required for GDPR right-to-erasure proof. Rows survive even if the original connection_id is hard-deleted.';

-- 3. Restore helper RPC. Takes a connection_id and revives any
--    transactions soft-deleted within the last 30 days.
CREATE OR REPLACE FUNCTION public.restore_soft_deleted_transactions(
  p_user_id uuid,
  p_connection_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_restored integer;
BEGIN
  UPDATE bank_transactions
     SET deleted_at = NULL
   WHERE user_id = p_user_id
     AND connection_id = p_connection_id
     AND deleted_at IS NOT NULL
     AND deleted_at > NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_restored = ROW_COUNT;

  -- Also un-revoke the connection so syncing resumes if the user has
  -- re-authorised. (If they haven't, sync will fail and mark expired.)
  UPDATE bank_connections
     SET status = 'active', deleted_at = NULL, updated_at = NOW()
   WHERE id = p_connection_id
     AND user_id = p_user_id
     AND status = 'revoked';

  INSERT INTO bank_disconnect_audit (user_id, connection_id, mode, transactions_affected, reason)
  SELECT p_user_id, p_connection_id, 'restore', v_restored,
         'Restored within 30-day recovery window';

  RETURN v_restored;
END;
$$;

-- 4. Daily cron purges transactions soft-deleted > 30 days ago. Called
--    by /api/cron/purge-soft-deleted (added in vercel.json separately).
CREATE OR REPLACE FUNCTION public.purge_expired_soft_deletes()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_purged integer;
BEGIN
  DELETE FROM bank_transactions
   WHERE deleted_at IS NOT NULL
     AND deleted_at < NOW() - INTERVAL '30 days';
  GET DIAGNOSTICS v_purged = ROW_COUNT;
  RETURN v_purged;
END;
$$;
