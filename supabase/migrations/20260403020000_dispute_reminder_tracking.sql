-- Add reminder tracking columns to disputes table
-- Additive only: never drops or alters existing columns

ALTER TABLE disputes ADD COLUMN IF NOT EXISTS last_reminder_sent TIMESTAMPTZ;
ALTER TABLE disputes ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;

-- Index to efficiently query disputes due for a reminder
CREATE INDEX IF NOT EXISTS idx_disputes_last_reminder_sent ON disputes(last_reminder_sent);
