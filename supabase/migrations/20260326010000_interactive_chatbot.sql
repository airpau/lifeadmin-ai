-- Interactive Chatbot Dashboard Management (Phase 1)
-- Adds tool audit logging, logo support for subscriptions, and provider domain lookup

-- Chat tool audit log for tracking all tool executions from the chatbot
CREATE TABLE IF NOT EXISTS chat_tool_audit (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  tool_args JSONB,
  tool_result JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE chat_tool_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can manage chat_tool_audit"
  ON chat_tool_audit FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_chat_tool_audit_user ON chat_tool_audit(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_tool_audit_tool ON chat_tool_audit(tool_name);
CREATE INDEX IF NOT EXISTS idx_chat_tool_audit_created ON chat_tool_audit(created_at);

-- Add logo_url column to subscriptions for provider logos
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Provider domains table for logo resolution
CREATE TABLE IF NOT EXISTS provider_domains (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider_name TEXT NOT NULL,
  domain TEXT NOT NULL,
  category TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE provider_domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read provider_domains"
  ON provider_domains FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage provider_domains"
  ON provider_domains FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_provider_domains_name ON provider_domains(provider_name);

-- Seed common UK provider domains for logo resolution
INSERT INTO provider_domains (provider_name, domain, category) VALUES
  ('Netflix', 'netflix.com', 'streaming'),
  ('Spotify', 'spotify.com', 'streaming'),
  ('Amazon Prime', 'amazon.co.uk', 'shopping'),
  ('Disney+', 'disneyplus.com', 'streaming'),
  ('Apple', 'apple.com', 'software'),
  ('Sky', 'sky.com', 'tv'),
  ('BT', 'bt.com', 'broadband'),
  ('Virgin Media', 'virginmedia.com', 'broadband'),
  ('EE', 'ee.co.uk', 'mobile'),
  ('Three', 'three.co.uk', 'mobile'),
  ('Vodafone', 'vodafone.co.uk', 'mobile'),
  ('O2', 'o2.co.uk', 'mobile'),
  ('British Gas', 'britishgas.co.uk', 'energy'),
  ('OVO Energy', 'ovoenergy.com', 'energy'),
  ('Octopus Energy', 'octopus.energy', 'energy'),
  ('EDF', 'edfenergy.com', 'energy'),
  ('E.ON', 'eonenergy.com', 'energy'),
  ('Scottish Power', 'scottishpower.co.uk', 'energy'),
  ('PureGym', 'puregym.com', 'fitness'),
  ('The Gym Group', 'thegymgroup.com', 'fitness'),
  ('David Lloyd', 'davidlloyd.co.uk', 'fitness'),
  ('YouTube', 'youtube.com', 'streaming'),
  ('Now TV', 'nowtv.com', 'streaming'),
  ('Paramount+', 'paramountplus.com', 'streaming'),
  ('Adobe', 'adobe.com', 'software'),
  ('Microsoft', 'microsoft.com', 'software'),
  ('Google', 'google.com', 'software'),
  ('Dropbox', 'dropbox.com', 'software'),
  ('Slack', 'slack.com', 'software'),
  ('Notion', 'notion.so', 'software'),
  ('Aviva', 'aviva.co.uk', 'insurance'),
  ('Direct Line', 'directline.com', 'insurance'),
  ('Admiral', 'admiral.com', 'insurance'),
  ('AA', 'theaa.com', 'insurance'),
  ('RAC', 'rac.co.uk', 'insurance'),
  ('Thames Water', 'thameswater.co.uk', 'water'),
  ('Severn Trent', 'stwater.co.uk', 'water'),
  ('United Utilities', 'unitedutilities.com', 'water'),
  ('Plusnet', 'plus.net', 'broadband'),
  ('TalkTalk', 'talktalk.co.uk', 'broadband'),
  ('Hyperoptic', 'hyperoptic.com', 'broadband'),
  ('Zen Internet', 'zen.co.uk', 'broadband'),
  ('Xbox Game Pass', 'xbox.com', 'gaming'),
  ('PlayStation Plus', 'playstation.com', 'gaming'),
  ('Nintendo', 'nintendo.co.uk', 'gaming'),
  ('The Times', 'thetimes.co.uk', 'news'),
  ('The Telegraph', 'telegraph.co.uk', 'news'),
  ('Financial Times', 'ft.com', 'news'),
  ('The Guardian', 'theguardian.com', 'news'),
  ('Deliveroo', 'deliveroo.co.uk', 'shopping'),
  ('Just Eat', 'just-eat.co.uk', 'shopping'),
  ('Uber Eats', 'ubereats.com', 'shopping'),
  ('HelloFresh', 'hellofresh.co.uk', 'shopping'),
  ('Gousto', 'gousto.co.uk', 'shopping')
ON CONFLICT DO NOTHING;
