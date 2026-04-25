-- Marketing automation: content ideas library
-- Seeded from docs/marketing/templates/tiktok-reels-30-seed-ideas.md
-- Used by /api/cron/content-ideas-generator to pull fresh unused ideas each morning.
-- Additive only — CREATE TABLE IF NOT EXISTS per project rules.

CREATE TABLE IF NOT EXISTS content_ideas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  hook TEXT NOT NULL,
  pillar TEXT NOT NULL,            -- 'injustice' | 'product' | 'education' | 'founder'
  target_platform TEXT NOT NULL,   -- 'tiktok' | 'instagram' | 'linkedin' | 'x' | 'facebook'
  format TEXT NOT NULL,            -- 'reel' | 'static' | 'carousel' | 'long_form'
  image_prompt TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  performance_avg JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_content_ideas_unused
  ON content_ideas (last_used_at NULLS FIRST, created_at);

-- RLS: admin-only. No public read.
ALTER TABLE content_ideas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_ideas_service_only ON content_ideas;
CREATE POLICY content_ideas_service_only ON content_ideas
  FOR ALL USING (auth.role() = 'service_role');
