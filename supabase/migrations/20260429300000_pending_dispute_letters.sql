-- Pending dispute letters — track the lifecycle of a bot-drafted
-- letter from "Claude wrote it" → "user copied it out and sent it
-- via Gmail" → saved to dispute history.
--
-- The bot can't observe the email send, so we have to ASK the user.
-- Paul flagged 2026-04-29: relying on the user to remember to say
-- "I've sent it" is unreliable — they draft, copy, send, forget.
-- This table backs a 1-hour follow-up cron that proactively pings
-- "Did you send the X letter? Reply SAVE / DISCARD / I want changes."
--
-- Lifecycle:
--   pending  ← inserted by draftDisputeLetter
--   saved    ← user replied SAVE (record_letter_sent fires)
--   discarded ← user replied DISCARD or asked for changes
--   expired  ← 48h with no resolution; final message sent

CREATE TABLE IF NOT EXISTS pending_dispute_letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dispute_id UUID NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  letter_text TEXT NOT NULL,
  letter_title TEXT,
  -- Channel that produced the draft so the follow-up cron knows
  -- where to send the ping. Always one of telegram / whatsapp /
  -- chatbot — matches the channel arg passed to executeToolCall.
  channel TEXT NOT NULL CHECK (channel IN ('telegram', 'whatsapp', 'chatbot')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'saved', 'discarded', 'expired')),
  drafted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- When to send the 1-hour follow-up. Null after sending.
  followup_due_at TIMESTAMPTZ,
  followup_sent_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE pending_dispute_letters ENABLE ROW LEVEL SECURITY;

-- Service-role only — the bot tools and the follow-up cron use
-- the admin client; users never query this table directly.
DROP POLICY IF EXISTS "service_role_only_pending_letters" ON pending_dispute_letters;
CREATE POLICY "service_role_only_pending_letters"
  ON pending_dispute_letters
  USING (auth.role() = 'service_role');

-- Cron query path: WHERE status='pending' AND followup_due_at <= NOW()
-- AND followup_sent_at IS NULL
CREATE INDEX IF NOT EXISTS idx_pending_letters_due
  ON pending_dispute_letters(followup_due_at)
  WHERE status = 'pending' AND followup_sent_at IS NULL;

-- Resolver query path: find the most recent pending row for
-- (user, dispute) when record_letter_sent or discard fires.
CREATE INDEX IF NOT EXISTS idx_pending_letters_user_dispute
  ON pending_dispute_letters(user_id, dispute_id, status, drafted_at DESC)
  WHERE status = 'pending';
