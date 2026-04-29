-- ============================================================
-- WhatsApp dispute-alert context tracking
-- ============================================================
--
-- Two related bugs Paul reported on 2026-04-29:
--
-- 1. WhatsApp Pocket Agent ignored ACCEPT / REJECT / ESCALATE
--    keyword replies sent right after a dispute alert. Root cause:
--    template-sent alerts (paybacker_dispute_reply) were NEVER
--    logged to whatsapp_message_log, so the bot's conversation
--    history saw nothing — when the user typed "ACCEPT", Claude
--    had no idea what dispute they meant.
--
-- 2. Support tickets created via WhatsApp were tagged
--    source='telegram' because the handler hardcoded the channel
--    based on whether a telegram_sessions row existed. Channel
--    context fix is a code change; this migration adds the
--    columns the alert-correlation half of the fix needs.
--
-- Adds:
--   whatsapp_message_log.dispute_id  — correlate alert + reply
--   whatsapp_sessions.last_alert_dispute_id / last_alert_at
--   telegram_sessions.last_alert_dispute_id / last_alert_at
--   support_tickets accepts source='whatsapp' (CHECK relaxed)

-- ------------------------------------------------------------
-- 1. Per-message dispute correlation
-- ------------------------------------------------------------
ALTER TABLE whatsapp_message_log
  ADD COLUMN IF NOT EXISTS dispute_id UUID REFERENCES disputes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_whatsapp_log_dispute
  ON whatsapp_message_log(dispute_id, created_at DESC)
  WHERE dispute_id IS NOT NULL;

-- ------------------------------------------------------------
-- 2. Per-session most-recent-alert pointer
-- ------------------------------------------------------------
-- Used by the bot to resolve "ACCEPT" / "give me their update"
-- when the user hasn't named a provider — they're acting on the
-- last thing we alerted them about.
ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS last_alert_dispute_id UUID REFERENCES disputes(id) ON DELETE SET NULL;
ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS last_alert_at TIMESTAMPTZ;

ALTER TABLE telegram_sessions
  ADD COLUMN IF NOT EXISTS last_alert_dispute_id UUID REFERENCES disputes(id) ON DELETE SET NULL;
ALTER TABLE telegram_sessions
  ADD COLUMN IF NOT EXISTS last_alert_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- 3. support_tickets.source — relax CHECK to allow 'whatsapp'
-- ------------------------------------------------------------
-- The handler in src/lib/telegram/tool-handlers.ts currently
-- hardcodes 'telegram' or 'chatbot' because it never had an
-- enum to write 'whatsapp' to. Drop and recreate the CHECK
-- (idempotent — DROP IF EXISTS protects re-runs).
DO $$
BEGIN
  -- Find any existing source check constraint and drop it. The
  -- name varies by environment because the original migration
  -- didn't name it explicitly.
  PERFORM 1
  FROM information_schema.table_constraints
  WHERE table_name = 'support_tickets'
    AND constraint_type = 'CHECK'
    AND constraint_name LIKE '%source%';

  IF FOUND THEN
    EXECUTE (
      SELECT 'ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS ' || quote_ident(constraint_name)
      FROM information_schema.table_constraints
      WHERE table_name = 'support_tickets'
        AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%source%'
      LIMIT 1
    );
  END IF;
END $$;

-- 'manual' is a legacy source value present on existing rows — must
-- be in the allowed list or this CHECK fails on re-apply.
ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_source_check
  CHECK (source IN ('chatbot', 'telegram', 'whatsapp', 'email', 'dashboard', 'api', 'manual'));
