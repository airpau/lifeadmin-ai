-- Reverse-lookup: every artefact (B2C complaint letter / B2B dispute
-- response) that cited a given legal_references row. Powers the admin
-- "Where used" drawer + the daily cron's "refs used in last 24h" filter.
-- Service-role writes (fire-and-forget); founder-gated reads.
CREATE TABLE IF NOT EXISTS public.legal_ref_usages (
  id BIGSERIAL PRIMARY KEY,
  ref_id UUID NOT NULL REFERENCES public.legal_references(id) ON DELETE CASCADE,
  used_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  product TEXT NOT NULL,
  artefact_id UUID,
  artefact_kind TEXT,
  user_id UUID,
  api_key_id UUID,
  cited_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_legal_ref_usages_ref_id_at
  ON public.legal_ref_usages(ref_id, used_at DESC);
CREATE INDEX IF NOT EXISTS idx_legal_ref_usages_artefact
  ON public.legal_ref_usages(artefact_kind, artefact_id);

ALTER TABLE public.legal_ref_usages ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'legal_ref_usages'
      AND policyname = 'Deny anon reads of legal_ref_usages'
  ) THEN
    CREATE POLICY "Deny anon reads of legal_ref_usages"
      ON public.legal_ref_usages FOR SELECT
      USING (false);
  END IF;
END $$;
