-- telegram_pending_alerts
-- Queue for batching proactive Telegram alerts into the daily evening digest.
-- Instead of firing one Telegram message per scan/detection, findings are queued
-- here and flushed as a single batched "daily money update" message each evening.
--
-- Dedup: (user_id, reference_key) is unique — re-scanning the same item
-- within a month does not re-queue it.
--
-- Created: 2026-04-13

CREATE TABLE IF NOT EXISTS telegram_pending_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  telegram_chat_id BIGINT NOT NULL,
  alert_type TEXT NOT NULL,
  -- 'price_increase' | 'bill_detected' | 'subscription_detected' |
  -- 'deal_available' | 'upcoming_bill' | 'contract_expiring' |
  -- 'budget_overrun' | 'unused_subscription' | 'dispute_response' |
  -- 'renewal_imminent'
  provider_name TEXT,
  amount DECIMAL(10,2),           -- current amount (monthly)
  amount_change DECIMAL(10,2),    -- monthly delta — positive = increase
  urgency TEXT DEFAULT 'normal',  -- 'urgent' | 'normal' | 'low'
  reference_key TEXT NOT NULL,    -- dedup key: type + provider + period
  affiliate_url TEXT,             -- tracking URL for deal_available type
  source_id TEXT,                 -- detected_issues.id, email_scan_findings.id, etc.
  metadata JSONB,                 -- extra context for action handlers
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending'   -- 'pending' | 'sent' | 'dismissed'
);

-- Prevent duplicate queuing of the same item in the same period
CREATE UNIQUE INDEX IF NOT EXISTS idx_tpa_user_refkey
  ON telegram_pending_alerts(user_id, reference_key);

-- Efficient lookup of pending items for a user
CREATE INDEX IF NOT EXISTS idx_tpa_user_pending
  ON telegram_pending_alerts(user_id, queued_at)
  WHERE status = 'pending';

ALTER TABLE telegram_pending_alerts ENABLE ROW LEVEL SECURITY;

-- Service role only — users interact via the bot, not directly
CREATE POLICY "Service role full access on telegram_pending_alerts"
  ON telegram_pending_alerts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
