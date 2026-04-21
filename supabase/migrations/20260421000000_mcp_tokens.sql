-- Personal access tokens for the Paybacker MCP server
-- Pro-tier feature: lets users expose their own financial data to Claude Desktop
-- via the @paybacker/mcp npm package. Tokens are read-only, user-scoped, and
-- revocable. Default 180-day expiry, nudge to rotate.
--
-- Security model:
--   - Plaintext token is shown ONCE on generation (client keeps it).
--   - We store only SHA-256 hash (fast to verify, irreversible).
--   - token_prefix (first 8 chars) is kept plaintext so users can identify
--     tokens in the UI without seeing the secret.
--   - Every MCP call logs to business_log and bumps last_used_at.
--   - RLS: users only ever see their own tokens.
--
-- Additive only.

CREATE TABLE IF NOT EXISTS mcp_tokens (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                           -- user-chosen label, e.g. "Claude Desktop on Macbook"
  token_hash TEXT NOT NULL UNIQUE,              -- SHA-256 hex of the plaintext token
  token_prefix TEXT NOT NULL,                   -- first 8 chars of plaintext, for UI identification
  scope TEXT NOT NULL DEFAULT 'read',           -- read-only for now; future 'read_write' would need a separate gate
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '180 days'),
  last_used_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,                       -- soft-delete; keeps audit trail
  use_count INTEGER NOT NULL DEFAULT 0
);

-- Fast verification lookup during each MCP request
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_hash
  ON mcp_tokens (token_hash)
  WHERE revoked_at IS NULL;

-- User's own token list (for /account/mcp page)
CREATE INDEX IF NOT EXISTS idx_mcp_tokens_user
  ON mcp_tokens (user_id, created_at DESC)
  WHERE revoked_at IS NULL;

ALTER TABLE mcp_tokens ENABLE ROW LEVEL SECURITY;

-- Users see only their own tokens
DROP POLICY IF EXISTS mcp_tokens_owner_select ON mcp_tokens;
CREATE POLICY mcp_tokens_owner_select ON mcp_tokens
  FOR SELECT
  USING (user_id = auth.uid());

-- Users can revoke their own tokens (UPDATE to set revoked_at)
DROP POLICY IF EXISTS mcp_tokens_owner_update ON mcp_tokens;
CREATE POLICY mcp_tokens_owner_update ON mcp_tokens
  FOR UPDATE
  USING (user_id = auth.uid());

-- Mint + verify happens server-side with service role; no direct INSERT/DELETE from clients
-- (INSERT and DELETE policies are intentionally absent; service_role bypasses RLS)
