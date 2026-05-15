-- Phase 4 — Production wiring of the legal-data freshness gate.
--
-- Every call to `loadFreshLegalRefs` writes one row per requested ref
-- so we can audit in retrospect: was a citation fresh at draft time,
-- did the gate trigger an inline refresh, did that refresh propose a
-- correction. This is the founder's after-the-fact compliance log for
-- both B2C and B2B dispute flows.
--
-- Strictly additive — no DROP / no ALTER on existing tables. RLS
-- service_role-only so user clients can't read raw audit traffic.

CREATE TABLE IF NOT EXISTS legal_ref_freshness_audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ref_id UUID NOT NULL,
  caller TEXT NOT NULL CHECK (caller IN ('b2c', 'b2b', 'admin', 'cron')),
  dispute_id UUID,
  was_fresh BOOLEAN NOT NULL,
  triggered_inline_refresh BOOLEAN NOT NULL DEFAULT FALSE,
  correction_proposed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_legal_ref_freshness_audit_ref_created
  ON legal_ref_freshness_audit(ref_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_legal_ref_freshness_audit_caller_created
  ON legal_ref_freshness_audit(caller, created_at DESC);

ALTER TABLE legal_ref_freshness_audit ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'legal_ref_freshness_audit'
      AND policyname = 'service_role full access'
  ) THEN
    CREATE POLICY "service_role full access"
      ON legal_ref_freshness_audit
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
