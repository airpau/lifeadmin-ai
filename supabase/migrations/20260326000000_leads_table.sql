-- Lead capture from social media engagement
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT,
  email TEXT,
  platform TEXT NOT NULL,
  platform_user_id TEXT,
  first_message TEXT,
  source_post_id TEXT,
  status TEXT DEFAULT 'new',
  follow_up_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_platform ON leads(platform);
CREATE UNIQUE INDEX IF NOT EXISTS idx_leads_platform_user ON leads(platform, platform_user_id) WHERE platform_user_id IS NOT NULL;
