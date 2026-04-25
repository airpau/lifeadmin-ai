-- Marketing automation: partnership / B2B pipeline
-- Populated manually + by future partnership-outreach cron.
-- Status lifecycle: prospect -> contacted -> meeting_booked -> in_diligence -> signed | dead
-- Additive only.

CREATE TABLE IF NOT EXISTS partnership_pipeline (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  partner_type TEXT,                -- 'challenger_bank' | 'cashback' | 'citizens_advice' | 'price_comparison' | 'insurance_broker' | 'other'
  company_name TEXT NOT NULL,
  contact_name TEXT,
  contact_email TEXT,
  contact_linkedin TEXT,
  pitch_hook TEXT,
  status TEXT DEFAULT 'prospect',
  next_action TEXT,
  next_action_due TIMESTAMPTZ,
  first_contacted_at TIMESTAMPTZ,
  meeting_booked_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  deal_value_gbp INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_partnership_pipeline_status ON partnership_pipeline (status);
CREATE INDEX IF NOT EXISTS idx_partnership_pipeline_due
  ON partnership_pipeline (next_action_due) WHERE next_action_due IS NOT NULL;

ALTER TABLE partnership_pipeline ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS partnership_pipeline_service_only ON partnership_pipeline;
CREATE POLICY partnership_pipeline_service_only ON partnership_pipeline
  FOR ALL USING (auth.role() = 'service_role');
