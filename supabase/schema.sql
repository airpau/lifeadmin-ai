-- LifeAdminAI Database Schema
-- UK AI Life Admin Platform
-- Tables: profiles, waitlist_signups, tasks, agent_runs, subscriptions

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ════════════════════════════════════════════════════════════════════════════
-- PROFILES
-- User profiles linked to Supabase Auth
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  phone TEXT,
  
  -- Subscription status
  stripe_customer_id TEXT UNIQUE,
  subscription_status TEXT CHECK (subscription_status IN ('trialing', 'active', 'canceled', 'past_due', 'paused')) DEFAULT 'trialing',
  subscription_tier TEXT CHECK (subscription_tier IN ('free', 'pro', 'enterprise')) DEFAULT 'free',
  trial_ends_at TIMESTAMPTZ,
  
  -- Metrics
  total_money_recovered DECIMAL(10, 2) DEFAULT 0,
  total_tasks_completed INTEGER DEFAULT 0,
  total_agents_run INTEGER DEFAULT 0,
  
  -- Metadata
  onboarded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- Indexes
CREATE INDEX idx_profiles_stripe_customer ON profiles(stripe_customer_id);
CREATE INDEX idx_profiles_subscription_status ON profiles(subscription_status);

-- ════════════════════════════════════════════════════════════════════════════
-- WAITLIST_SIGNUPS
-- Pre-launch waitlist (migrated from JSON file)
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE waitlist_signups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  
  -- Source tracking
  source TEXT DEFAULT 'landing_page', -- 'landing_page', 'referral', 'social'
  referrer_code TEXT,
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  
  -- Status
  status TEXT CHECK (status IN ('pending', 'invited', 'converted', 'bounced')) DEFAULT 'pending',
  invited_at TIMESTAMPTZ,
  converted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS (public can insert, only admins can view)
ALTER TABLE waitlist_signups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can sign up for waitlist"
  ON waitlist_signups FOR INSERT
  WITH CHECK (true);

-- Indexes
CREATE INDEX idx_waitlist_email ON waitlist_signups(email);
CREATE INDEX idx_waitlist_status ON waitlist_signups(status);
CREATE INDEX idx_waitlist_created ON waitlist_signups(created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- TASKS
-- User-submitted tasks for AI agents to handle
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Task details
  type TEXT NOT NULL CHECK (type IN (
    'bill_dispute',
    'complaint_letter',
    'subscription_cancel',
    'refund_claim',
    'price_negotiation',
    'contract_review',
    'parking_appeal',
    'insurance_claim',
    'other'
  )),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  
  -- Provider information
  provider_name TEXT, -- e.g., 'British Gas', 'Sky', 'Virgin Media'
  provider_type TEXT, -- e.g., 'energy', 'broadband', 'mobile', 'insurance'
  account_number TEXT,
  
  -- Financial details
  disputed_amount DECIMAL(10, 2),
  currency TEXT DEFAULT 'GBP',
  
  -- Supporting documents
  attachments JSONB DEFAULT '[]', -- Array of {url, filename, type}
  
  -- Status tracking
  status TEXT NOT NULL CHECK (status IN (
    'pending_review',
    'in_progress',
    'awaiting_response',
    'resolved_success',
    'resolved_partial',
    'resolved_failed',
    'escalated',
    'cancelled'
  )) DEFAULT 'pending_review',
  
  priority TEXT CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  
  -- Outcomes
  resolved_at TIMESTAMPTZ,
  money_recovered DECIMAL(10, 2) DEFAULT 0,
  outcome_notes TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tasks"
  ON tasks FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create own tasks"
  ON tasks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tasks"
  ON tasks FOR UPDATE
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_tasks_user ON tasks(user_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_type ON tasks(type);
CREATE INDEX idx_tasks_created ON tasks(created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- AGENT_RUNS
-- Audit log of all AI agent executions
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE agent_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Agent details
  agent_type TEXT NOT NULL, -- e.g., 'complaint_writer', 'bill_analyzer', 'negotiator'
  agent_version TEXT DEFAULT '1.0',
  
  -- AI model info
  model_name TEXT DEFAULT 'claude-3-5-sonnet-20241022',
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_cost DECIMAL(10, 6), -- Cost in GBP
  
  -- Execution details
  status TEXT CHECK (status IN ('running', 'completed', 'failed', 'cancelled')) DEFAULT 'running',
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  
  -- Input/Output
  input_data JSONB, -- Original task data + context
  output_data JSONB, -- Generated letter, analysis, actions taken
  error_message TEXT,
  
  -- UK Legal citations used
  legal_references JSONB DEFAULT '[]', -- Array of {act, section, description}
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE agent_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own agent runs"
  ON agent_runs FOR SELECT
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_agent_runs_task ON agent_runs(task_id);
CREATE INDEX idx_agent_runs_user ON agent_runs(user_id);
CREATE INDEX idx_agent_runs_status ON agent_runs(status);
CREATE INDEX idx_agent_runs_created ON agent_runs(created_at DESC);

-- ════════════════════════════════════════════════════════════════════════════
-- SUBSCRIPTIONS
-- User-submitted subscriptions to monitor/cancel
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  
  -- Subscription details
  provider_name TEXT NOT NULL, -- e.g., 'Netflix', 'Spotify', 'Amazon Prime'
  category TEXT, -- e.g., 'streaming', 'software', 'fitness', 'news'
  
  -- Billing information
  amount DECIMAL(10, 2) NOT NULL,
  currency TEXT DEFAULT 'GBP',
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly', 'one-time')),
  next_billing_date DATE,
  
  -- Status
  status TEXT CHECK (status IN (
    'active',
    'pending_cancellation',
    'cancelled',
    'expired'
  )) DEFAULT 'active',
  
  -- Cancellation tracking
  cancel_requested_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancellation_method TEXT, -- 'auto_agent', 'manual_user', 'expired'
  money_saved DECIMAL(10, 2) DEFAULT 0, -- Estimated savings from early cancellation
  
  -- Usage tracking
  last_used_date DATE,
  usage_frequency TEXT CHECK (usage_frequency IN ('never', 'rarely', 'sometimes', 'often', 'daily')),
  
  -- Metadata
  notes TEXT,
  account_email TEXT,
  login_url TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own subscriptions"
  ON subscriptions FOR ALL
  USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_next_billing ON subscriptions(next_billing_date);

-- ════════════════════════════════════════════════════════════════════════════
-- FUNCTIONS & TRIGGERS
-- ════════════════════════════════════════════════════════════════════════════

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_tasks_updated_at
  BEFORE UPDATE ON tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- Auto-create profile on user signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- ════════════════════════════════════════════════════════════════════════════
-- INITIAL DATA
-- ════════════════════════════════════════════════════════════════════════════

-- Seed some example subscription categories
COMMENT ON COLUMN subscriptions.category IS 'Common UK subscription categories: streaming (Netflix, Disney+), software (Adobe, Microsoft), fitness (Peloton, ClassPass), news (Times, FT), utilities (insurance, broadband upgrades)';

COMMENT ON TABLE tasks IS 'User-submitted tasks for AI agents. Common UK scenarios: energy bill disputes (British Gas, EDF), broadband complaints (Sky, Virgin Media), council tax disputes, parking appeals, insurance claims, subscription cancellations.';

COMMENT ON TABLE agent_runs IS 'Audit trail of all AI agent executions. Stores input prompts, generated outputs, legal references cited (Consumer Rights Act 2015, Consumer Contracts Regulations 2013), and costs for transparency and compliance.';
