-- Add Yapily-specific columns to bank_connections
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS institution_id TEXT;
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS consent_token TEXT;
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS consent_granted_at TIMESTAMPTZ;
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS consent_expires_at TIMESTAMPTZ;

-- Extend status check constraint to include new statuses
ALTER TABLE bank_connections DROP CONSTRAINT IF EXISTS bank_connections_status_check;
ALTER TABLE bank_connections ADD CONSTRAINT bank_connections_status_check
  CHECK (status = ANY (ARRAY['active', 'expired', 'revoked', 'token_expired', 'expired_legacy', 'expiring_soon']));

-- Mark existing TrueLayer connections as legacy
UPDATE bank_connections SET status = 'expired_legacy' WHERE provider = 'truelayer' OR provider IS NULL;

-- Index for consent expiry checks
CREATE INDEX IF NOT EXISTS idx_bank_connections_consent_expiry
  ON bank_connections(consent_expires_at)
  WHERE status = 'active' AND consent_expires_at IS NOT NULL;
