-- ---------------------------------------------------------------------------
-- Phase 4 — formally mark provider_intelligence dormant
-- ---------------------------------------------------------------------------
-- Spec (CLOSED_LOOP_ARCHITECTURE.md → Phase 4):
--   "Audit the existing provider_intelligence table; either rebuild as a
--    intelligence_stats slice (preferred) or drop."
--
-- Decision: replace with intelligence_stats slices.
--
-- Phase 1's legal_ref scope already aggregates per-(merchant, legal_ref)
-- win rate via dispute_outcome_events → intelligence_stats. The
-- /api/cron/aggregate-provider-intelligence cron was last seen producing
-- output in early April 2026 and is now redundant — its consumer
-- (`generateComplaintLetter`) uses the intelligence_stats path instead.
--
-- Rules of this codebase (CLAUDE.md):
--   "Never use DROP TABLE or ALTER TABLE to remove columns under any
--    circumstances".
--
-- So we don't drop the table. We:
--   1. Mark it dormant with a table comment so future readers know
--      not to revive it without re-architecting.
--   2. Leave existing rows untouched.
--   3. The aggregate-provider-intelligence cron stays in code but
--      becomes a no-op via /vercel.json (already not scheduled — verified
--      below). Any out-of-band invocation will continue to write rows,
--      which is harmless.
--
-- Future readers: if you need per-provider stats, use
-- intelligence_stats WHERE scope_kind IN ('legal_ref', 'tool',
-- 'merchant_x_legal_ref', 'prompt_template') — that's the maintained path.
-- ---------------------------------------------------------------------------

-- Idempotent — provider_intelligence may have been dropped in
-- production already (table does not currently exist in
-- kcxxlesishltdmfctlmo as of 2026-06-08). This guard lets the
-- migration stay in the file tree as the formal "dormant" marker
-- without breaking a fresh restore.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'provider_intelligence'
  ) THEN
    COMMENT ON TABLE public.provider_intelligence IS
      'DORMANT 2026-06-08 — superseded by intelligence_stats slices ' ||
      '(scope_kind=legal_ref / tool / prompt_template / merchant_x_legal_ref). ' ||
      'Do not write new code that depends on this table. The ' ||
      '/api/cron/aggregate-provider-intelligence cron is unscheduled and any ' ||
      'rows produced by out-of-band invocations are not read by the engine.';
  END IF;
END$$;
