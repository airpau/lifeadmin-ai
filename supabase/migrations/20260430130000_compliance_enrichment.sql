-- Compliance enrichment columns (PR ζ)
-- Adds enrichment_data JSONB + enriched_at TIMESTAMPTZ to the pending
-- review tables created by sibling PRs (δ, ε). If those tables don't
-- exist yet in this environment, the DO blocks no-op and the migration
-- still succeeds — keeps ζ deployable independently of its siblings.
--
-- Additive only. Never DROP.

DO $$ BEGIN
  ALTER TABLE public.legal_ref_corrections
    ADD COLUMN IF NOT EXISTS enrichment_data JSONB,
    ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'legal_ref_corrections does not exist yet — skipping enrichment columns';
END $$;

DO $$ BEGIN
  ALTER TABLE public.legal_ref_candidates
    ADD COLUMN IF NOT EXISTS enrichment_data JSONB,
    ADD COLUMN IF NOT EXISTS enriched_at TIMESTAMPTZ;
EXCEPTION WHEN undefined_table THEN
  RAISE NOTICE 'legal_ref_candidates does not exist yet — skipping enrichment columns';
END $$;
