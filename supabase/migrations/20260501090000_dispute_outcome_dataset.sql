-- Dispute outcome dataset + intelligence flywheel
-- Strictly additive. Existing disputes columns reused:
--   money_recovered, outcome_notes, resolved_at, status
-- New columns add tagging metadata for the dataset/flywheel.
--
-- Applied in production via Supabase MCP on 2026-05-01.

ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS outcome TEXT,
  ADD COLUMN IF NOT EXISTS outcome_set_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_set_by TEXT,
  ADD COLUMN IF NOT EXISTS outcome_confidence TEXT,
  ADD COLUMN IF NOT EXISTS recovered_amount_gbp NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS resolution_time_days INTEGER,
  ADD COLUMN IF NOT EXISTS provider_first_response_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS provider_first_response_summary TEXT,
  ADD COLUMN IF NOT EXISTS escalation_path TEXT[],
  ADD COLUMN IF NOT EXISTS closed_by TEXT,
  ADD COLUMN IF NOT EXISTS merchant_normalised TEXT,
  ADD COLUMN IF NOT EXISTS merchant_industry TEXT,
  ADD COLUMN IF NOT EXISTS dispute_type TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE constraint_name = 'disputes_outcome_check' AND table_name = 'disputes'
  ) THEN
    ALTER TABLE public.disputes
      ADD CONSTRAINT disputes_outcome_check
      CHECK (outcome IS NULL OR outcome IN ('won','partial','lost','withdrawn','timeout','still_open'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS idx_disputes_outcome ON public.disputes(outcome) WHERE outcome IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_disputes_merchant_norm ON public.disputes(merchant_normalised, outcome);
CREATE INDEX IF NOT EXISTS idx_disputes_dispute_type ON public.disputes(dispute_type, outcome);

CREATE TABLE IF NOT EXISTS public.dispute_outcome_events (
  id BIGSERIAL PRIMARY KEY,
  dispute_id UUID NOT NULL REFERENCES public.disputes(id) ON DELETE CASCADE,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT NOT NULL,
  outcome TEXT NOT NULL,
  recovered_amount_gbp NUMERIC(10,2),
  notes TEXT,
  ai_evidence_excerpt TEXT,
  user_id UUID
);
CREATE INDEX IF NOT EXISTS idx_outcome_events_dispute_at
  ON public.dispute_outcome_events(dispute_id, occurred_at DESC);

ALTER TABLE public.dispute_outcome_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='dispute_outcome_events'
      AND policyname='dispute_outcome_events_select_owner'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY dispute_outcome_events_select_owner
        ON public.dispute_outcome_events FOR SELECT
        USING (user_id = auth.uid())
    $POL$;
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.dispute_intelligence_stats (
  id BIGSERIAL PRIMARY KEY,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  scope_kind TEXT NOT NULL,
  scope_key TEXT NOT NULL,
  total_count INTEGER NOT NULL,
  won_count INTEGER NOT NULL,
  partial_count INTEGER NOT NULL,
  lost_count INTEGER NOT NULL,
  pending_count INTEGER NOT NULL,
  avg_resolution_days NUMERIC(8,2),
  avg_recovered_gbp NUMERIC(10,2),
  total_recovered_gbp NUMERIC(12,2),
  win_rate NUMERIC(4,3),
  metadata JSONB
);
CREATE INDEX IF NOT EXISTS idx_dispute_stats_scope
  ON public.dispute_intelligence_stats(scope_kind, scope_key, computed_at DESC);
