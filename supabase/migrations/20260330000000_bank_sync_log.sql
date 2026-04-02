-- Tiered bank sync: drop old single-connection constraint, add multi-connection support,
-- add manual sync tracking columns, and create audit log table.

-- 1. Drop the user_id-only unique constraint that prevents multiple bank connections per user.
--    The callback already upserts on (user_id, provider_id) which is the correct dedup key.
ALTER TABLE bank_connections DROP CONSTRAINT IF EXISTS bank_connections_user_id_key;

-- 2. Add composite unique constraint so reconnecting to the same bank upserts correctly.
ALTER TABLE bank_connections ADD CONSTRAINT bank_connections_user_provider_key
  UNIQUE (user_id, provider_id);

-- 3. Track when a Pro user last manually triggered a sync (used for 6-hour cooldown).
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS last_manual_sync_at TIMESTAMPTZ;

-- 4. Audit log for every sync attempt — used for cost tracking and the global API ceiling.
CREATE TABLE IF NOT EXISTS bank_sync_log (
  id               UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id          UUID          REFERENCES profiles(id)        ON DELETE CASCADE NOT NULL,
  connection_id    UUID          REFERENCES bank_connections(id) ON DELETE SET NULL,
  trigger_type     TEXT          NOT NULL CHECK (trigger_type IN ('cron', 'manual', 'initial')),
  status           TEXT          NOT NULL CHECK (status IN ('success', 'failed', 'skipped')),
  api_calls_made   INTEGER       DEFAULT 0,
  error_message    TEXT,
  created_at       TIMESTAMPTZ   DEFAULT NOW()
);

ALTER TABLE bank_sync_log ENABLE ROW LEVEL SECURITY;

-- Users can only read their own sync history (no write access from client)
CREATE POLICY "Users view own sync logs"
  ON bank_sync_log FOR SELECT
  USING (auth.uid() = user_id);

-- Efficient queries: per-user recent logs, and global daily ceiling check
CREATE INDEX IF NOT EXISTS idx_bank_sync_log_user_created
  ON bank_sync_log(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bank_sync_log_created
  ON bank_sync_log(created_at DESC);
