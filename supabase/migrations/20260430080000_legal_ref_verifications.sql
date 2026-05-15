-- Audit trail for every legal_references verification attempt.
-- Service-role writes, founder-gated reads (RLS denies public).
CREATE TABLE IF NOT EXISTS public.legal_ref_verifications (
  id BIGSERIAL PRIMARY KEY,
  ref_id UUID NOT NULL REFERENCES public.legal_references(id) ON DELETE CASCADE,
  verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  verifier TEXT NOT NULL,
  triggered_by TEXT,
  before_status TEXT,
  after_status TEXT,
  before_url TEXT,
  after_url TEXT,
  changes JSONB,
  cost_gbp NUMERIC(10,6),
  perplexity_response JSONB,
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_legal_ref_verifications_ref_id_at
  ON public.legal_ref_verifications(ref_id, verified_at DESC);

ALTER TABLE public.legal_ref_verifications ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'legal_ref_verifications'
      AND policyname = 'Deny anon reads of legal_ref_verifications'
  ) THEN
    -- No public-readable policy — only service_role bypasses RLS.
    -- Founder-gated admin endpoints read via the service-role client.
    CREATE POLICY "Deny anon reads of legal_ref_verifications"
      ON public.legal_ref_verifications FOR SELECT
      USING (false);
  END IF;
END $$;
