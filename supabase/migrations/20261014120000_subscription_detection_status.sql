-- 20261014120000_subscription_detection_status.sql
--
-- WHY: the bank subscription detector listed one-off payments as
-- regular ones (coffee shops, takeaways, train tickets, bank fees,
-- interest, card repayments, buy now pay later instalments). The
-- detector has been rewritten (src/lib/subscriptions/recurrence-detector.ts)
-- and now re-checks every existing auto-detected row. Rows that no
-- longer qualify must NOT be deleted: they are marked and hidden from
-- the default subscriptions view, and the user can bring them back.
--
-- WHAT: additive columns, plus a CREATE OR REPLACE of get_subscription_total
-- (see the bottom of this file). Nothing is dropped, renamed or
-- rewritten, and no existing row is changed by this migration. The
-- daily /api/cron/detect-subscriptions run fills the new columns.
--
--   detection_status      'confirmed' | 'needs_review' | 'dismissed_by_system'
--                         NULL for manual, email and legacy rows that
--                         have not been re-checked yet (treated as visible).
--   detection_confidence  0 to 1 score from the detector.
--   detection_cadence     true cadence: weekly | fortnightly | monthly |
--                         quarterly | yearly. billing_cycle keeps its
--                         existing CHECK (monthly/quarterly/yearly/one-time),
--                         so weekly and fortnightly charges are stored
--                         there as a monthly equivalent.
--   detection_reason      short machine reason (e.g. irregular_cadence,
--                         excluded_bank_fee_or_interest).
--   detection_checked_at  when the detector last judged the row.
--
-- The CHECK constraints sit on brand new nullable columns, so they
-- cannot fail on existing data.

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS detection_status text,
  ADD COLUMN IF NOT EXISTS detection_confidence numeric(4,3),
  ADD COLUMN IF NOT EXISTS detection_cadence text,
  ADD COLUMN IF NOT EXISTS detection_reason text,
  ADD COLUMN IF NOT EXISTS detection_checked_at timestamptz;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_detection_status_check'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_detection_status_check
      CHECK (detection_status IS NULL OR detection_status IN ('confirmed', 'needs_review', 'dismissed_by_system'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_detection_cadence_check'
      AND conrelid = 'public.subscriptions'::regclass
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_detection_cadence_check
      CHECK (detection_cadence IS NULL OR detection_cadence IN ('weekly', 'fortnightly', 'monthly', 'quarterly', 'yearly'));
  END IF;
END $$;

COMMENT ON COLUMN public.subscriptions.detection_status IS
  'Bank detector verdict: confirmed | needs_review | dismissed_by_system. dismissed_by_system rows are hidden by default in the UI, never deleted. NULL = not judged (manual/email/legacy).';
COMMENT ON COLUMN public.subscriptions.detection_confidence IS 'Detector confidence 0 to 1.';
COMMENT ON COLUMN public.subscriptions.detection_cadence IS 'True detected cadence, including weekly and fortnightly.';
COMMENT ON COLUMN public.subscriptions.detection_reason IS 'Short machine reason for the detection_status.';
COMMENT ON COLUMN public.subscriptions.detection_checked_at IS 'When the detector last judged this row.';

-- Lets the re-validation pass pick unchecked or stale rows cheaply.
CREATE INDEX IF NOT EXISTS idx_subscriptions_detection_checked
  ON public.subscriptions (detection_checked_at NULLS FIRST)
  WHERE source IN ('bank', 'bank_auto') AND status = 'active';

-- get_subscription_total: leave rows the detector hid out of the totals,
-- so the header figures match the list the user sees. Body is otherwise
-- identical to the production definition read on 2026-10-14; the only
-- change is the extra detection_status predicate in active_subs.
CREATE OR REPLACE FUNCTION public.get_subscription_total(p_user_id uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
  WITH
  ledger_monthly AS (
    SELECT LOWER(REGEXP_REPLACE(COALESCE(NULLIF(TRIM(bt.recurring_group),''), NULLIF(TRIM(bt.merchant_name),''), ''), '[^a-zA-Z0-9]','','g')) AS provider_key,
      SUM(ABS(bt.amount))/12.0 AS monthly_amount
    FROM bank_transactions bt
    WHERE bt.user_id = p_user_id
      AND (auth.uid() IS NULL OR p_user_id = auth.uid())
      AND bt.amount < 0 AND bt.timestamp >= (NOW() - INTERVAL '12 months')
      AND COALESCE(bt.user_category,'') NOT IN ('transfers','income')
      AND COALESCE(bt.income_type,'') NOT IN ('transfer','credit_loan')
      AND UPPER(COALESCE(bt.category,'')) <> 'TRANSFER'
    GROUP BY 1 HAVING COUNT(*) >= 2 AND COUNT(DISTINCT DATE_TRUNC('month', bt.timestamp)) >= 2
  ),
  active_subs AS (
    SELECT s.id, LOWER(COALESCE(NULLIF(TRIM(s.category),''),'other')) AS cat,
      LOWER(REGEXP_REPLACE(COALESCE(NULLIF(TRIM(s.recurring_group),''), COALESCE(s.provider_name,'')), '[^a-zA-Z0-9]','','g')) AS provider_key,
      CASE WHEN s.billing_cycle='yearly' THEN COALESCE(s.amount,0)/12.0
           WHEN s.billing_cycle='quarterly' THEN COALESCE(s.amount,0)/3.0
           WHEN s.billing_cycle IN ('one-time','one_time') THEN 0
           ELSE COALESCE(s.amount,0) END AS fallback_monthly
    FROM subscriptions s
    WHERE s.user_id = p_user_id
      AND (auth.uid() IS NULL OR p_user_id = auth.uid())
      AND s.status='active' AND s.dismissed_at IS NULL
      AND COALESCE(s.detection_status, '') <> 'dismissed_by_system'
  ),
  per_sub AS (
    SELECT s.cat, COALESCE(lm.monthly_amount, s.fallback_monthly) AS monthly_amount
    FROM active_subs s LEFT JOIN ledger_monthly lm ON lm.provider_key = s.provider_key
  ),
  buckets AS (
    SELECT
      COALESCE(SUM(CASE WHEN cat IN ('mortgage','mortgages') THEN monthly_amount END),0) AS mortgages_monthly,
      COUNT(*) FILTER (WHERE cat IN ('mortgage','mortgages')) AS mortgages_count,
      COALESCE(SUM(CASE WHEN cat IN ('loans','loan') THEN monthly_amount END),0) AS loans_monthly,
      COUNT(*) FILTER (WHERE cat IN ('loans','loan')) AS loans_count,
      COALESCE(SUM(CASE WHEN cat IN ('council_tax','tax') THEN monthly_amount END),0) AS council_tax_monthly,
      COUNT(*) FILTER (WHERE cat IN ('council_tax','tax')) AS council_tax_count,
      COALESCE(SUM(CASE WHEN cat NOT IN ('mortgage','mortgages','loans','loan','council_tax','tax') THEN monthly_amount END),0) AS subscriptions_monthly,
      COUNT(*) FILTER (WHERE cat NOT IN ('mortgage','mortgages','loans','loan','council_tax','tax')) AS subscriptions_count
    FROM per_sub
  )
  SELECT jsonb_build_object(
    'monthly_total', (b.mortgages_monthly + b.loans_monthly + b.council_tax_monthly + b.subscriptions_monthly)::numeric,
    'subscriptions_monthly', b.subscriptions_monthly::numeric, 'subscriptions_count', b.subscriptions_count,
    'mortgages_monthly', b.mortgages_monthly::numeric, 'mortgages_count', b.mortgages_count,
    'loans_monthly', b.loans_monthly::numeric, 'loans_count', b.loans_count,
    'council_tax_monthly', b.council_tax_monthly::numeric, 'council_tax_count', b.council_tax_count
  ) FROM buckets b;
$function$;
