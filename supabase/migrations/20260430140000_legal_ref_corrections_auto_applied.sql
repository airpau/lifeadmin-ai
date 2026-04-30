-- PR η — extend legal_ref_corrections.status enum to allow 'auto_applied'
-- and 'reverted'. Wrapped in DO/EXCEPTION so it is safe to run before
-- ε's migration (the table may not exist yet).
--
-- Strictly additive: existing rows keep their current status; we are
-- only widening the CHECK constraint.

DO $$
BEGIN
  ALTER TABLE public.legal_ref_corrections
    DROP CONSTRAINT IF EXISTS legal_ref_corrections_status_check;
  ALTER TABLE public.legal_ref_corrections
    ADD CONSTRAINT legal_ref_corrections_status_check
    CHECK (status IN (
      'pending',
      'approved',
      'rejected',
      'duplicate',
      'superseded_by_newer',
      'auto_applied',
      'reverted'
    ));
EXCEPTION
  WHEN undefined_table THEN
    -- ε's migration hasn't shipped yet — no-op safely.
    NULL;
END;
$$;

-- Add an applied_at column if not present, again wrapped for safety.
DO $$
BEGIN
  ALTER TABLE public.legal_ref_corrections
    ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;
EXCEPTION
  WHEN undefined_table THEN NULL;
END;
$$;
