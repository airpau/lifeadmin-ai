-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 2 of the single-source-of-truth refactor.
--
-- Problem:
--   Six different writers (detect-recurring, POST /api/subscriptions, the
--   Telegram/Pocket agent, the AI chatbot, cron/detect-subscriptions, the
--   Gmail email scanner) all INSERT into `subscriptions` with their own
--   de-duplication heuristics. Two rows for "London Borough of Hounslow
--   parking" ended up in the list because one path matched by exact name,
--   another by keyword overlap, and none shared a stable join key. When
--   Pocket then updated one of the two rows to yearly, the UI still showed
--   the other row as monthly.
--
-- Fix:
--   1. Add a `recurring_group` column on `subscriptions` — the normalised
--      alphanumeric provider key. Same key is already computed on the fly
--      in `get_subscription_total` against `bank_transactions`, so joining
--      subs ↔ ledger becomes a direct equality check.
--   2. Backfill the column from `provider_name`.
--   3. Soft-merge active duplicates — keep the oldest, dismiss the rest.
--   4. Partial unique index so new writes cannot re-create duplicates.
--   5. Update `get_subscription_total` to prefer the stored key when
--      present (idempotent CREATE OR REPLACE).
--
-- Additive-only: no DROP, no column-removing ALTER, no DELETE. Duplicate
-- rows are retained with `dismissed_at` set so the audit trail survives.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── 1. Add the column ──────────────────────────────────────────────────────
ALTER TABLE subscriptions
  ADD COLUMN IF NOT EXISTS recurring_group text;

COMMENT ON COLUMN subscriptions.recurring_group IS
  'Normalised alphanumeric provider key (lowercase, no punctuation/whitespace). '
  'Canonical join key between subscriptions and bank_transactions.recurring_group. '
  'Populated by all write paths; partial-unique per (user_id, recurring_group) '
  'among active non-dismissed rows. See migration 20260422020000.';

-- ─── 2. Backfill from provider_name ─────────────────────────────────────────
-- Strip everything that isn''t [a-z0-9] from a lowercased provider_name.
-- "London Borough of Hounslow" → "londonboroughofhounslow".
-- Idempotent: applying the same transform to an already-stripped string is
-- a no-op.
UPDATE subscriptions
SET recurring_group = LOWER(REGEXP_REPLACE(COALESCE(provider_name, ''), '[^a-zA-Z0-9]', '', 'g'))
WHERE recurring_group IS NULL
  AND provider_name IS NOT NULL
  AND TRIM(provider_name) <> '';

-- Any empty-string results (provider_name was all punctuation) → NULL so the
-- partial unique index doesn''t try to enforce on them.
UPDATE subscriptions
SET recurring_group = NULL
WHERE recurring_group = '';

-- ─── 3. Merge active duplicates ─────────────────────────────────────────────
-- For each (user_id, recurring_group) with multiple active non-dismissed
-- rows, keep the oldest and soft-dismiss the rest. Status flipped to
-- 'cancelled' because the CHECK constraint doesn''t allow 'dismissed' /
-- 'merged' and 'cancelled' is the closest permitted value.
WITH ranked AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY user_id, recurring_group
           ORDER BY created_at ASC NULLS LAST, id ASC
         ) AS rn
  FROM subscriptions
  WHERE recurring_group IS NOT NULL
    AND dismissed_at IS NULL
    AND status = 'active'
)
UPDATE subscriptions s
SET dismissed_at = NOW(),
    status       = 'cancelled',
    notes        = COALESCE(s.notes || E'\n', '') ||
                   '[auto-merged duplicate on ' || CURRENT_DATE::text || ']'
FROM ranked r
WHERE s.id = r.id
  AND r.rn > 1;

-- ─── 4. Partial unique index ────────────────────────────────────────────────
-- Prevents future writes from re-introducing duplicates for the same
-- provider, user-side. Partial — only enforced on active, non-dismissed
-- rows — so the audit-trail dupes we just soft-dismissed don''t trip it.
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_user_recurring_group_active_uidx
  ON subscriptions (user_id, recurring_group)
  WHERE recurring_group IS NOT NULL
    AND dismissed_at IS NULL
    AND status = 'active';

-- ─── 5. Refresh get_subscription_total to use the stored key ────────────────
-- Same shape as 20260422010000 but the join now prefers the stored
-- recurring_group when set, falling back to a computed provider key for
-- rows that pre-date this migration or were inserted before the write
-- paths were updated. CREATE OR REPLACE — no behavioural regression for
-- callers: same input, same output shape.
CREATE OR REPLACE FUNCTION get_subscription_total(p_user_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  WITH
  ledger_monthly AS (
    SELECT
      LOWER(REGEXP_REPLACE(
        COALESCE(
          NULLIF(TRIM(bt.recurring_group), ''),
          NULLIF(TRIM(bt.merchant_name),   ''),
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
      AND UPPER(COALESCE(bt.category, '')) <> 'TRANSFER'
    GROUP BY 1
    HAVING COUNT(*) >= 2
       AND COUNT(DISTINCT DATE_TRUNC('month', bt.timestamp)) >= 2
  ),

  active_subs AS (
    SELECT
      s.id,
      LOWER(COALESCE(NULLIF(TRIM(s.category), ''), 'other')) AS cat,
      -- Prefer the stored key. Fall back to a computed key for legacy rows
      -- (pre-20260422020000) that haven''t been re-written yet.
      LOWER(REGEXP_REPLACE(
        COALESCE(
          NULLIF(TRIM(s.recurring_group), ''),
          COALESCE(s.provider_name, '')
        ),
        '[^a-zA-Z0-9]', '', 'g'
      )) AS provider_key,
      CASE
        WHEN s.billing_cycle = 'yearly'    THEN COALESCE(s.amount, 0) / 12.0
        WHEN s.billing_cycle = 'quarterly' THEN COALESCE(s.amount, 0) / 3.0
        WHEN s.billing_cycle IN ('one-time', 'one_time') THEN 0
        ELSE COALESCE(s.amount, 0)
      END AS fallback_monthly
    FROM subscriptions s
    WHERE s.user_id      = p_user_id
      AND s.status       = 'active'
      AND s.dismissed_at IS NULL
  ),

  per_sub AS (
    SELECT
      s.cat,
      COALESCE(lm.monthly_amount, s.fallback_monthly) AS monthly_amount
    FROM active_subs s
    LEFT JOIN ledger_monthly lm ON lm.provider_key = s.provider_key
  ),

  buckets AS (
    SELECT
      COALESCE(SUM(CASE WHEN cat IN ('mortgage', 'mortgages')     THEN monthly_amount END), 0) AS mortgages_monthly,
      COUNT(*) FILTER (WHERE cat IN ('mortgage', 'mortgages'))                                   AS mortgages_count,
      COALESCE(SUM(CASE WHEN cat IN ('loans', 'loan')             THEN monthly_amount END), 0) AS loans_monthly,
      COUNT(*) FILTER (WHERE cat IN ('loans', 'loan'))                                           AS loans_count,
      COALESCE(SUM(CASE WHEN cat IN ('council_tax', 'tax')        THEN monthly_amount END), 0) AS council_tax_monthly,
      COUNT(*) FILTER (WHERE cat IN ('council_tax', 'tax'))                                      AS council_tax_count,
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
