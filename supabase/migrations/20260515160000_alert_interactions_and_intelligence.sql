-- Alert-interaction tracking + self-learning intelligence tables.
--
-- These tables were originally created in the live DB by the
-- `space_type_and_self_learning` migration (applied 2026-04 / 05). This
-- file is the canonical, idempotent re-statement so any local / staging
-- environment can be bootstrapped to the same shape, and so the next
-- engineer can see the columns the code writes to without diffing the
-- production schema.
--
-- Every statement is CREATE TABLE IF NOT EXISTS / ALTER TABLE ... IF NOT
-- EXISTS — safe to re-apply on the live DB.

-- ─── alert_interactions ───────────────────────────────────────────────
-- Every time a user dismisses / acts on / snoozes / views one of our
-- alerts (price hike, renewal, dispute reply, budget, etc.), we drop
-- a row here. Feeds the relevance engine that decides which alert
-- types each user actually engages with.
CREATE TABLE IF NOT EXISTS alert_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  alert_type TEXT NOT NULL,
  alert_key TEXT,
  action TEXT NOT NULL CHECK (action IN ('dismissed', 'acted', 'snoozed', 'viewed')),
  response_time_seconds INTEGER,
  surface TEXT,           -- 'web' / 'telegram' / 'whatsapp' / 'email'
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_alert_interactions_user_created
  ON alert_interactions(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_interactions_user_type_action
  ON alert_interactions(user_id, alert_type, action);

ALTER TABLE alert_interactions ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read own alert interactions" ON alert_interactions
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service writes alert interactions" ON alert_interactions
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── user_intelligence_profile ────────────────────────────────────────
-- One row per user. Aggregates learned preferences (account_mode,
-- preferred categorisation patterns, etc.) the AI uses to tailor
-- categorisation and reporting.
CREATE TABLE IF NOT EXISTS user_intelligence_profile (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_mode TEXT,           -- 'personal' / 'business' / 'mixed'
  business_category_pct NUMERIC,
  preferred_categories JSONB,  -- merchant_pattern → category overrides
  category_correction_count INTEGER DEFAULT 0,
  total_category_corrections INTEGER DEFAULT 0,
  last_updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_intelligence_profile ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users read own intelligence profile" ON user_intelligence_profile
    FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Users update own intelligence profile" ON user_intelligence_profile
    FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service writes intelligence profile" ON user_intelligence_profile
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── merchant_category_wisdom ─────────────────────────────────────────
-- Anonymous cross-user category learning. When user A recategorises
-- "Tesco" → "groceries", we increment the count here so users B/C/D
-- (who haven't manually set a category yet) benefit from the wisdom
-- of the crowd without any PII crossing accounts.
CREATE TABLE IF NOT EXISTS merchant_category_wisdom (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_pattern TEXT NOT NULL,
  user_category TEXT NOT NULL,
  vote_count INTEGER DEFAULT 1,
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (merchant_pattern, user_category)
);

CREATE INDEX IF NOT EXISTS idx_merchant_category_wisdom_pattern
  ON merchant_category_wisdom(merchant_pattern);

ALTER TABLE merchant_category_wisdom ENABLE ROW LEVEL SECURITY;

-- merchant_category_wisdom is fully anonymous — readable by anyone
-- authenticated, only the service role writes (no PII columns).
DO $$ BEGIN
  CREATE POLICY "Authenticated reads merchant wisdom" ON merchant_category_wisdom
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service writes merchant wisdom" ON merchant_category_wisdom
    FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Service updates merchant wisdom" ON merchant_category_wisdom
    FOR UPDATE USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ─── bank_connections.is_business ─────────────────────────────────────
-- Used by the income classifier to decide whether to apply
-- business-account-aware rules (HMRC credit → tax_refund, large
-- regular transfers → client_payment, etc.).
ALTER TABLE bank_connections
  ADD COLUMN IF NOT EXISTS is_business BOOLEAN DEFAULT FALSE;
