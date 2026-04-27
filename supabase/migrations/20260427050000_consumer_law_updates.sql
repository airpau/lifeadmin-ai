-- Storage for the weekly consumer-law / regulatory news scan run by
-- /api/cron/consumer-law-news. Lets the dashboard surface the same
-- list users see in their digest, and gives an audit trail of what
-- the cron has surfaced over time.

CREATE TABLE IF NOT EXISTS consumer_law_updates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- ISO date the cron ran (one entry per source per scan)
  scanned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Headline (≤200 chars), short enough for a Telegram bullet
  headline TEXT NOT NULL,
  -- Two-sentence summary of what changed and why it matters
  summary TEXT NOT NULL,
  -- 'cma' | 'ofcom' | 'ofgem' | 'fca' | 'cra' | 'parliament' | 'court' | 'other'
  source TEXT NOT NULL,
  -- Optional citation URL the user can follow
  source_url TEXT,
  -- Effective date if applicable (e.g. new rule takes force)
  effective_date DATE,
  -- 'high' | 'medium' | 'low' — drives Telegram surfacing threshold
  importance TEXT NOT NULL DEFAULT 'medium',
  -- Bill categories the change affects, e.g. {'energy','broadband'}
  affects_categories TEXT[] DEFAULT '{}',
  -- Free-form Perplexity citation list (IDs or URLs the model used)
  citations JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS consumer_law_updates_scanned_idx
  ON consumer_law_updates (scanned_at DESC);

CREATE INDEX IF NOT EXISTS consumer_law_updates_importance_idx
  ON consumer_law_updates (importance, scanned_at DESC)
  WHERE importance = 'high';

COMMENT ON TABLE consumer_law_updates IS
  'Weekly Perplexity-driven scan of UK consumer-law / regulatory news. Populated by /api/cron/consumer-law-news every Monday 06:00 UTC and surfaced to the founder via Telegram and (eventually) to users on a dashboard page.';
