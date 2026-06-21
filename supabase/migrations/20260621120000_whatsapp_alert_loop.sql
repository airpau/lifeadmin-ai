-- WhatsApp alert self-learning closed loop — additive schema only.
--
-- Closes the measurement + attribution gaps so the EXISTING intelligence
-- platform (intelligence_events / intelligence_stats / intelligence-rollup-daily
-- + consultLedger suppression) can learn from WhatsApp alerts.
--
-- Strictly additive: ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS only.
-- No drops, no type changes, no data mutation. Reuses existing tables — no new
-- stats tables (the intelligence_* ledger is the brain).
--
-- Surfaces touched: B2C consumer Pocket Agent alert pipeline only.

-- 1. Delivery / read receipt telemetry + alert attribution on the message log.
--    Today whatsapp_message_log records what was SENT (provider_message_id) but
--    never ingests Twilio MessageStatus / Meta statuses[] callbacks, so we can't
--    measure delivered/read. These columns are populated by the new
--    /api/whatsapp/status endpoint and the send-time instrumentation.
ALTER TABLE public.whatsapp_message_log
  ADD COLUMN IF NOT EXISTS delivery_status   TEXT,        -- queued|sent|delivered|read|failed|undelivered
  ADD COLUMN IF NOT EXISTS delivered_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS read_at           TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS error_code        TEXT,
  ADD COLUMN IF NOT EXISTS alert_event_id    UUID,        -- → intelligence_events.id for this send
  ADD COLUMN IF NOT EXISTS notification_type TEXT;        -- the EVENT_CATALOG event that triggered it

-- 2. alert_interactions gains the surface + metadata columns the logger
--    (src/lib/alert-interactions.ts) already accepts but couldn't persist.
--    This lets WhatsApp engagement be distinguished from web engagement.
ALTER TABLE public.alert_interactions
  ADD COLUMN IF NOT EXISTS surface  TEXT,                 -- web|telegram|whatsapp|email|api
  ADD COLUMN IF NOT EXISTS metadata JSONB;

-- 3. whatsapp_sessions: pointer to the most-recent alert so an inbound reply
--    can be attributed back to the alert that prompted it (engagement signal).
--    last_alert_at already exists (2026-04-29); add the template + event id.
ALTER TABLE public.whatsapp_sessions
  ADD COLUMN IF NOT EXISTS last_alert_template TEXT,
  ADD COLUMN IF NOT EXISTS last_alert_event_id UUID;

-- 4. Indexes: status callbacks look up by provider_message_id; attribution and
--    the coach cron scan a user's recent sends by (user_id, created_at).
CREATE INDEX IF NOT EXISTS idx_wal_provider_msg
  ON public.whatsapp_message_log (provider_message_id);
CREATE INDEX IF NOT EXISTS idx_wal_user_created
  ON public.whatsapp_message_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wal_alert_event
  ON public.whatsapp_message_log (alert_event_id)
  WHERE alert_event_id IS NOT NULL;

-- No RLS changes: whatsapp_message_log, alert_interactions and whatsapp_sessions
-- already have policies; adding columns inherits them. intelligence_events /
-- intelligence_stats are reused as-is.
