-- Extend the get_monthly_spending RPCs so the exclusion set matches
-- src/lib/spending.ts (introduced 27 Apr 2026 to fix the £20,733
-- digest misinformation).
--
-- Previous version excluded only:
--   user_category IN ('transfers', 'income')
--   category = 'TRANSFER'
--   income_type IN ('transfer', 'credit_loan')
--
-- That left credit-card bill repayments, investments, savings
-- top-ups, and pension contributions counted as "spending" — which
-- inflates the monthly spend headline shown in:
--   - Money Hub Spending KPI (via /api/spending)
--   - Telegram morning + evening summaries
--   - Monthly recap
-- All were over-reporting before this migration.
--
-- Loans / mortgages / water are intentionally NOT excluded — they're
-- switchable bills the user wants to see surfaced. See lib/spending.ts
-- for the full rationale.

CREATE OR REPLACE FUNCTION public.get_monthly_spending_total(p_user_id uuid, p_year integer, p_month integer)
 RETURNS numeric
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT COALESCE(SUM(ABS(amount)), 0)
  FROM bank_transactions
  WHERE user_id = p_user_id
    AND timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND timestamp < (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount < 0
    AND LOWER(COALESCE(user_category, '')) NOT IN (
      'transfer', 'transfers', 'internal_transfer', 'self_transfer',
      'credit_card_payment', 'credit_card',
      'investment', 'investments', 'savings', 'pension',
      'income', 'fee_refund'
    )
    AND UPPER(COALESCE(category, '')) NOT IN ('TRANSFER', 'CREDIT_CARD_PAYMENT')
    AND COALESCE(income_type, '') NOT IN ('transfer', 'credit_loan')
$function$;

-- The category-breakdown RPC (used by the evening-summary "this
-- month by category" panel) needs the same exclusion list.
CREATE OR REPLACE FUNCTION public.get_monthly_spending(p_user_id uuid, p_year integer, p_month integer)
 RETURNS TABLE(category text, category_total numeric, transaction_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
AS $function$
  SELECT
    LOWER(TRIM(COALESCE(user_category, category, 'other'))) AS category,
    SUM(ABS(amount)) AS category_total,
    COUNT(*) AS transaction_count
  FROM bank_transactions
  WHERE user_id = p_user_id
    AND timestamp >= MAKE_DATE(p_year, p_month, 1)::TIMESTAMPTZ
    AND timestamp < (MAKE_DATE(p_year, p_month, 1) + INTERVAL '1 month')::TIMESTAMPTZ
    AND amount < 0
    AND LOWER(COALESCE(user_category, '')) NOT IN (
      'transfer', 'transfers', 'internal_transfer', 'self_transfer',
      'credit_card_payment', 'credit_card',
      'investment', 'investments', 'savings', 'pension',
      'income', 'fee_refund'
    )
    AND UPPER(COALESCE(category, '')) NOT IN ('TRANSFER', 'CREDIT_CARD_PAYMENT')
    AND COALESCE(income_type, '') NOT IN ('transfer', 'credit_loan')
  GROUP BY LOWER(TRIM(COALESCE(user_category, category, 'other')))
$function$;
