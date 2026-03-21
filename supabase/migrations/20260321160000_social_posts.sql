CREATE TABLE IF NOT EXISTS social_posts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  platform TEXT NOT NULL,
  pillar TEXT NOT NULL,
  content TEXT NOT NULL,
  hashtags TEXT,
  image_prompt TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'posted', 'rejected')),
  scheduled_for TIMESTAMPTZ,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
