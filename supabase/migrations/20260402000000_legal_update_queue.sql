-- Self-learning legal intelligence: update queue, audit log, and missing columns
-- These columns are referenced in verify-legal-refs but were never formally migrated

ALTER TABLE legal_references ADD COLUMN IF NOT EXISTS confidence_score INTEGER DEFAULT 100;
ALTER TABLE legal_references ADD COLUMN IF NOT EXISTS content_hash TEXT;

-- legal_audit_log: every verification check is recorded here
-- (referenced in verify-legal-refs cron but never formally created)
CREATE TABLE IF NOT EXISTS legal_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_reference_id UUID REFERENCES legal_references(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL, -- 'http_head', 'ai_comparison', 'content_hash', 'legislation_api', 'weekly_scan'
  result TEXT NOT NULL,     -- 'current', 'updated', 'needs_review', 'check_failed', 'queued'
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE legal_audit_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_legal_audit_ref ON legal_audit_log(legal_reference_id);
CREATE INDEX IF NOT EXISTS idx_legal_audit_created ON legal_audit_log(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'legal_audit_log'
    AND policyname = 'Service role only audit'
  ) THEN
    CREATE POLICY "Service role only audit"
      ON legal_audit_log
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- legal_update_queue: proposed changes awaiting admin review or already actioned
CREATE TABLE IF NOT EXISTS legal_update_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_reference_id UUID REFERENCES legal_references(id) ON DELETE SET NULL,
  change_type TEXT NOT NULL CHECK (change_type IN (
    'content_update', 'new_legislation', 'repealed', 'new_guidance', 'regulator_change'
  )),
  source_url TEXT,
  detected_change_summary TEXT NOT NULL,
  proposed_update TEXT,
  confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low')) DEFAULT 'medium',
  status TEXT NOT NULL CHECK (status IN (
    'pending', 'approved', 'rejected', 'auto_applied'
  )) DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE legal_update_queue ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_legal_queue_status ON legal_update_queue(status);
CREATE INDEX IF NOT EXISTS idx_legal_queue_confidence ON legal_update_queue(confidence);
CREATE INDEX IF NOT EXISTS idx_legal_queue_ref ON legal_update_queue(legal_reference_id);
CREATE INDEX IF NOT EXISTS idx_legal_queue_created ON legal_update_queue(created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'legal_update_queue'
    AND policyname = 'Service role only queue'
  ) THEN
    CREATE POLICY "Service role only queue"
      ON legal_update_queue
      USING (auth.role() = 'service_role');
  END IF;
END $$;
