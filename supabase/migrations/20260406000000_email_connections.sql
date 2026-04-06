-- email_connections table for IMAP (Yahoo, BT, Sky, etc.) and OAuth (Gmail, Outlook) connections
-- This table already exists in production; migration is for schema documentation purposes
CREATE TABLE IF NOT EXISTS email_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  email_address TEXT NOT NULL,
  provider_type TEXT NOT NULL DEFAULT 'imap',
  auth_method TEXT NOT NULL DEFAULT 'imap',
  access_token TEXT,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,
  imap_host TEXT,
  imap_port INTEGER DEFAULT 993,
  imap_username TEXT,
  imap_password_encrypted TEXT,
  status TEXT DEFAULT 'active',
  last_scanned_at TIMESTAMPTZ,
  emails_scanned INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  app_password_encrypted TEXT,
  last_error TEXT,
  last_error_at TIMESTAMPTZ,
  bills_found INTEGER DEFAULT 0,
  scan_frequency TEXT DEFAULT 'daily' CHECK (scan_frequency IN ('hourly', 'daily', 'weekly', 'manual')),
  UNIQUE(user_id, email_address)
);

-- RLS policies (idempotent - only create if not exists)
DO $$ BEGIN
  ALTER TABLE email_connections ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_connections_user_id ON email_connections(user_id);
CREATE INDEX IF NOT EXISTS idx_email_connections_status ON email_connections(status);
