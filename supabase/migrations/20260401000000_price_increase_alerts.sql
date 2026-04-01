-- Price increase alerts table
-- Stores recurring payment increases detected from bank transaction history.
-- Populated by the daily cron at /api/cron/price-increases and on-demand via
-- /api/price-alerts/detect when a user first loads the dashboard with bank data.
CREATE TABLE IF NOT EXISTS price_increase_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  merchant_name TEXT,
  merchant_normalized TEXT NOT NULL,
  old_amount DECIMAL(10,2) NOT NULL,
  new_amount DECIMAL(10,2) NOT NULL,
  increase_pct DECIMAL(5,2) NOT NULL,
  annual_impact DECIMAL(10,2) NOT NULL,
  old_date DATE,
  new_date DATE,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'dismissed', 'actioned')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE price_increase_alerts ENABLE ROW LEVEL SECURITY;

-- Users can read their own alerts
CREATE POLICY "Users can view own price alerts"
  ON price_increase_alerts FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update status of their own alerts (dismiss / action)
CREATE POLICY "Users can update own price alert status"
  ON price_increase_alerts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Indexes for dashboard and cron queries
CREATE INDEX idx_pia_user_status ON price_increase_alerts(user_id, status) WHERE status = 'active';
CREATE INDEX idx_pia_user_created ON price_increase_alerts(user_id, created_at DESC);
CREATE INDEX idx_pia_user_impact  ON price_increase_alerts(user_id, annual_impact DESC);
