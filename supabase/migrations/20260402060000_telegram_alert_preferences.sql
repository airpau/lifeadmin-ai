-- User alert preferences for Telegram Pocket Agent
-- Users can mute specific alert types or all alerts via the bot

CREATE TABLE IF NOT EXISTS telegram_alert_preferences (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Master switches
  morning_summary BOOLEAN DEFAULT true,
  evening_summary BOOLEAN DEFAULT true,
  proactive_alerts BOOLEAN DEFAULT true,

  -- Individual alert type toggles
  price_increase_alerts BOOLEAN DEFAULT true,
  contract_expiry_alerts BOOLEAN DEFAULT true,
  budget_overrun_alerts BOOLEAN DEFAULT true,
  renewal_reminders BOOLEAN DEFAULT true,
  dispute_followups BOOLEAN DEFAULT true,

  -- Quiet hours (don't send between these times, UK timezone)
  quiet_start TEXT,  -- e.g. '22:00'
  quiet_end TEXT,    -- e.g. '07:00'

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(user_id)
);

ALTER TABLE telegram_alert_preferences ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_tap_user ON telegram_alert_preferences(user_id);
