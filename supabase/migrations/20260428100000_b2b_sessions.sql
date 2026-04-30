-- Long-lived portal sessions for B2B customers. Magic-link flow mints
-- a 30-day cookie-bound session so customers don't have to check their
-- email every time they want to view the portal. SAMESITE=Lax cookies,
-- HttpOnly, Secure. Hashed token at rest.
CREATE TABLE IF NOT EXISTS b2b_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS b2b_sessions_email_idx
  ON b2b_sessions (email, expires_at DESC);
CREATE INDEX IF NOT EXISTS b2b_sessions_hash_idx
  ON b2b_sessions (token_hash) WHERE revoked_at IS NULL;
