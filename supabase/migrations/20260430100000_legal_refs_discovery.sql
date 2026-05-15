-- Active legal-reference discovery pipeline (additive only).
--
-- Goal: turn the compliance centre from a closed seed of ~112 hand-picked
-- refs into an actively-growing corpus, while never auto-mutating the
-- shared `legal_references` table (B2C + B2B both consume it). Every
-- candidate goes through founder review.
--
-- Three additions:
--   1. legal_references gains discovery_source + pending_review for audit.
--   2. legal_ref_discovery_runs logs every Perplexity discovery cron run.
--   3. legal_ref_candidates is the founder review queue.
--
-- Strictly additive — no DROP, no DELETE, no constraint mutation.

ALTER TABLE public.legal_references
  ADD COLUMN IF NOT EXISTS discovery_source TEXT,
  ADD COLUMN IF NOT EXISTS pending_review BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.legal_ref_discovery_runs (
  id BIGSERIAL PRIMARY KEY,
  run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  leg TEXT NOT NULL,                 -- 'recent_updates' | 'category_coverage'
  category TEXT,                     -- only set for leg B
  candidates_found INTEGER NOT NULL DEFAULT 0,
  candidates_added INTEGER NOT NULL DEFAULT 0,
  candidates_skipped_duplicate INTEGER NOT NULL DEFAULT 0,
  cost_gbp NUMERIC(10,6),
  perplexity_response JSONB,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_legal_ref_discovery_runs_at
  ON public.legal_ref_discovery_runs(run_at DESC);

CREATE TABLE IF NOT EXISTS public.legal_ref_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  title TEXT NOT NULL,
  source_url TEXT,
  source_type TEXT,
  summary TEXT,
  category TEXT,
  jurisdiction TEXT DEFAULT 'UK',
  confidence TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','duplicate')),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  notes TEXT,
  duplicate_of UUID,
  discovery_run_id BIGINT
);

CREATE INDEX IF NOT EXISTS idx_legal_ref_candidates_status
  ON public.legal_ref_candidates(status, discovered_at DESC);

CREATE INDEX IF NOT EXISTS idx_legal_ref_candidates_source_url
  ON public.legal_ref_candidates(source_url);

-- Enable RLS but leave it locked down — only service-role-keyed crons /
-- the founder admin endpoints touch these tables. No user-facing access.
ALTER TABLE public.legal_ref_discovery_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_ref_candidates ENABLE ROW LEVEL SECURITY;
