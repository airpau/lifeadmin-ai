-- IP-based rate limiting table for consumer API routes
-- Stores hashed IPs so we never persist raw addresses (GDPR/privacy friendly)
CREATE TABLE IF NOT EXISTS api_rate_limits (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ip_hash TEXT NOT NULL,
  route TEXT NOT NULL,
  window_start TIMESTAMPTZ NOT NULL,
  request_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Unique constraint prevents double-counting from race conditions
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_rate_limits_ip_route_window
  ON api_rate_limits (ip_hash, route, window_start);

-- Cleanup old windows automatically (optional — crons can also purge)
CREATE INDEX IF NOT EXISTS idx_api_rate_limits_window_start
  ON api_rate_limits (window_start);

COMMENT ON TABLE api_rate_limits IS 'Sliding-window rate limit counters per IP hash + route. Privacy-first: IPs are SHA-256 hashed before storage.';
