-- B2B API key store + usage audit for the /v1/disputes surface.
--
-- Authentication model: bearer token in `Authorization: Bearer pbk_xxx`.
-- The plaintext key is shown ONCE at mint time. We persist only the
-- bcrypt-style hash + an 8-char prefix so the admin UI can identify
-- which key a user is talking about without ever seeing the secret.
--
-- Rate limiting: monthly_limit per key, with the count derived from
-- b2b_api_usage rows in the calendar month. Cheap (one COUNT query
-- per request) and works without a Redis dependency.
--
-- Tier metadata follows the indicative pricing on /for-business
-- (Starter / Growth / Enterprise) so we can surface upgrade prompts
-- when a key is approaching its monthly cap.

CREATE TABLE IF NOT EXISTS b2b_api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Display name the customer chose ("Acme Production", "Staging").
  name TEXT NOT NULL,
  -- Owner — links to the b2b_waitlist row when minted via admin
  -- (so we know who the key was issued to and why). Nullable so we
  -- can mint internal/test keys without a waitlist entry.
  waitlist_id UUID REFERENCES b2b_waitlist(id) ON DELETE SET NULL,
  owner_email TEXT,
  -- Secret material
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  -- Plan
  tier TEXT NOT NULL DEFAULT 'starter' CHECK (tier IN ('starter', 'growth', 'enterprise')),
  monthly_limit INTEGER NOT NULL DEFAULT 1000,
  -- Lifecycle
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS b2b_api_keys_prefix_idx
  ON b2b_api_keys (key_prefix)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS b2b_api_keys_waitlist_idx
  ON b2b_api_keys (waitlist_id);

COMMENT ON TABLE b2b_api_keys IS
  'Hashed bearer-token store for the /v1/disputes B2B API. Plaintext shown once at mint. Limit enforcement is per-key per-calendar-month via COUNT on b2b_api_usage.';

-- Per-call audit. Big table over time so we keep it lean — no full
-- request/response bodies, just enough to drive billing + rate limit
-- + usage analytics.
CREATE TABLE IF NOT EXISTS b2b_api_usage (
  id BIGSERIAL PRIMARY KEY,
  key_id UUID NOT NULL REFERENCES b2b_api_keys(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  latency_ms INTEGER,
  -- Optional debug aids — never store the full payload
  scenario_kind TEXT,
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS b2b_api_usage_key_month_idx
  ON b2b_api_usage (key_id, created_at DESC);

COMMENT ON TABLE b2b_api_usage IS
  'Per-call audit for the /v1/disputes API. Used for monthly rate-limit counting + billing reconciliation. Body content intentionally not stored.';
