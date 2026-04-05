-- Telegram proactive notification deduplication tables
-- Created: 2026-04-05

-- Tracks budget threshold alerts sent per user/category/threshold/month
-- Prevents re-sending the same 80% or 100% budget alert within the same month
CREATE TABLE IF NOT EXISTS budget_alert_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  threshold INTEGER NOT NULL, -- 80 or 100
  month TEXT NOT NULL,        -- YYYY-MM
  alerted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_budget_alert_log_unique
  ON budget_alert_log(user_id, category, threshold, month);

CREATE INDEX IF NOT EXISTS idx_budget_alert_log_user_month
  ON budget_alert_log(user_id, month);

-- General notification deduplication log
-- Prevents milestone, price-increase, and other one-shot alerts from re-firing
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  notification_type TEXT NOT NULL, -- e.g. 'savings_milestone', 'price_increase', 'payday_summary'
  reference_key TEXT NOT NULL,     -- e.g. 'milestone_500', 'netflix_2026-04', '2026-04-05'
  sent_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_log_unique
  ON notification_log(user_id, notification_type, reference_key);

CREATE INDEX IF NOT EXISTS idx_notification_log_user_type
  ON notification_log(user_id, notification_type);
