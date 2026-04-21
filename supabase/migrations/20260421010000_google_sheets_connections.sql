-- 20260421010000_google_sheets_connections
--
-- Backfill migration for the google_sheets_connections table used by the
-- Lunchflow-parity feature (daily Google Sheets sync of bank transactions).
--
-- The table was originally created by hand in Supabase during the Sheetlink
-- build and has been in production since early April 2026. This migration
-- captures the final schema so the feature is reproducible from repo state
-- on a fresh Supabase project (dev / staging / disaster recovery).
--
-- Idempotent: every statement uses IF NOT EXISTS / IF EXISTS so it is safe
-- to run against the existing production database without side-effects.

CREATE TABLE IF NOT EXISTS public.google_sheets_connections (
  id                         uuid                     PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                    uuid                     NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email                      text                     NOT NULL,
  access_token               text                     NOT NULL,
  refresh_token              text,
  refresh_token_ciphertext   text,
  token_expiry               timestamptz,
  spreadsheet_id             text,
  spreadsheet_url            text,
  status                     text                     NOT NULL DEFAULT 'active',
  last_error                 text,
  sync_interval_seconds      integer                  NOT NULL DEFAULT 86400,
  next_sync_at               timestamptz,
  last_synced_at             timestamptz,
  last_synced_timestamp      timestamptz,
  connected_at               timestamptz              DEFAULT now(),
  created_at                 timestamptz              DEFAULT now(),
  updated_at                 timestamptz              DEFAULT now()
);

-- Columns added in-place if table was partially present:
ALTER TABLE public.google_sheets_connections ADD COLUMN IF NOT EXISTS refresh_token_ciphertext text;
ALTER TABLE public.google_sheets_connections ADD COLUMN IF NOT EXISTS status                   text        NOT NULL DEFAULT 'active';
ALTER TABLE public.google_sheets_connections ADD COLUMN IF NOT EXISTS last_error               text;
ALTER TABLE public.google_sheets_connections ADD COLUMN IF NOT EXISTS sync_interval_seconds    integer     NOT NULL DEFAULT 86400;
ALTER TABLE public.google_sheets_connections ADD COLUMN IF NOT EXISTS next_sync_at             timestamptz;
ALTER TABLE public.google_sheets_connections ADD COLUMN IF NOT EXISTS last_synced_at           timestamptz;
ALTER TABLE public.google_sheets_connections ADD COLUMN IF NOT EXISTS last_synced_timestamp    timestamptz;
ALTER TABLE public.google_sheets_connections ADD COLUMN IF NOT EXISTS spreadsheet_url          text;
ALTER TABLE public.google_sheets_connections ADD COLUMN IF NOT EXISTS connected_at             timestamptz DEFAULT now();

-- Indexes
CREATE INDEX IF NOT EXISTS idx_gsc_user_id                     ON public.google_sheets_connections (user_id);
CREATE INDEX IF NOT EXISTS idx_gsc_last_synced                 ON public.google_sheets_connections (last_synced_at);
CREATE INDEX IF NOT EXISTS google_sheets_connections_next_sync_idx
  ON public.google_sheets_connections (next_sync_at)
  WHERE status = 'active';

-- Row-level security
ALTER TABLE public.google_sheets_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own sheets connection"   ON public.google_sheets_connections;
DROP POLICY IF EXISTS "Users can insert own sheets connection" ON public.google_sheets_connections;
DROP POLICY IF EXISTS "Users can update own sheets connection" ON public.google_sheets_connections;
DROP POLICY IF EXISTS "Users can delete own sheets connection" ON public.google_sheets_connections;

CREATE POLICY "Users can view own sheets connection"
  ON public.google_sheets_connections
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own sheets connection"
  ON public.google_sheets_connections
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own sheets connection"
  ON public.google_sheets_connections
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own sheets connection"
  ON public.google_sheets_connections
  FOR DELETE
  USING (auth.uid() = user_id);

-- Keep updated_at current on row mutations (reuse existing trigger function if present)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
    DROP TRIGGER IF EXISTS set_updated_at_google_sheets_connections ON public.google_sheets_connections;
    CREATE TRIGGER set_updated_at_google_sheets_connections
      BEFORE UPDATE ON public.google_sheets_connections
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  END IF;
END $$;

COMMENT ON TABLE public.google_sheets_connections IS
  'Per-user OAuth + sync state for the Google Sheets daily export (Lunchflow parity). One row per user; the cron /api/cron/google-sheets-sync iterates rows with status=active and next_sync_at <= now() and appends new transactions to each user''s spreadsheet.';
