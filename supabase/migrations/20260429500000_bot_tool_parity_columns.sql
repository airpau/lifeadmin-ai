-- Close schema gaps for the 49-tool parity batch (commit 666f9944)
-- so every bot write persists to the same Supabase tables the
-- website reads from. Without these columns the corresponding
-- tools degraded to "feature partial" responses.

ALTER TABLE disputes ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS snooze_until TIMESTAMPTZ;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS user_tag TEXT;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS monthly_budget NUMERIC(10,2);
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS free_months_earned INTEGER DEFAULT 0;
ALTER TABLE telegram_alert_preferences ADD COLUMN IF NOT EXISTS alerts_paused_until DATE;

CREATE INDEX IF NOT EXISTS idx_tasks_snooze_until
  ON tasks(snooze_until) WHERE snooze_until IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_disputes_archived_at
  ON disputes(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_subscriptions_archived_at
  ON subscriptions(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_transactions_user_tag
  ON bank_transactions(user_tag) WHERE user_tag IS NOT NULL;
