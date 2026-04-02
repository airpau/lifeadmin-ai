-- Contract Expiry Alerts: track which users have been notified about expiring
-- contracts from BOTH contract_extractions and subscriptions tables.
-- Deduplication is handled by checking these columns before sending.

CREATE TABLE IF NOT EXISTS contract_expiry_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  contract_extraction_id UUID REFERENCES contract_extractions(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  provider_name TEXT NOT NULL,
  contract_end_date DATE NOT NULL,
  alert_30d_sent_at TIMESTAMPTZ,
  alert_14d_sent_at TIMESTAMPTZ,
  alert_7d_sent_at TIMESTAMPTZ,
  user_actioned BOOLEAN DEFAULT FALSE,
  actioned_type TEXT, -- 'disputed', 'renewed', 'switched', 'dismissed'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Each contract/subscription gets at most one alert record
CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_expiry_alerts_extraction
  ON contract_expiry_alerts(contract_extraction_id) WHERE contract_extraction_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_contract_expiry_alerts_subscription
  ON contract_expiry_alerts(subscription_id) WHERE subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contract_expiry_alerts_user
  ON contract_expiry_alerts(user_id, contract_end_date);

ALTER TABLE contract_expiry_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own contract expiry alerts"
  ON contract_expiry_alerts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own contract expiry alerts"
  ON contract_expiry_alerts FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);
