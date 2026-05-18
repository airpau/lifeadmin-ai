-- Bank connection consent-failure threshold + recovery
--
-- Context: a single Yapily 401/403 was flipping bank_connections.status
-- to 'expired' even when the underlying consent was healthy. The 47721d4b
-- guard helped on generic 403s, but:
--   1. ANY 401 was still treated as definitive consent expiry, including
--      sandbox 401s caused by scope/auth issues.
--   2. The bank-sync cron's WHERE clause excludes 'expired' status, so
--      once flipped, the connection can NEVER auto-recover even after
--      the underlying error clears.
--   3. No tolerance for transient errors — one flake = disconnect.
--
-- Fix:
--   - Track consecutive consent failures per connection (count + last_at)
--   - Require 3 consecutive failures before flipping status
--   - Reset counter on any successful Yapily call or fresh reconnect
--   - One-time data fix: unstick currently-wrongly-flipped Yapily rows
--     whose consent_expires_at is still in the future (i.e. genuine
--     consent is alive — they were flipped by the bug, not by expiry).

ALTER TABLE bank_connections
  ADD COLUMN IF NOT EXISTS consent_failure_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS consent_last_failure_at TIMESTAMPTZ;

-- Index isn't strictly required (the column is read inline during sync),
-- but adding a partial covers the recovery query we use to find wrongly-
-- flipped rows on backfill / admin reset.
CREATE INDEX IF NOT EXISTS idx_bank_connections_recoverable
  ON bank_connections (consent_expires_at)
  WHERE status = 'expired' AND consent_expires_at IS NOT NULL;

-- ── One-time unstick ──
-- Reset Yapily connections that were wrongly flipped to 'expired' but
-- whose consent is genuinely still valid (consent_expires_at in the
-- future, not deleted, not user-revoked). This unsticks Paul's HSBC
-- and any other connection caught by the pre-47721d4b false-disconnect
-- bug. consent_failure_count is also reset so the threshold logic starts
-- from a clean slate.
UPDATE bank_connections
   SET status = 'active',
       consent_failure_count = 0,
       consent_last_failure_at = NULL,
       updated_at = now()
 WHERE provider = 'yapily'
   AND status = 'expired'
   AND consent_expires_at IS NOT NULL
   AND consent_expires_at > now()
   AND deleted_at IS NULL
   AND archived_at IS NULL;
