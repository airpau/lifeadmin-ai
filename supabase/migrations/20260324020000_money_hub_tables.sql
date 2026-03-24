-- Money Hub: Complete consumer financial intelligence centre
-- Tables for budgets, assets, liabilities, savings goals, and smart alerts

CREATE TABLE IF NOT EXISTS money_hub_budgets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  monthly_limit DECIMAL(10,2),
  rollover BOOLEAN DEFAULT FALSE,
  payday_date INTEGER,  -- day of month (1-31)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE money_hub_budgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own budgets" ON money_hub_budgets FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_mhb_user ON money_hub_budgets(user_id);

CREATE TABLE IF NOT EXISTS money_hub_assets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  asset_type TEXT NOT NULL CHECK (asset_type IN ('property', 'savings', 'investment', 'pension', 'vehicle', 'crypto', 'other')),
  asset_name TEXT,
  estimated_value DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE money_hub_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own assets" ON money_hub_assets FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_mha_user ON money_hub_assets(user_id);

CREATE TABLE IF NOT EXISTS money_hub_liabilities (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  liability_type TEXT NOT NULL CHECK (liability_type IN ('mortgage', 'loan', 'credit_card', 'overdraft', 'car_finance', 'student_loan', 'other')),
  liability_name TEXT,
  outstanding_balance DECIMAL(12,2),
  monthly_payment DECIMAL(10,2),
  interest_rate DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE money_hub_liabilities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own liabilities" ON money_hub_liabilities FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_mhl_user ON money_hub_liabilities(user_id);

CREATE TABLE IF NOT EXISTS money_hub_savings_goals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  goal_name TEXT NOT NULL,
  target_amount DECIMAL(10,2),
  current_amount DECIMAL(10,2) DEFAULT 0,
  target_date DATE,
  emoji TEXT,
  linked_account_id UUID,  -- optional TrueLayer account to track
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE money_hub_savings_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own goals" ON money_hub_savings_goals FOR ALL USING (auth.uid() = user_id);
CREATE INDEX idx_mhsg_user ON money_hub_savings_goals(user_id);

CREATE TABLE IF NOT EXISTS money_hub_alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN (
    'overcharge', 'price_increase', 'duplicate_charge', 'unusual_spending',
    'budget_warning', 'budget_exceeded', 'contract_expiring', 'subscription_unused',
    'compensation_opportunity', 'insurance_renewal', 'debt_correspondence',
    'income_change', 'savings_milestone', 'general'
  )),
  title TEXT,
  description TEXT,
  value_gbp DECIMAL(10,2),
  source TEXT CHECK (source IN ('bank', 'email', 'contract', 'budget', 'ai', 'manual')),
  action_type TEXT CHECK (action_type IN ('complaint_letter', 'cancel_subscription', 'set_reminder', 'claim_compensation', 'switch_deal', 'review', 'dismiss')),
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'actioned', 'dismissed', 'expired')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE money_hub_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own alerts" ON money_hub_alerts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users update own alerts" ON money_hub_alerts FOR UPDATE USING (auth.uid() = user_id);
CREATE INDEX idx_mha_user_status ON money_hub_alerts(user_id, status) WHERE status = 'active';
CREATE INDEX idx_mha_created ON money_hub_alerts(created_at DESC);

-- Add triggers for updated_at
CREATE TRIGGER update_mhb_updated_at BEFORE UPDATE ON money_hub_budgets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_mha_updated_at BEFORE UPDATE ON money_hub_assets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_mhl_updated_at BEFORE UPDATE ON money_hub_liabilities FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_mhsg_updated_at BEFORE UPDATE ON money_hub_savings_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
