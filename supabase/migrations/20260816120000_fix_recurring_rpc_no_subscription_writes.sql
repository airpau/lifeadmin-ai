-- 20260816120000_fix_recurring_rpc_no_subscription_writes.sql
--
-- WHY: detect_and_sync_recurring_transactions() was a second, rogue writer
-- into `subscriptions` alongside the TypeScript detector. Its step 3
-- auto-inserted rows on every bank sync with far weaker rules than the
-- TS detector now enforces:
--   * >= 2 occurrences across >= 2 distinct months — a single interval,
--     no cadence/regularity check at all;
--   * amount spread tolerance of GREATEST(30%, £5);
--   * billing_cycle hardcoded to 'monthly' whatever the real cadence;
--   * its NOT EXISTS dedup deliberately excluded rows with
--     status IN ('dismissed', 'cancelled'), so every sync RE-CREATED
--     subscriptions the user had already dismissed or cancelled.
--
-- FIX: this migration replaces the function body KEEPING steps 1-2
-- (identifying recurring candidate groups and flagging
-- bank_transactions.is_recurring + recurring_group — other features
-- read those flags) and REMOVING step 3 entirely. The function no
-- longer writes to `subscriptions` under any circumstances. The
-- TypeScript detector (src/lib/detect-recurring.ts, backed by
-- src/lib/subscriptions/recurring-qualification.ts) is now the single
-- writer of bank-detected subscription rows.
--
-- The signature and return shape are unchanged:
--   detect_and_sync_recurring_transactions(p_user_id uuid) RETURNS jsonb
--   -> {"transactions_flagged": <n>, "subscriptions_created": 0}
-- so the existing callers (api/cron/bank-sync, api/bank/sync-now,
-- api/yapily/initial-sync) keep working without changes.
--
-- Additive-only policy: no tables or columns are dropped; this is a
-- CREATE OR REPLACE of a function body only.

CREATE OR REPLACE FUNCTION public.detect_and_sync_recurring_transactions(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  updated_txns integer := 0;
  result jsonb;
BEGIN
  -- Defensive: connection pooling can leave a stale temp table from a
  -- previous invocation that errored before its DROP. The old
  -- CREATE TEMP TABLE IF NOT EXISTS would then silently reuse another
  -- user's candidate rows. Always start clean.
  DROP TABLE IF EXISTS temp_recurring_candidates;

  -- Step 1: Identify recurring transaction groups
  CREATE TEMP TABLE temp_recurring_candidates AS
  WITH normalised_txns AS (
    SELECT
      id,
      user_id,
      description,
      merchant_name,
      amount,
      timestamp,
      account_id,
      is_recurring,
      recurring_group,
      COALESCE(
        recurring_group,
        LOWER(TRIM(merchant_name)),
        LOWER(TRIM(regexp_replace(
          regexp_replace(
            regexp_replace(description, '^\d{4}\s+\d{2}[A-Z]{3}\d{2}\s+(CD\s+|D\s+)?', ''),
            '\s+\d+\s+.*$', ''
          ),
          '\s+(GB|IE|US|EG)$', ''
        )))
      ) AS norm_group
    FROM bank_transactions
    WHERE user_id = p_user_id
      AND amount < 0
  ),
  grouped AS (
    SELECT
      norm_group,
      COUNT(*) AS occurrence_count,
      COUNT(DISTINCT date_trunc('month', timestamp)) AS distinct_months,
      AVG(ABS(amount)) AS avg_amount,
      MAX(ABS(amount)) AS max_amount,
      MIN(ABS(amount)) AS min_amount,
      MAX(timestamp) AS latest_txn,
      AVG(EXTRACT(DAY FROM timestamp))::integer AS avg_day_of_month,
      (ARRAY_AGG(ABS(amount) ORDER BY timestamp DESC))[1] AS latest_amount,
      (ARRAY_AGG(merchant_name ORDER BY timestamp DESC))[1] AS latest_merchant_name,
      (ARRAY_AGG(description ORDER BY timestamp DESC))[1] AS latest_description
    FROM normalised_txns
    WHERE norm_group IS NOT NULL
      AND norm_group != ''
    GROUP BY norm_group
  )
  SELECT *
  FROM grouped
  WHERE occurrence_count >= 2
    AND distinct_months >= 2
    AND (max_amount - min_amount) <= GREATEST(avg_amount * 0.3, 5)
    AND latest_txn >= NOW() - INTERVAL '60 days';

  -- Step 2: Update is_recurring flag for matching transactions
  UPDATE bank_transactions bt
  SET
    is_recurring = true,
    recurring_group = COALESCE(bt.recurring_group, tc.norm_group)
  FROM temp_recurring_candidates tc
  WHERE bt.user_id = p_user_id
    AND bt.is_recurring = false
    AND (
      LOWER(TRIM(bt.merchant_name)) = tc.norm_group
      OR LOWER(TRIM(bt.recurring_group)) = tc.norm_group
      OR LOWER(TRIM(regexp_replace(
        regexp_replace(
          regexp_replace(bt.description, '^\d{4}\s+\d{2}[A-Z]{3}\d{2}\s+(CD\s+|D\s+)?', ''),
          '\s+\d+\s+.*$', ''
        ),
        '\s+(GB|IE|US|EG)$', ''
      ))) = tc.norm_group
    );

  GET DIAGNOSTICS updated_txns = ROW_COUNT;

  -- Step 3 (subscription auto-creation) REMOVED — see header comment.
  -- The TypeScript detector is the single writer into `subscriptions`.

  DROP TABLE IF EXISTS temp_recurring_candidates;

  result := jsonb_build_object(
    'transactions_flagged', updated_txns,
    'subscriptions_created', 0
  );

  RETURN result;
END;
$function$;
