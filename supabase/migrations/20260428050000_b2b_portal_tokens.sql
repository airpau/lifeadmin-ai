-- Single-use, time-limited portal tokens for B2B customers to access
-- /dashboard/api-keys without a Paybacker user account. Issued via
-- /api/v1/portal-login by emailing the work_email on the key. We
-- store only a SHA-256 hash so a leaked DB row cannot be used.
CREATE TABLE IF NOT EXISTS b2b_portal_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS b2b_portal_tokens_hash_idx
  ON b2b_portal_tokens (token_hash) WHERE used_at IS NULL;
CREATE INDEX IF NOT EXISTS b2b_portal_tokens_email_idx
  ON b2b_portal_tokens (email);
