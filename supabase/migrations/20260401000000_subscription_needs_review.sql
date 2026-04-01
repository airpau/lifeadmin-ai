-- Add needs_review flag for auto-detected subscriptions
-- New bank-detected subscriptions are flagged for user review
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS needs_review boolean DEFAULT false;

-- Update detect_and_sync_recurring_transactions to set needs_review = true on new entries
-- (function body updated in the main application deployment)
