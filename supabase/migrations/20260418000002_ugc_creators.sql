-- Marketing automation: UGC creator pipeline
-- Populated by /api/cron/ugc-outreach from Apify TikTok scrape + manual adds.
-- Status lifecycle: pending_send -> contacted -> negotiating -> briefed -> in_production -> delivered -> posted -> rejected
-- Additive only.

CREATE TABLE IF NOT EXISTS ugc_creators (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT,
  handle TEXT UNIQUE,
  platform TEXT DEFAULT 'tiktok',   -- 'tiktok' | 'instagram' | 'youtube_shorts'
  email TEXT,
  followers INTEGER,
  engagement_rate NUMERIC(5,4),
  niche TEXT,
  fit_score NUMERIC(6,3),
  agreed_rate_gbp INTEGER,
  rate_bracket TEXT,                -- 'under_10k' | '10_50k' | '50_150k' | '150k_plus'
  status TEXT DEFAULT 'pending_send',
  draft_message TEXT,
  notes TEXT,
  brief_sent_at TIMESTAMPTZ,
  contacted_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  video_urls TEXT[],
  payment_reference TEXT,
  payment_sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ugc_creators_status ON ugc_creators (status);
CREATE INDEX IF NOT EXISTS idx_ugc_creators_handle ON ugc_creators (handle);

ALTER TABLE ugc_creators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ugc_creators_service_only ON ugc_creators;
CREATE POLICY ugc_creators_service_only ON ugc_creators
  FOR ALL USING (auth.role() = 'service_role');
