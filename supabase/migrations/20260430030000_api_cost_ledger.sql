-- Internal API cost ledger.
-- All paid third-party API calls (Anthropic, Perplexity, Resend, Stripe,
-- TrueLayer, etc.) should write a row here so the founder-only billing
-- dashboard at /dashboard/admin/billing can show real spend with per-provider,
-- per-model, per-endpoint, per-user, and per-tier breakdowns.
CREATE TABLE IF NOT EXISTS api_cost_ledger (
  id BIGSERIAL PRIMARY KEY,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  provider TEXT NOT NULL,
  model TEXT,
  endpoint TEXT,
  user_id UUID,
  input_tokens INT,
  output_tokens INT,
  cost_gbp NUMERIC(10,6) NOT NULL,
  metadata JSONB
);
CREATE INDEX IF NOT EXISTS idx_api_cost_ledger_occurred ON api_cost_ledger(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_cost_ledger_provider ON api_cost_ledger(provider, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_api_cost_ledger_user ON api_cost_ledger(user_id, occurred_at DESC);
