-- ============================================================
-- Disputes: consolidate merchant_normalized → merchant_normalised
-- ============================================================
--
-- Background:
--   The `disputes` table picked up TWO spellings of the same column
--   in prod (Paul flagged 2026-05-17): an American-spelled
--   `merchant_normalized` from an earlier path, and the British
--   `merchant_normalised` introduced by 20260501090000_dispute_outcome
--   _dataset.sql. All current application code uses `merchant_normalised`
--   (verified via grep — every reference under src/app/api/disputes
--   /**, src/app/api/cron/dispute*, src/app/api/cron/compute-dispute-
--   intelligence, src/components/disputes/* uses the British form).
--   The American form is dead weight but still receiving writes in
--   places that pre-date the British column.
--
--   Note: CLAUDE.md normally forbids DROP COLUMN. Paul asked for this
--   explicitly (single duplicate column, zero code references, clear
--   migration of any leftover data). Migration is wrapped in
--   IF EXISTS / DO blocks so a re-run is a no-op and so it doesn't fail
--   on environments where prod-only state never existed.
--
-- Steps:
--   1. If `merchant_normalized` exists on `disputes`, copy values into
--      `merchant_normalised` for rows where the British column is NULL
--      and the American column has a value.
--   2. Drop the duplicate column.
--   3. Leave `merchant_normalised` and its index from
--      20260501090000_dispute_outcome_dataset.sql untouched.
--
-- Safety:
--   * `merchant_normalised` and its index are NOT touched.
--   * Migration is idempotent: re-running has no effect because the
--      column will already be gone.
--   * Other tables that legitimately have `merchant_normalized` (e.g.
--      `price_increase_alerts`) are NOT touched — this migration is
--      scoped to `disputes` only.
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM   information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = 'disputes'
      AND  column_name  = 'merchant_normalized'
  ) THEN
    -- Backfill: copy American → British where the British column is empty.
    -- We deliberately do NOT overwrite an existing British value; if both
    -- columns are populated for the same row, the British value is the
    -- one application code has been writing to, so it wins.
    UPDATE public.disputes
    SET    merchant_normalised = merchant_normalized
    WHERE  merchant_normalised IS NULL
      AND  merchant_normalized IS NOT NULL;

    -- Drop the duplicate.
    ALTER TABLE public.disputes DROP COLUMN merchant_normalized;
  END IF;
END $$;
