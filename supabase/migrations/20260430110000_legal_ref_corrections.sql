-- PR ε — Human-in-loop gate for canonical citation changes
--
-- Proposed corrections from automated verification. Nothing in
-- legal_references gets mutated (in any citation-meaningful field) until
-- a founder approves a row here.
--
-- Companion changes:
--   - legal_references.last_human_review_at — time of last manual touch
--     by a founder (approval / direct admin edit). The pre-send guardrail
--     refuses to cite refs that have never been human-reviewed, even if
--     an automated verifier has marked them current.
--
-- Strictly additive. CREATE TABLE / ADD COLUMN IF NOT EXISTS only.

CREATE TABLE IF NOT EXISTS public.legal_ref_corrections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_id UUID NOT NULL REFERENCES public.legal_references(id) ON DELETE CASCADE,
  proposed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  proposer TEXT NOT NULL,             -- 'perplexity-sonar-pro' | 'haiku-cron' | 'manual'
  before_law_name TEXT,
  before_source_url TEXT,
  before_status TEXT,
  proposed_law_name TEXT,
  proposed_source_url TEXT,
  proposed_status TEXT,
  superseded_by TEXT,
  reasoning TEXT,                     -- explanation from proposer
  raw_response JSONB,                 -- full provider answer for audit
  confidence TEXT NOT NULL,           -- 'high' | 'medium' | 'low'
  cost_gbp NUMERIC(10,6),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','duplicate','superseded_by_newer')),
  reviewed_at TIMESTAMPTZ,
  reviewed_by TEXT,
  applied_at TIMESTAMPTZ,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_legal_ref_corrections_status
  ON public.legal_ref_corrections(status, proposed_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_ref_corrections_ref
  ON public.legal_ref_corrections(ref_id, proposed_at DESC);

ALTER TABLE public.legal_ref_corrections ENABLE ROW LEVEL SECURITY;

-- No client-side access; service role only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'legal_ref_corrections' AND policyname = 'service-role only'
  ) THEN
    CREATE POLICY "service-role only"
      ON public.legal_ref_corrections FOR ALL
      USING (false) WITH CHECK (false);
  END IF;
END $$;

-- Track last human (founder) review on the canonical row. Required by the
-- pre-send guardrail: a ref is only "fresh enough to cite" if a human has
-- ever touched it. The 112 hand-curated seed rows are backfilled to their
-- created_at timestamp since they were authored by hand.
ALTER TABLE public.legal_references
  ADD COLUMN IF NOT EXISTS last_human_review_at TIMESTAMPTZ;

UPDATE public.legal_references
SET last_human_review_at = COALESCE(last_human_review_at, created_at)
WHERE last_human_review_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_legal_refs_last_human_review
  ON public.legal_references(last_human_review_at);
