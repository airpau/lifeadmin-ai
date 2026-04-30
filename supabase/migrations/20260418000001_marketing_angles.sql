-- Marketing automation: HARO / Qwoted pull-quote library
-- Seeded from docs/marketing/templates/haro-qwoted-responses.md
-- Used by /api/cron/press-outreach to ground journalist-query draft responses.
-- Additive only.

CREATE TABLE IF NOT EXISTS marketing_angles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  topic TEXT NOT NULL,              -- 'broadband_mid_contract' | 'pofa_parking' | 'uk261' | 'subscription_auto_renewal' | 'energy_back_billing' | 'council_tax_voa' | 'access_to_justice'
  pull_quote TEXT NOT NULL,
  supporting_context TEXT,
  legislation_cited TEXT,
  evidence_numbers TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_angles_topic ON marketing_angles (topic);

ALTER TABLE marketing_angles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS marketing_angles_service_only ON marketing_angles;
CREATE POLICY marketing_angles_service_only ON marketing_angles
  FOR ALL USING (auth.role() = 'service_role');
