-- Telegram Workflow Engine — Phase 1 supporting tables
-- Tracks the full lifecycle: detection → action → confirmed saving

-- ============================================================
-- 1. DETECTED ISSUES — actionable problems found by cron/AI
-- ============================================================
CREATE TABLE IF NOT EXISTS detected_issues (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What was detected
  issue_type TEXT NOT NULL CHECK (issue_type IN (
    'price_increase',        -- recurring charge went up
    'contract_expiring',     -- contract ending within 30 days
    'budget_overrun',        -- category exceeded budget limit
    'unused_subscription',   -- subscription not used in 60+ days
    'duplicate_charge',      -- same merchant charged twice
    'renewal_imminent',      -- subscription renewing within 7 days
    'dispute_no_response',   -- sent complaint, no reply after N days
    'dispute_escalation_due' -- dispute ready to escalate to ombudsman
  )),

  -- Human-readable description
  title TEXT NOT NULL,          -- "British Gas direct debit up £23/month"
  detail TEXT NOT NULL,         -- "That's £276/year more than 3 months ago."
  recommendation TEXT,          -- "I can draft a complaint citing Ofgem exit rights."

  -- Source data
  source_type TEXT CHECK (source_type IN (
    'bank_transaction', 'subscription', 'contract', 'dispute', 'budget'
  )),
  source_id UUID,               -- FK to the source record (subscription id, dispute id, etc.)
  amount_impact DECIMAL(10,2),  -- annual financial impact of the issue

  -- Telegram delivery
  telegram_chat_id BIGINT,      -- if delivered via Telegram
  telegram_message_id BIGINT,   -- Telegram message ID for editing/follow-up
  delivered_at TIMESTAMPTZ,

  -- Workflow status
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN (
    'active',       -- detected, not yet actioned
    'actioned',     -- user took an action (letter drafted, cancelled, etc.)
    'resolved',     -- confirmed savings or outcome
    'dismissed',    -- user dismissed it
    'snoozed'       -- check again later
  )),
  snooze_until TIMESTAMPTZ,
  actioned_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,

  -- Follow-up tracking
  follow_up_due_at TIMESTAMPTZ, -- when to remind the user
  follow_up_sent_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE detected_issues ENABLE ROW LEVEL SECURITY;
-- Service role only — bot and cron use service key

CREATE INDEX IF NOT EXISTS idx_di_user_status ON detected_issues(user_id, status) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_di_followup ON detected_issues(follow_up_due_at) WHERE follow_up_due_at IS NOT NULL AND status = 'actioned';
CREATE INDEX IF NOT EXISTS idx_di_user_type ON detected_issues(user_id, issue_type);

-- ============================================================
-- 2. VERIFIED SAVINGS — confirmed outcomes from disputes/actions
-- ============================================================
CREATE TABLE IF NOT EXISTS verified_savings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- What was saved / won
  saving_type TEXT NOT NULL CHECK (saving_type IN (
    'dispute_won',       -- complaint upheld, money back
    'price_reverted',    -- provider reverted a price increase
    'subscription_cancelled', -- user cancelled with our help
    'contract_exited',   -- got out of a contract early
    'compensation',      -- received compensation (flight, delay, etc.)
    'refund',            -- refund processed
    'other'
  )),

  title TEXT NOT NULL,          -- "British Gas complaint upheld"
  description TEXT,
  amount_saved DECIMAL(10,2) NOT NULL DEFAULT 0,  -- one-time amount
  annual_saving DECIMAL(10,2) DEFAULT 0,           -- ongoing annual saving
  currency TEXT DEFAULT 'GBP',

  -- Source
  dispute_id UUID REFERENCES disputes(id) ON DELETE SET NULL,
  detected_issue_id UUID REFERENCES detected_issues(id) ON DELETE SET NULL,
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,

  -- Evidence
  evidence_notes TEXT,
  confirmed_by TEXT CHECK (confirmed_by IN ('user', 'bank_transaction', 'agent', 'telegram')),
  confirmed_at TIMESTAMPTZ DEFAULT NOW(),

  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE verified_savings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own verified savings"
  ON verified_savings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own verified savings"
  ON verified_savings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_vs_user ON verified_savings(user_id, confirmed_at DESC);
CREATE INDEX IF NOT EXISTS idx_vs_type ON verified_savings(user_id, saving_type);
