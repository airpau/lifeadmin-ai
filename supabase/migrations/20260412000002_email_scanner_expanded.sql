-- ============================================================
-- Email Scanner Expanded (2026-04-12)
--
-- Three new tables to support the expanded email scanner:
--   1. email_scan_findings  — persistent store for all categorised
--      email findings (bills, contracts, subscriptions, etc.)
--   2. dispute_correspondence — emails from suppliers about open
--      disputes, linked to the disputes table
--   3. cancellation_tracking — tracks pending cancellations and
--      matches them to confirmation emails
-- ============================================================

-- 1. email_scan_findings
CREATE TABLE IF NOT EXISTS email_scan_findings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scan_session_id TEXT,
  finding_type TEXT NOT NULL CHECK (finding_type IN (
    'subscription', 'bill', 'contract', 'dispute_response',
    'cancellation_confirmation', 'price_increase', 'refund_opportunity',
    'flight_delay', 'debt_dispute', 'tax_rebate', 'renewal',
    'forgotten_subscription', 'upcoming_payment', 'deal_expiry',
    'bank_gap'
  )),
  provider TEXT NOT NULL,
  email_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC(10,2),
  due_date DATE,
  contract_end_date DATE,
  previous_amount NUMERIC(10,2),
  price_change_date DATE,
  payment_frequency TEXT CHECK (payment_frequency IN (
    'monthly', 'quarterly', 'yearly', 'one-time', NULL
  )),
  confidence INTEGER DEFAULT 70,
  urgency TEXT DEFAULT 'routine' CHECK (urgency IN ('immediate', 'soon', 'routine')),
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'actioned', 'dismissed', 'pending')),
  source TEXT DEFAULT 'gmail',
  metadata JSONB,
  telegram_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE email_scan_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own email scan findings"
  ON email_scan_findings FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_email_scan_findings_user ON email_scan_findings(user_id);
CREATE INDEX IF NOT EXISTS idx_email_scan_findings_type ON email_scan_findings(user_id, finding_type);
CREATE INDEX IF NOT EXISTS idx_email_scan_findings_status ON email_scan_findings(user_id, status);
CREATE INDEX IF NOT EXISTS idx_email_scan_findings_email ON email_scan_findings(email_id) WHERE email_id IS NOT NULL;

-- 2. dispute_correspondence
CREATE TABLE IF NOT EXISTS dispute_correspondence (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  dispute_id UUID REFERENCES disputes(id) ON DELETE SET NULL,
  email_id TEXT,
  provider TEXT NOT NULL,
  subject TEXT,
  email_date TIMESTAMPTZ,
  correspondence_type TEXT CHECK (correspondence_type IN (
    'supplier_response', 'acknowledgement', 'rejection',
    'resolution', 'escalation', 'holding_reply', 'unknown'
  )),
  summary TEXT,
  suggested_action TEXT,
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'actioned', 'dismissed')),
  telegram_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE dispute_correspondence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own dispute correspondence"
  ON dispute_correspondence FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_dispute_correspondence_user ON dispute_correspondence(user_id);
CREATE INDEX IF NOT EXISTS idx_dispute_correspondence_dispute ON dispute_correspondence(dispute_id) WHERE dispute_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_dispute_correspondence_status ON dispute_correspondence(user_id, status);

-- 3. cancellation_tracking
CREATE TABLE IF NOT EXISTS cancellation_tracking (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  cancellation_requested_at TIMESTAMPTZ,
  confirmation_email_id TEXT,
  confirmation_detected_at TIMESTAMPTZ,
  effective_date DATE,
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'confirmed', 'disputed', 'failed', 'manual_check'
  )),
  telegram_notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE cancellation_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own cancellation tracking"
  ON cancellation_tracking FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_cancellation_tracking_user ON cancellation_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_cancellation_tracking_status ON cancellation_tracking(user_id, status);
CREATE INDEX IF NOT EXISTS idx_cancellation_tracking_provider ON cancellation_tracking(user_id, provider);
