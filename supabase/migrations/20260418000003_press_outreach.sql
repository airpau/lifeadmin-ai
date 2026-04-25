-- Marketing automation: journalist / press outreach pipeline
-- Populated by /api/cron/press-outreach from ResponseSource / Qwoted / HARO feeds + cold pitches.
-- Status lifecycle: pending_send -> sent -> followup_pending -> replied -> placed | dead
-- Additive only.

CREATE TABLE IF NOT EXISTS press_outreach (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  journalist_name TEXT,
  journalist_first_name TEXT,
  journalist_email TEXT,
  publication TEXT,
  query_source TEXT,                -- 'responsesource' | 'qwoted' | 'haro' | 'featured' | 'cold' | 'warm_reconnect'
  query_text TEXT,
  query_deadline TIMESTAMPTZ,
  angle_used TEXT,
  original_pitch TEXT,
  draft_response TEXT,
  followup_draft TEXT,
  status TEXT DEFAULT 'pending_send',
  sent_at TIMESTAMPTZ,
  followup_sent_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  placed_at TIMESTAMPTZ,
  coverage_url TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_press_outreach_status ON press_outreach (status);
CREATE INDEX IF NOT EXISTS idx_press_outreach_deadline ON press_outreach (query_deadline)
  WHERE query_deadline IS NOT NULL;

ALTER TABLE press_outreach ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS press_outreach_service_only ON press_outreach;
CREATE POLICY press_outreach_service_only ON press_outreach
  FOR ALL USING (auth.role() = 'service_role');

-- Staging table for raw inbound email digests (Qwoted / HARO / ResponseSource)
-- that need parsing before upsert into press_outreach.
CREATE TABLE IF NOT EXISTS raw_press_queries (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  source TEXT NOT NULL,
  received_at TIMESTAMPTZ DEFAULT NOW(),
  raw_body TEXT,
  parsed BOOLEAN DEFAULT FALSE,
  parse_error TEXT
);

ALTER TABLE raw_press_queries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raw_press_queries_service_only ON raw_press_queries;
CREATE POLICY raw_press_queries_service_only ON raw_press_queries
  FOR ALL USING (auth.role() = 'service_role');
