-- Audit trail of every B2B-customer-impacting event so the portal
-- can show the engineering buyer "who did what when" — table-stakes
-- for security review on the buying side. Append-only, never updated.
CREATE TABLE IF NOT EXISTS b2b_audit_log (
  id BIGSERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  key_id UUID REFERENCES b2b_api_keys(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN (
    'key_created','key_revoked','key_reissued','key_viewed',
    'portal_signin','login_link_requested','reveal_link_used','plan_changed'
  )),
  actor TEXT NOT NULL DEFAULT 'customer' CHECK (actor IN ('customer','founder','system','stripe')),
  ip_address TEXT,
  user_agent TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS b2b_audit_log_email_idx
  ON b2b_audit_log (email, created_at DESC);
CREATE INDEX IF NOT EXISTS b2b_audit_log_key_idx
  ON b2b_audit_log (key_id, created_at DESC) WHERE key_id IS NOT NULL;
