-- Provider Intelligence: aggregate anonymised contract data across all users
-- to build collective knowledge about provider terms.
-- Sample size must be >= 3 before an entry is created (privacy threshold).
-- Readable by all authenticated users, writable by service_role only.

CREATE TABLE IF NOT EXISTS provider_intelligence (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_name_normalised TEXT NOT NULL,
  contract_type TEXT NOT NULL,
  avg_monthly_cost NUMERIC(10,2),
  median_monthly_cost NUMERIC(10,2),
  common_notice_period TEXT,
  common_minimum_term TEXT,
  common_early_exit_fee TEXT,
  has_price_increase_clause_pct INTEGER,
  common_unfair_clauses JSONB DEFAULT '[]',
  auto_renewal_pct INTEGER,
  sample_size INTEGER NOT NULL DEFAULT 0,
  last_aggregated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider_name_normalised, contract_type)
);

ALTER TABLE provider_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read provider_intelligence"
  ON provider_intelligence FOR SELECT TO authenticated USING (true);
-- No INSERT/UPDATE/DELETE policy for authenticated — service_role only

CREATE INDEX IF NOT EXISTS idx_provider_intelligence_lookup
  ON provider_intelligence(provider_name_normalised, contract_type);
