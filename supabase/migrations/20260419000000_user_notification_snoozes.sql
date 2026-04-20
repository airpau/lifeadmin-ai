-- user_notification_snoozes
--
-- Stores per-user snooze records that suppress specific alert types for a period.
--
-- snooze_type values:
--   'price_merchant'  — suppress price-increase alerts for a specific merchant
--   'budget_alerts'   — suppress all budget-overspend alerts
--
-- reference_key:
--   For price_merchant: normalised merchant name (e.g. 'netflix', 'spotify')
--   For budget_alerts:  'all'
--
-- Checked by: cron/telegram-price-increase-detection, cron/telegram-budget-alerts

CREATE TABLE IF NOT EXISTS user_notification_snoozes (
  id            UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  snooze_type   TEXT        NOT NULL,
  reference_key TEXT        NOT NULL,
  snoozed_until TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS user_notification_snoozes_unique
  ON user_notification_snoozes (user_id, snooze_type, reference_key);

ALTER TABLE user_notification_snoozes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own snoozes"
  ON user_notification_snoozes FOR SELECT
  USING (auth.uid() = user_id);
