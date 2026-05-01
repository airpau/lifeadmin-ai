-- Legal-ref freshness pipeline (Phase 2 of legal-data-api-research-2026-05-01.md).
--
-- Strictly additive. No DROP / ALTER-DROP. All columns guarded with
-- IF NOT EXISTS so the migration is safe to re-run.
--
-- Companion crons:
--   - /api/cron/legal-refs-amendments-sweep (daily 03:15 UTC) — diffs
--     legislation.gov.uk canonical XML hashes.
--   - /api/cron/legal-refs-reverify (weekly Sun 04:00 UTC) — re-runs
--     verification for non-legislation.gov.uk hosts (Perplexity fallback)
--     and refreshes verification metadata.
--
-- Compliance principle (non-negotiable): nothing here mutates canonical
-- citation fields. `is_stale=true` and `unapplied_effects=true` are
-- observational flags that surface drift — the actual replacement text
-- is queued in `legal_ref_corrections` for founder review.

ALTER TABLE public.legal_references
  ADD COLUMN IF NOT EXISTS source_xml_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_freshness_check_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS is_stale BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS unapplied_effects BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS superseded_by TEXT;

-- Same pattern on the corrections table so an amendments-sweep proposal
-- can carry the canonical XML hash + URL host it derived from. This lets
-- the founder dashboard distinguish corrections born from a deterministic
-- XML diff (high trust) vs. corrections born from a Perplexity verdict
-- (lower trust, needs eyeballing).
ALTER TABLE public.legal_ref_corrections
  ADD COLUMN IF NOT EXISTS source_xml_hash TEXT,
  ADD COLUMN IF NOT EXISTS source_host TEXT;

-- Index supporting the amendments-sweep "due refs" lookup. The cron
-- selects refs on legislation.gov.uk ordered by oldest freshness check;
-- this composite hits the index without scanning the full table.
CREATE INDEX IF NOT EXISTS idx_legal_refs_freshness_host_checked
  ON public.legal_references((
    CASE
      WHEN source_url ILIKE '%legislation.gov.uk%' THEN 'legislation.gov.uk'
      ELSE NULL
    END
  ), last_freshness_check_at);

-- Spec-required index on (host, last_freshness_check_at). We model
-- "host" as the regex-extracted authority for index purposes; for the
-- common-case lookup of legislation.gov.uk refs the partial above is
-- sufficient, but downstream filters benefit from the full composite.
CREATE INDEX IF NOT EXISTS idx_legal_refs_stale
  ON public.legal_references(is_stale)
  WHERE is_stale = TRUE;

CREATE INDEX IF NOT EXISTS idx_legal_refs_unapplied_effects
  ON public.legal_references(unapplied_effects)
  WHERE unapplied_effects = TRUE;

-- Backfill: every existing row counts as a "first check pending". We
-- deliberately leave last_freshness_check_at NULL so the amendments
-- sweep picks them up on its first run.
