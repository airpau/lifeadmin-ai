-- Add model_used column to telegram_message_log
-- Tracks which Claude model handled each outbound message (haiku vs sonnet)
ALTER TABLE telegram_message_log
  ADD COLUMN IF NOT EXISTS model_used TEXT;
