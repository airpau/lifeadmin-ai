-- Phase 4: Provider T&Cs Database
-- Table and seed data applied via MCP, this file is for version control

CREATE TABLE IF NOT EXISTS provider_terms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  display_name TEXT NOT NULL,
  logo_url TEXT,
  cancellation_url TEXT,
  cancellation_phone TEXT,
  cancellation_email TEXT,
  cancellation_method TEXT,
  notice_period_days INTEGER,
  cooling_off_days INTEGER DEFAULT 14,
  early_exit_fee_info TEXT,
  complaints_url TEXT,
  complaints_email TEXT,
  complaints_phone TEXT,
  complaints_response_days INTEGER DEFAULT 56,
  final_response_deadline_days INTEGER,
  ombudsman_name TEXT,
  ombudsman_url TEXT,
  ombudsman_deadline_days INTEGER,
  alternative_dispute_resolution TEXT,
  terms_url TEXT,
  terms_last_checked TIMESTAMPTZ,
  key_terms JSONB,
  unfair_terms_notes TEXT,
  price_increase_notice_days INTEGER,
  price_increase_exit_rights TEXT,
  active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_provider_terms_name_type ON provider_terms(provider_name, provider_type);
CREATE INDEX IF NOT EXISTS idx_provider_terms_type ON provider_terms(provider_type);

ALTER TABLE provider_terms ENABLE ROW LEVEL SECURITY;
