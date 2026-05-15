-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 1 of the single-source-of-truth refactor.
--
-- Two RPCs that the dashboard + subscriptions page already call but which
-- have never existed in any migration, which is why:
--   • "Potential Savings Found" showed stale/undefined values,
--   • council tax per month rendered as £0 on the subscriptions tab while
--     Money Hub (which reads bank_transactions directly) showed it correctly,
--   • deleting a subscription did not update the page totals.
--
-- Architecture principle (agreed 22 Apr 2026):
--   bank_transactions is the canonical ledger. Subscription-level totals
--   are derived from the ledger. The `subscriptions` table is used only for:
--     (a) which items the user has acknowledged / manually added, and
--     (b) the user's chosen category override for a recurring_group.
--
--   User category corrections flow from subscriptions.category into
--   bank_transactions.user_category via apply_subscription_category_correction
--   (migration 20260417000000) so the ledger is kept in sync with user intent.
--
-- This migration is ADDITIVE: CREATE OR REPLACE only, no DROP / ALTER-to-
-- remove. Matches the CLAUDE.md deployment-safety rule.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. get_subscription_total ──────────────────────────────────────────────
-- Returns a jsonb breakdown of the user's recurring outgoings bucketed by
-- category (subscriptions / mortgages / loans / council tax), computed from
-- the LEDGER (bank_transactions) where possible and falling back to the
-- subscription row's own amount × billing_cycle when the ledger has no
-- matching recurring group (e.g. manually-added subs, first-month users).
--
-- Shape (matches what src/app/dashboard/subscriptions/page.tsx:131 expects):
--   {
--     monthly_total, subscriptions_monthly, subscriptions_count,
--     mortgages_monthly, mortgages_count, loans_monthly, loans_count,
--     council_tax_monthly, council_tax_count
--   }
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_subscription_total(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH
  -- 12-month window of recurring debits in the ledger, summed to a monthly
  -- equivalent per normalised provider key. Using a 12-month divisor
  -- naturally handles monthly / quarterly / yearly billing without having
  -- to infer the cycle: yearly council tax × 1 year / 12 == monthly budget
  -- contribution, monthly Netflix × 12 / 12 == the monthly fee, etc.
  ledger_monthly AS (
    SELECT
      LOWER(REGEXP_REPLACE(
        COALESCE(
          NULLIF(TRIM(bt.recurring_group), ''),
          NULLIF(TRIM(bt.merchant_name), ''),
          ''
        ),
        '[^a-zA-Z0-9]', '', 'g'
      )) AS provider_key,
      SUM(ABS(bt.amount)) / 12.0 AS monthly_amount
    FROM bank_transactions bt
    WHERE bt.user_id = p_user_id
      AND bt.amount < 0
      AND bt.timestamp >= (NOW() - INTERVAL '12 months')
      AND COALESCE(bt.user_category, '') NOT IN ('transfers', 'income')
      AND COALESCE(bt.income_type,   '') NOT IN ('transfer', 'credit_loan')
      AND UPPER(COALESCE(bt.category, '')) != 'TRANSFER'
    GROUP BY 1
    HAVING COUNT(*) >= 2
       AND COUNT(DISTINCT DATE_TRUNC('month', bt.timestamp)) >= 2
  ),

  -- Active, non-dismissed subscriptions with their user-chosen category.
  -- This is the authoritative "what the user wants to see" set. Anything
  -- dismissed is excluded here and therefore excluded from all bucket totals.
  active_subs AS (
    SELECT
      s.id,
      LOWER(COALESCE(NULLIF(TRIM(s.category), ''), 'other')) AS cat,
      LOWER(REGEXP_REPLACE(COALESCE(s.provider_name, ''), '[^a-zA-Z0-9]', '', 'g')) AS provider_key,
      -- Fallback monthly amount if the ledger has no matching recurring group.
      -- Normalises billing_cycle (monthly / quarterly / yearly / one-time) to
      -- a monthly equivalent; one-time contributes 0 (it is not recurring).
      CASE
        WHEN s.billing_cycle = 'yearly'    THEN COALESCE(s.amount, 0) / 12.0
        WHEN s.billing_cycle = 'quarterly' THEN COALESCE(s.amount, 0) / 3.0
        WHEN s.billing_cycle IN ('one-time', 'one_time') THEN 0
        ELSE COALESCE(s.amount, 0)
      END AS fallback_monthly
    FROM subscriptions s
    WHERE s.user_id = p_user_id
      AND s.status  = 'active'
      AND s.dismissed_at IS NULL
  ),

  -- For each active subscription, prefer the ledger-derived monthly amount;
  -- fall back to the subscription's own amount if the ledger has no match.
  per_sub AS (
    SELECT
      s.cat,
      COALESCE(lm.monthly_amount, s.fallback_monthly) AS monthly_amount
    FROM active_subs s
    LEFT JOIN ledger_monthly lm ON lm.provider_key = s.provider_key
  ),

  buckets AS (
    SELECT
      -- Mortgages
      COALESCE(SUM(CASE WHEN cat IN ('mortgage', 'mortgages')     THEN monthly_amount END), 0) AS mortgages_monthly,
      COUNT(*) FILTER (WHERE cat IN ('mortgage', 'mortgages'))                                   AS mortgages_count,
      -- Loans
      COALESCE(SUM(CASE WHEN cat IN ('loans', 'loan')             THEN monthly_amount END), 0) AS loans_monthly,
      COUNT(*) FILTER (WHERE cat IN ('loans', 'loan'))                                           AS loans_count,
      -- Council tax (canonical name is 'council_tax'; we also accept 'tax'
      -- for legacy rows that haven't been re-categorised yet).
      COALESCE(SUM(CASE WHEN cat IN ('council_tax', 'tax')        THEN monthly_amount END), 0) AS council_tax_monthly,
      COUNT(*) FILTER (WHERE cat IN ('council_tax', 'tax'))                                      AS council_tax_count,
      -- Everything else (the visible subscription list)
      COALESCE(SUM(CASE WHEN cat NOT IN (
        'mortgage', 'mortgages', 'loans', 'loan', 'council_tax', 'tax'
      ) THEN monthly_amount END), 0) AS subscriptions_monthly,
      COUNT(*) FILTER (WHERE cat NOT IN (
        'mortgage', 'mortgages', 'loans', 'loan', 'council_tax', 'tax'
      )) AS subscriptions_count
    FROM per_sub
  )

  SELECT jsonb_build_object(
    'monthly_total',
      (b.mortgages_monthly + b.loans_monthly + b.council_tax_monthly + b.subscriptions_monthly)::numeric,
    'subscriptions_monthly', b.subscriptions_monthly::numeric,
    'subscriptions_count',   b.subscriptions_count,
    'mortgages_monthly',     b.mortgages_monthly::numeric,
    'mortgages_count',       b.mortgages_count,
    'loans_monthly',         b.loans_monthly::numeric,
    'loans_count',           b.loans_count,
    'council_tax_monthly',   b.council_tax_monthly::numeric,
    'council_tax_count',     b.council_tax_count
  )
  FROM buckets b;
$$;

GRANT EXECUTE ON FUNCTION get_subscription_total(uuid) TO authenticated, service_role;


-- ─── 2. dismiss_subscription ────────────────────────────────────────────────
-- Soft-deletes a subscription (sets dismissed_at + flips status to
-- 'cancelled') and returns the fresh totals so the caller can update the UI
-- in a single round trip. Used by DELETE /api/subscriptions/[id].
--
-- Uses plpgsql so we can raise an explicit error when the subscription does
-- not belong to the user — the frontend surfaces this as a 500 with the
-- Postgres error text, which is preferable to silently returning success.
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION dismiss_subscription(
  p_user_id         uuid,
  p_subscription_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := NOW();
BEGIN
  IF p_user_id IS NULL OR p_subscription_id IS NULL THEN
    RAISE EXCEPTION 'dismiss_subscription: p_user_id and p_subscription_id are required';
  END IF;

  UPDATE subscriptions
  SET dismissed_at = v_now,
      -- Keep status in the table's CHECK-allowed enum. 'cancelled' is the
      -- safest choice: the table's initial schema permits it, and downstream
      -- filters (.eq('status','active')) already treat anything non-active
      -- as excluded.
      status = CASE WHEN status = 'active' THEN 'cancelled' ELSE status END
  WHERE id      = p_subscription_id
    AND user_id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'dismiss_subscription: subscription % not found for user %',
      p_subscription_id, p_user_id;
  END IF;

  RETURN COALESCE(get_subscription_total(p_user_id), '{}'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION dismiss_subscription(uuid, uuid) TO authenticated, service_role;
