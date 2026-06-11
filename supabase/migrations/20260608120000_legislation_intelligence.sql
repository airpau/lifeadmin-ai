-- ============================================================================
-- Legislation self-learning intelligence loop
-- ============================================================================
--
-- Root cause this migration supports (see fix/legislation-self-learning-loop):
--   The `verify-legal-refs` cron wrote a HARDCODED status of 'attempted' to
--   every verification audit row (legal_ref_verifications.after_status and
--   legal_audit_log.result), regardless of the real outcome. The genuine
--   result only ever landed on legal_references.verification_status, so the
--   audit / monitoring layer showed 100% of verification records stuck at
--   'attempted', never reaching a terminal 'confirmed' state. There was no
--   canonical state-machine table with a real pending -> confirmed lifecycle
--   (the audit assumed a `legal_coverage_checks` queue that never existed).
--
-- This migration introduces that missing canonical layer:
--   * legislation_items      — one row per Act/section/SI we cite, with a
--                              real lifecycle: pending -> confirmed | amended
--                              | needs_review | failed. THIS is where
--                              'confirmed' finally exists.
--   * legislation_change_log — append-only history of every detected change
--                              (amendment, repeal, drift, dead URL), with the
--                              old/new text, source URL, detection time and
--                              the count of dispute letters affected.
--
-- Strictly additive. CREATE TABLE IF NOT EXISTS only. No DROP / ALTER-drop.
-- Compliance principle respected: this loop NEVER auto-mutates a citation's
-- protected canonical fields (law_name, source_url, source_type,
-- verification_status to a trusted value). It tracks state in its own tables,
-- flags the linked legal_reference via boolean review flags only, logs the
-- change, and escalates to the founder for approval.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. legislation_items — canonical state machine
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.legislation_items (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- What we are tracking
  act_name             TEXT NOT NULL,
  section              TEXT,
  source_url           TEXT NOT NULL,
  source_type          TEXT,                         -- statute | legislation | regulation | ...
  -- Canonical body snapshot + fingerprint (for drift detection)
  current_text         TEXT,
  content_hash         TEXT,                         -- sha256 of canonical body (see hashLegislationDoc)
  last_amended         TEXT,                         -- <ukm:Modified> / FRBRdate from legislation.gov.uk
  unapplied_effects    BOOLEAN NOT NULL DEFAULT FALSE,
  -- Lifecycle: pending -> confirmed | amended | needs_review | failed
  status               TEXT NOT NULL DEFAULT 'pending',
  last_verified_at     TIMESTAMPTZ,                  -- last time a verification COMPLETED (drives the cursor)
  last_attempt_at      TIMESTAMPTZ,                  -- last time we tried (success or failure)
  consecutive_failures INTEGER NOT NULL DEFAULT 0,   -- self-healing 3-strike counter
  escalated_at         TIMESTAMPTZ,                  -- set when we Telegram-escalate, so we don't spam
  -- Link back to the citation this item grounds (soft — may be null for
  -- items discovered independently of legal_references).
  legal_reference_id   UUID REFERENCES public.legal_references(id) ON DELETE SET NULL,
  notes                TEXT,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- One canonical item per source URL (section URLs are distinct, whole-Act
-- URLs are distinct). Lets the seed + cron upsert idempotently.
CREATE UNIQUE INDEX IF NOT EXISTS uq_legislation_items_source_url
  ON public.legislation_items(source_url);

-- The weekly cron processes the STALEST items first (NULLS FIRST = never
-- verified). This index makes that cursor cheap.
CREATE INDEX IF NOT EXISTS idx_legislation_items_cursor
  ON public.legislation_items(last_verified_at ASC NULLS FIRST);

CREATE INDEX IF NOT EXISTS idx_legislation_items_status
  ON public.legislation_items(status);

-- ----------------------------------------------------------------------------
-- 2. legislation_change_log — append-only change history
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.legislation_change_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legislation_item_id   UUID REFERENCES public.legislation_items(id) ON DELETE CASCADE,
  act_name              TEXT,
  section               TEXT,
  -- amended | repealed | content_drift | unapplied_effects | url_dead | confirmed_baseline
  change_type           TEXT NOT NULL,
  old_text              TEXT,
  new_text              TEXT,
  old_hash              TEXT,
  new_hash              TEXT,
  source_url            TEXT,
  affected_dispute_count INTEGER NOT NULL DEFAULT 0,
  material              BOOLEAN NOT NULL DEFAULT FALSE,  -- true => warrants an immediate founder alert
  telegram_sent         BOOLEAN NOT NULL DEFAULT FALSE,
  detected_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  notes                 TEXT
);

CREATE INDEX IF NOT EXISTS idx_legislation_change_log_item
  ON public.legislation_change_log(legislation_item_id, detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_legislation_change_log_detected
  ON public.legislation_change_log(detected_at DESC);

-- ----------------------------------------------------------------------------
-- 3. RLS — service-role writes, founder-gated reads (deny anon), matching the
--    convention used by legal_ref_verifications.
-- ----------------------------------------------------------------------------
ALTER TABLE public.legislation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legislation_change_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'legislation_items'
      AND policyname = 'Deny anon reads of legislation_items'
  ) THEN
    CREATE POLICY "Deny anon reads of legislation_items"
      ON public.legislation_items FOR SELECT USING (false);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'legislation_change_log'
      AND policyname = 'Deny anon reads of legislation_change_log'
  ) THEN
    CREATE POLICY "Deny anon reads of legislation_change_log"
      ON public.legislation_change_log FOR SELECT USING (false);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 4. Seed legislation_items from the legislation.gov.uk citations already in
--    legal_references. These are the Acts / sections / SIs the engine cites
--    in real dispute letters. They start at 'pending' so the next weekly run
--    picks them up and drives them to 'confirmed' — this is the embodiment of
--    "reset the stuck records to pending so the next run picks them up", on a
--    table that actually has a pending -> confirmed loop.
--
--    Only legislation.gov.uk URLs are seeded: those are the ones the weekly
--    cron can verify against the canonical XML API. Regulator pages (FCA,
--    Ofcom, Ofgem, gov.uk guidance) remain on the existing content-hash
--    verifier — they are out of scope for the legislation.gov.uk loop.
--
--    Idempotent: ON CONFLICT DO NOTHING against the unique source_url index.
-- ----------------------------------------------------------------------------
INSERT INTO public.legislation_items
  (act_name, section, source_url, source_type, legal_reference_id, status)
SELECT DISTINCT ON (lr.source_url)
  lr.law_name,
  lr.section,
  lr.source_url,
  lr.source_type,
  lr.id,
  'pending'
FROM public.legal_references lr
WHERE lr.source_url ILIKE 'https://www.legislation.gov.uk/%'
   OR lr.source_url ILIKE 'https://legislation.gov.uk/%'
ORDER BY lr.source_url, lr.created_at ASC
ON CONFLICT (source_url) DO NOTHING;

COMMENT ON TABLE public.legislation_items IS
  'Canonical state machine for every UK Act/section/SI the engine cites. '
  'Lifecycle: pending -> confirmed | amended | needs_review | failed. '
  'Verified weekly against legislation.gov.uk by /api/cron/legislation-reverify. '
  'Replaces the missing legal_coverage_checks queue the audit assumed.';

COMMENT ON TABLE public.legislation_change_log IS
  'Append-only history of every detected legislation change (amendment, '
  'repeal, drift, dead URL) with old/new text, source URL and affected '
  'dispute count. Founder is alerted via Telegram for material changes.';
