-- Email scan classifier cache.
-- Cuts Claude calls on re-scans by remembering classifications keyed on
-- sha256(sender_email + '|' + lower(subject)). Cache hits skip Claude entirely.
CREATE TABLE IF NOT EXISTS email_scan_cache (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL,
  cache_key TEXT NOT NULL,
  classification JSONB NOT NULL,
  classified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '90 days'
);
CREATE INDEX IF NOT EXISTS idx_email_scan_cache_user_key ON email_scan_cache(user_id, cache_key);
CREATE INDEX IF NOT EXISTS idx_email_scan_cache_expires ON email_scan_cache(expires_at);
