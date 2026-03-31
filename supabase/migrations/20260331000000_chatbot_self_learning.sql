-- Chatbot Self-Learning: Product Features Catalogue and Question Log
-- 2026-03-31

-- Product features table: single source of truth for chatbot feature awareness
CREATE TABLE IF NOT EXISTS product_features (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  tier_access TEXT[] NOT NULL DEFAULT ARRAY['free','essential','pro'],
  route_path TEXT,
  api_routes TEXT[] DEFAULT ARRAY[]::TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT true,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ
);

ALTER TABLE product_features ENABLE ROW LEVEL SECURITY;

-- Name must be unique so seed inserts are idempotent
CREATE UNIQUE INDEX IF NOT EXISTS idx_product_features_name ON product_features(name);

-- Anyone can read active features (chatbot uses anon/service role)
CREATE POLICY "Anyone can read active product_features"
  ON product_features FOR SELECT
  USING (is_active = true);

-- Service role manages everything
CREATE POLICY "Service role can manage product_features"
  ON product_features FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_product_features_category ON product_features(category);
CREATE INDEX IF NOT EXISTS idx_product_features_active ON product_features(is_active);

-- Auto-update updated_at on change
CREATE OR REPLACE FUNCTION touch_product_features_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_features_updated_at
  BEFORE UPDATE ON product_features
  FOR EACH ROW EXECUTE FUNCTION touch_product_features_updated_at();

-- Atomic usage increment called by the chatbot after each answered question
CREATE OR REPLACE FUNCTION increment_feature_usage(p_feature_name TEXT)
RETURNS void AS $$
  UPDATE product_features
  SET usage_count = usage_count + 1,
      last_used_at = NOW()
  WHERE name = p_feature_name AND is_active = true;
$$ LANGUAGE sql SECURITY DEFINER;

-- Chatbot question log: every question the bot is asked, with metadata for analysis
CREATE TABLE IF NOT EXISTS chatbot_question_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  question TEXT NOT NULL,
  matched_features TEXT[] DEFAULT ARRAY[]::TEXT[],
  confidence FLOAT NOT NULL DEFAULT 0.5,
  was_helpful BOOLEAN,
  unanswered BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE chatbot_question_log ENABLE ROW LEVEL SECURITY;

-- Users see only their own logs
CREATE POLICY "Users can read own question log"
  ON chatbot_question_log FOR SELECT
  USING (auth.uid() = user_id);

-- Service role reads all (analytics)
CREATE POLICY "Service role can manage chatbot_question_log"
  ON chatbot_question_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_chatbot_ql_user ON chatbot_question_log(user_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_ql_unanswered ON chatbot_question_log(unanswered);
CREATE INDEX IF NOT EXISTS idx_chatbot_ql_created ON chatbot_question_log(created_at);
CREATE INDEX IF NOT EXISTS idx_chatbot_ql_confidence ON chatbot_question_log(confidence);

-- Seed all current Paybacker features
INSERT INTO product_features (name, description, category, tier_access, route_path, api_routes) VALUES

('AI Complaint and Dispute Letters',
 'Generates professional complaint letters in 30 seconds. Cites 86+ verified UK law references with confidence badges. Covers energy bills, broadband, flight delay compensation (up to £520), parking charges, council tax challenges, debt collection responses, insurance, NHS, and refunds. Text-to-speech available on Essential and Pro. Dispute thread tracking shows full correspondence history.',
 'money_recovery',
 ARRAY['free','essential','pro'],
 '/dashboard/complaints',
 ARRAY['/api/complaints/generate', '/api/complaints/usage', '/api/complaints/[id]/letter', '/api/complaints/[id]/approve']),

('Government Forms and Official Letters',
 'Generates official letters for HMRC tax rebates, council tax band challenges, DVLA issues, NHS formal complaints, parking fine appeals, and debt dispute responses (Section 77/78 requests). Available to all plans; counts toward the Free plan letter limit.',
 'money_recovery',
 ARRAY['free','essential','pro'],
 '/dashboard/forms',
 ARRAY['/api/forms/generate']),

('AI Cancellation Emails',
 'Writes cancellation emails citing relevant UK consumer law: Consumer Contracts Regulations 2013 (14-day cooling off), Ofcom mid-contract price rise exit rights, Ofgem tariff rules, and the Consumer Rights Act for gym memberships. Provides provider-specific advice for 80+ UK companies. Available on Essential and Pro plans only.',
 'ai_tools',
 ARRAY['essential','pro'],
 '/dashboard/subscriptions',
 ARRAY['/api/subscriptions/cancellation-email']),

('Bank Connection and Open Banking',
 'Connects bank accounts securely (read-only, FCA regulated) using Open Banking. Scans 12 months of transactions to automatically detect all subscriptions, recurring payments, and hidden charges. Free users get a one-time scan. Essential users get 1 bank account with daily auto-sync. Pro users get unlimited bank accounts with daily auto-sync and on-demand manual sync.',
 'financial_tracking',
 ARRAY['free','essential','pro'],
 '/dashboard/money-hub',
 ARRAY['/api/bank/connection', '/api/bank/sync', '/api/bank/disconnect']),

('Money Hub Financial Dashboard',
 'Complete financial intelligence centre. Full spending breakdown across 20+ categories, income tracking, net worth snapshot, budget planner with 80%/100% breach email alerts, monthly spending trends with interactive charts, and transaction-level drill-down. Savings goals with progress tracking available on Pro. Free users see top 5 spending categories only.',
 'financial_tracking',
 ARRAY['free','essential','pro'],
 '/dashboard/money-hub',
 ARRAY['/api/money-hub', '/api/money-hub/budgets', '/api/money-hub/goals', '/api/money-hub/net-worth', '/api/money-hub/transactions', '/api/money-hub/recategorise']),

('Subscription and Contract Tracking',
 'Track every subscription, direct debit, mortgage, loan, insurance policy, and contract in one dashboard. Shows monthly and annual spend totals. Contract end date tracking with countdown badges. Contract upload: upload a PDF or photo of any contract and AI analyses key terms, end dates, and exit conditions. Renewal email alerts at 30, 14, and 7 days before any contract renews. Add manually or auto-detect via bank scan.',
 'financial_tracking',
 ARRAY['free','essential','pro'],
 '/dashboard/subscriptions',
 ARRAY['/api/subscriptions', '/api/subscriptions/[id]', '/api/contracts', '/api/contracts/analyse', '/api/contracts/upload']),

('Price Increase Alerts',
 'Automatically detects when any recurring payment increases in price. Shows old vs new amount, percentage increase, and annual cost impact. Checked daily after each bank sync. Lets you write a complaint letter or find a better deal directly from the alert. Available on Essential and Pro plans (requires bank connection).',
 'financial_tracking',
 ARRAY['essential','pro'],
 '/dashboard/subscriptions',
 ARRAY['/api/price-alerts']),

('Receipt and Bill Scanning',
 'Upload receipts or bills as photos or PDFs. AI extracts amounts, dates, and merchant names. Automatically flags potential overcharges and creates action items. Available on Essential and Pro plans.',
 'ai_tools',
 ARRAY['essential','pro'],
 '/dashboard/scanner',
 ARRAY['/api/receipts', '/api/receipts/scan']),

('Email Inbox Scanning',
 'Connect Gmail or Outlook (read-only, Google OAuth). Scans up to 2 years of email history. Finds overcharges, forgotten subscriptions, flight delay opportunities, debt disputes, and price increase notices. Smart action buttons: Add to Subscriptions, Write Complaint, Claim Compensation, Create Task, Dismiss. Free gets a one-time scan. Essential gets monthly re-scans. Pro gets unlimited scans.',
 'ai_tools',
 ARRAY['free','essential','pro'],
 '/dashboard/scanner',
 ARRAY['/api/gmail/scan', '/api/outlook/scan', '/api/email/scan', '/api/gmail/detect-subscriptions']),

('Deal Comparison',
 '59+ deals across 9 categories from verified UK providers: Energy, Broadband, Mobile, Insurance, Mortgages, Loans, Credit Cards, Car Finance, and Travel. Compares against your current subscription data to highlight potential savings. Awin affiliate integration for trusted switching. Free to browse for all users.',
 'deals',
 ARRAY['free','essential','pro'],
 '/dashboard/deals',
 ARRAY['/api/deals', '/api/deals/click', '/api/affiliate-deals']),

('Savings Challenges',
 '12 gamified savings challenges including no-spend week, switch and save, and cancel one subscription. Bank-verified completion: the system checks your bank data to confirm you actually saved. Earn loyalty points on completion. Available on Essential and Pro plans.',
 'savings',
 ARRAY['essential','pro'],
 '/dashboard/rewards',
 ARRAY['/api/challenges']),

('Annual Financial Report PDF',
 'Full yearly summary of income, spending, savings achieved, and contracts reviewed. PDF export with charts and category breakdown. Available on Pro plan only.',
 'financial_tracking',
 ARRAY['pro'],
 '/dashboard/profile/report',
 ARRAY['/api/reports/generate', '/api/reports']),

('AI Support Chatbot',
 'Available on every page to all users. Answers UK consumer rights questions and helps navigate the platform. Can manage subscriptions, query your spending, find deals, and detect price increases directly in the chat. Escalates to a human support agent when needed. Available on all plans.',
 'ai_tools',
 ARRAY['free','essential','pro'],
 NULL,
 ARRAY['/api/chat']),

('Loyalty Rewards',
 'Earn points for every action: generating letters, adding subscriptions, completing challenges, and referring friends. Reward tiers: Bronze, Silver, Gold, Platinum. Redeem points for subscription discounts. Available on all plans.',
 'social',
 ARRAY['free','essential','pro'],
 '/dashboard/rewards',
 ARRAY['/api/loyalty', '/api/loyalty/award', '/api/loyalty/redeem']),

('Referral Programme',
 'Share your unique referral link. Both you and your friend get 1 free month of Essential when they sign up and become a paying subscriber. Track referrals and earnings from your profile. Available on all plans.',
 'social',
 ARRAY['free','essential','pro'],
 '/dashboard/profile',
 ARRAY['/api/referrals', '/api/referrals/track', '/api/referrals/process']),

('Share Your Win',
 'Share a savings achievement to social media with a pre-formatted post that includes your referral link so you earn additional rewards when people sign up. Available on all plans.',
 'social',
 ARRAY['free','essential','pro'],
 '/dashboard',
 ARRAY[]),

('Contract Vault',
 'Upload and store your contracts securely in one place. AI analyses key terms, end dates, and exit conditions for any contract you upload. View all contracts with expiry countdowns and auto-renewal warnings. Available on Essential and Pro plans.',
 'financial_tracking',
 ARRAY['essential','pro'],
 '/dashboard/contracts',
 ARRAY['/api/contracts', '/api/contracts/upload', '/api/contracts/analyse']),

('Spending Intelligence',
 'Full transaction-level analysis of your spending across 20+ categories. See exactly where your money goes each month with interactive charts. Recategorise any transaction to keep your data accurate. Full access on Essential and Pro; Free tier gets top 5 categories only.',
 'financial_tracking',
 ARRAY['free','essential','pro'],
 '/dashboard/spending',
 ARRAY['/api/spending', '/api/money-hub/transactions', '/api/money-hub/recategorise']),

('Budget Planner',
 'Set monthly budget limits for each spending category. Visual progress bars show how much you have spent vs your limit. Get email alerts when you reach 80% and 100% of any budget. Available on Essential and Pro plans.',
 'savings',
 ARRAY['essential','pro'],
 '/dashboard/money-hub',
 ARRAY['/api/money-hub/budgets']),

('Savings Goals',
 'Set financial targets such as building an emergency fund or saving for a holiday. Track progress with visual charts linked to your actual bank data. Available on Pro plan only.',
 'savings',
 ARRAY['pro'],
 '/dashboard/money-hub',
 ARRAY['/api/money-hub/goals'])

ON CONFLICT (name) DO NOTHING;
