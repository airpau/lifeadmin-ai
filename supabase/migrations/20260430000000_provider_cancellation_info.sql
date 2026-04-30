-- Provider-level cancellation intelligence cache.
-- Populated on subscription creation (ai-on-create) and refreshed weekly by
-- /api/cron/refresh-cancellation-info. Branch-aware: when a UK locality is
-- detected in the provider name, branch contact details are preferred over
-- corporate.
CREATE TABLE IF NOT EXISTS provider_cancellation_info (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL,
  provider_key TEXT NOT NULL,
  city TEXT,
  method TEXT,
  email TEXT,
  phone TEXT,
  url TEXT,
  tips TEXT,
  notice_period_days INTEGER,
  data_source TEXT DEFAULT 'ai-on-create',
  confidence TEXT DEFAULT 'medium' CHECK (confidence IN ('low', 'medium', 'high')),
  last_verified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(provider_key)
);

CREATE INDEX IF NOT EXISTS idx_provider_cancellation_info_provider_key
  ON provider_cancellation_info(provider_key);

DO $$ BEGIN
  ALTER TABLE provider_cancellation_info ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Anyone authenticated can read. Writes are service-role only (cron + helper).
DO $$ BEGIN
  CREATE POLICY "provider_cancellation_info_read"
    ON provider_cancellation_info FOR SELECT
    USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
