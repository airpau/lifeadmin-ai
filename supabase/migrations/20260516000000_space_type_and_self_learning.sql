-- Adds a `space_type` column to account_spaces (Personal / Business / Mixed)
-- so categorisation can be Space-aware: a Business Space surfaces the
-- business category set in the recategorise dropdown; a Personal Space
-- keeps the consumer categories. Default is 'personal' so existing
-- Spaces stay on their current behaviour.

ALTER TABLE public.account_spaces
  ADD COLUMN IF NOT EXISTS space_type text NOT NULL DEFAULT 'personal'
    CHECK (space_type IN ('personal', 'business', 'mixed'));

-- Backfill: any existing Space whose name contains "business" gets
-- type='business' so users with a Business Space don't have to manually
-- re-classify. Mixed Spaces (Personal + Business) stay on default
-- 'personal' until the user changes it.
UPDATE public.account_spaces
SET space_type = 'business'
WHERE space_type = 'personal'
  AND name ILIKE '%business%';

-- ---------------------------------------------------------------
-- Self-learning foundations
-- ---------------------------------------------------------------

-- alert_interactions: how the user engages with alerts. The dismiss /
-- act / snooze / view stream is the signal we learn from to stop
-- pushing alert types the user keeps dismissing, or to elevate ones
-- they act on quickly. Joins back to auth.users for per-user
-- segmentation, no cross-user join.
CREATE TABLE IF NOT EXISTS public.alert_interactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type text NOT NULL,
  alert_key text,
  action text NOT NULL CHECK (action IN ('dismissed', 'acted', 'snoozed', 'viewed')),
  response_time_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alert_interactions_user_type
  ON public.alert_interactions (user_id, alert_type, created_at DESC);

ALTER TABLE public.alert_interactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own interactions" ON public.alert_interactions;
CREATE POLICY "Users own interactions"
  ON public.alert_interactions FOR ALL
  USING (auth.uid() = user_id);

-- user_intelligence_profile: per-user preferences the daily learning
-- cron updates. Single row per user; updated_at lets cron detect
-- stale rows.
CREATE TABLE IF NOT EXISTS public.user_intelligence_profile (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  account_mode text NOT NULL DEFAULT 'personal'
    CHECK (account_mode IN ('personal', 'business', 'mixed')),
  alert_sensitivity text NOT NULL DEFAULT 'medium'
    CHECK (alert_sensitivity IN ('low', 'medium', 'high')),
  preferred_alert_hour integer NOT NULL DEFAULT 8,
  large_transaction_threshold_pence integer NOT NULL DEFAULT 10000,
  dismissed_alert_types text[] NOT NULL DEFAULT '{}',
  engagement_score numeric NOT NULL DEFAULT 0.5,
  last_updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_intelligence_profile ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users own profile" ON public.user_intelligence_profile;
CREATE POLICY "Users own profile"
  ON public.user_intelligence_profile FOR ALL
  USING (auth.uid() = user_id);

-- dispute_outcome_intelligence: anonymous, aggregate dispute outcome
-- data shared across users. NO user_id on this table — the
-- vote_count + win_rate are computed from anonymised user inputs and
-- intentionally exposed to every authenticated client. RLS stays off.
CREATE TABLE IF NOT EXISTS public.dispute_outcome_intelligence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_pattern text NOT NULL,
  category text,
  dispute_type text,
  cited_law text,
  amount_band text,
  outcome text NOT NULL CHECK (outcome IN ('won', 'partial', 'lost')),
  vote_count integer NOT NULL DEFAULT 1,
  win_rate numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(merchant_pattern, dispute_type, cited_law)
);

CREATE INDEX IF NOT EXISTS idx_dispute_outcome_intelligence_merchant
  ON public.dispute_outcome_intelligence (merchant_pattern);
