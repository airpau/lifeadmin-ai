-- B2B idempotency cache.
--
-- Stores hashed idempotency keys + the response we returned the first
-- time the caller used that key. Replays of the same key within the
-- TTL return the cached response unchanged — same status code, same
-- body, same X-RateLimit-Remaining, no monthly counter increment, no
-- additional Anthropic spend.
--
-- Plaintext keys are NEVER stored. We hash with SHA-256 (32 bytes,
-- base64-encoded for readability) and key the cache table on that
-- digest scoped per api key, so the same idempotency_key value used
-- across two different API keys is treated as two distinct entries
-- (avoids cross-tenant collision).
--
-- TTL: 24h. Older rows are pruned by the daily purge cron. The
-- check at the top of /api/v1/disputes uses (key_id, key_hash) to
-- look up; a row found whose created_at is < 24h old short-circuits.

CREATE TABLE IF NOT EXISTS b2b_idempotency_keys (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Owning API key. The SAME idempotency_key value used by two
  -- different api keys is intentionally treated as two distinct
  -- entries — never share cached responses across tenants.
  key_id       uuid NOT NULL REFERENCES b2b_api_keys(id) ON DELETE CASCADE,
  -- SHA-256 of the plaintext idempotency_key, base64-encoded. Indexed
  -- with key_id for the fast-path lookup.
  key_hash     text NOT NULL,
  -- HTTP status code we returned the first time.
  status_code  integer NOT NULL,
  -- Full response body we returned the first time. JSONB so a 200
  -- success response and a 4xx error response both round-trip
  -- correctly. Capped to 64KB at insert by the route handler.
  response     jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT NOW()
);

-- Lookup index. Both columns are required for the cache check.
CREATE UNIQUE INDEX IF NOT EXISTS b2b_idempotency_keys_lookup
  ON b2b_idempotency_keys (key_id, key_hash);

-- TTL helper — used by the daily purge cron and surfacable to ops
-- when investigating "why did my replay get a fresh response".
CREATE INDEX IF NOT EXISTS b2b_idempotency_keys_created_at
  ON b2b_idempotency_keys (created_at);

-- RLS: never accessible to authenticated users; service-role only.
-- B2B customer keys don't go through Supabase auth at all, so RLS
-- here is purely belt-and-braces against future schema-wide policies.
ALTER TABLE b2b_idempotency_keys ENABLE ROW LEVEL SECURITY;
