-- Affiliate Deals system
-- Tables and seed data applied via MCP, this file is for version control

CREATE TABLE IF NOT EXISTS affiliate_deals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  category TEXT NOT NULL,
  plan_name TEXT NOT NULL,
  speed_mbps INTEGER,
  data_allowance TEXT,
  price_monthly DECIMAL(10,2) NOT NULL,
  price_promotional DECIMAL(10,2),
  promotional_period TEXT,
  contract_length TEXT,
  setup_fee DECIMAL(10,2) DEFAULT 0,
  uk_minutes TEXT,
  international_minutes TEXT,
  features JSONB DEFAULT '[]',
  affiliate_url TEXT NOT NULL,
  awin_advertiser_id INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_verified_at TIMESTAMPTZ DEFAULT now(),
  price_changed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS deal_price_checks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  provider TEXT NOT NULL,
  check_status TEXT NOT NULL DEFAULT 'pending',
  plans_found JSONB,
  changes_detected JSONB,
  error_message TEXT,
  checked_at TIMESTAMPTZ DEFAULT now()
);
