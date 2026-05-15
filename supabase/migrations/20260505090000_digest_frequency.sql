-- Add digest_frequency preference to profiles.
-- Controls how often the user receives the consolidated daily digest.
--   daily  = every day (default)
--   weekly = once per week (Wednesday, to avoid Monday weekly-money-digest collision)
--   off    = never receive the digest

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS digest_frequency text NOT NULL DEFAULT 'daily';

-- No index needed — the daily-digest cron scans profiles in bulk and the
-- column is small; filtering by digest_frequency != 'off' is cheap.
