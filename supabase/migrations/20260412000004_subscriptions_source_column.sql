-- Add source column to subscriptions so we can distinguish
-- bank-detected vs email-scan-detected vs manually-added items.
-- Also add bank_description to store the raw bank merchant string.
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'manual';
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS bank_description TEXT;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS detected_at TIMESTAMPTZ;
