-- Outreach Log — for the 14-day launch sprint
-- Tracks beta-recruitment candidates from Reddit / MSE Forums and DM/call status.
-- Per CLAUDE.md: additive only, CREATE TABLE IF NOT EXISTS, RLS enabled.

CREATE TABLE IF NOT EXISTS outreach_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Where the candidate was discovered
  source TEXT NOT NULL CHECK (source IN ('reddit', 'mse_forums', 'linkedin', 'facebook', 'manual')),
  source_url TEXT NOT NULL,
  source_post_id TEXT, -- Reddit post id / MSE thread id, used for dedupe
  source_subreddit TEXT, -- Reddit only
  source_board TEXT, -- MSE board only

  -- Candidate detail (denormalised so we can read without re-scraping)
  candidate_handle TEXT, -- u/username or MSE display name
  post_title TEXT NOT NULL,
  post_excerpt TEXT, -- first 500 chars
  matched_keywords TEXT[], -- which signals matched (e.g. ['adobe', 'price increase'])
  posted_at TIMESTAMPTZ,

  -- Outreach lifecycle
  status TEXT NOT NULL DEFAULT 'discovered' CHECK (status IN (
    'discovered',     -- found by the scraper
    'qualified',      -- reviewed by Paul, worth a DM
    'rejected',       -- not a fit
    'dm_sent',        -- personal message sent
    'replied',        -- candidate replied
    'call_booked',    -- discovery call scheduled
    'beta_user',      -- onboarded as beta user
    'paying_user',    -- converted to paid
    'declined',       -- said no thanks
    'ghosted'         -- no reply after follow-ups
  )),
  dm_sent_at TIMESTAMPTZ,
  replied_at TIMESTAMPTZ,
  call_booked_at TIMESTAMPTZ,
  beta_user_at TIMESTAMPTZ,

  -- Free-form notes from Paul during the sprint
  notes TEXT,
  paybacker_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE (source, source_post_id) -- dedupe at source level
);

ALTER TABLE outreach_log ENABLE ROW LEVEL SECURITY;
-- Service role only — internal sprint tooling, not user-facing.

CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach_log(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_source ON outreach_log(source, posted_at DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_paybacker_user ON outreach_log(paybacker_user_id) WHERE paybacker_user_id IS NOT NULL;
