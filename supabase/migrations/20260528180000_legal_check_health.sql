-- Per-source health tracking for the daily /api/cron/legal-updates scan.
-- Each row records the last result of a check against a single source
-- (a statute URL on legislation.gov.uk or a regulator news/guidance page)
-- so the founder digest can report WHICH checks broke, WHY, and for HOW
-- LONG, instead of an opaque "Errors: 20" counter.
--
-- Strictly additive — does not modify legal_audit_log, legal_references,
-- or legal_update_queue. Safe to apply in production.

CREATE TABLE IF NOT EXISTS legal_check_health (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_url TEXT NOT NULL UNIQUE,
  -- 'statute' = legislation.gov.uk data.xml fetch
  -- 'regulator' = regulator news/guidance page
  -- 'feed' = legislation.gov.uk new-enacted ATOM feed
  source_kind TEXT NOT NULL,
  -- Human-readable name (e.g. 'Consumer Rights Act 2015', 'Ofgem', 'new-enacted feed')
  source_name TEXT NOT NULL,
  last_checked_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  last_failure_at TIMESTAMPTZ,
  -- 'http_404', 'http_5xx', 'timeout', 'ssl', 'parse', 'empty_body', 'fetch_failed', etc.
  last_error_type TEXT,
  -- Truncated error string (max 500 chars at write time)
  last_error_message TEXT,
  -- Days/runs in a row this source has failed. 0 = healthy.
  consecutive_failure_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE legal_check_health ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_legal_check_health_failures
  ON legal_check_health(consecutive_failure_count DESC)
  WHERE consecutive_failure_count > 0;

CREATE INDEX IF NOT EXISTS idx_legal_check_health_last_checked
  ON legal_check_health(last_checked_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'legal_check_health'
    AND policyname = 'Service role only legal check health'
  ) THEN
    CREATE POLICY "Service role only legal check health"
      ON legal_check_health
      USING (auth.role() = 'service_role');
  END IF;
END $$;
