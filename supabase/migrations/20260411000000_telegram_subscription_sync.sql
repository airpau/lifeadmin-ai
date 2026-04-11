-- Add dismissed_at to subscriptions (used by renewal-reminders cron to suppress reminders
-- and by the Telegram bot when user dismisses a renewal alert — both frontends share this field)
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;

-- Index for the IS NULL check in renewal-reminders
CREATE INDEX IF NOT EXISTS idx_subscriptions_dismissed_at ON subscriptions(dismissed_at) WHERE dismissed_at IS NULL;
