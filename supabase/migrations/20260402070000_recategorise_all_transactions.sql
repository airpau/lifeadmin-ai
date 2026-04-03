-- Re-categorisation function that re-applies merchant_rules to ALL transactions
-- Respects user overrides (money_hub_category_overrides takes precedence)
-- Use after adding new merchant rules to retroactively fix miscategorised transactions
CREATE OR REPLACE FUNCTION recategorise_all_transactions(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  merchant_count integer := 0;
BEGIN
  -- Step 1: Re-apply merchant_rules (longest match wins)
  -- Skip transactions with user-defined overrides
  WITH merchant_matched AS (
    SELECT DISTINCT ON (bt.id) bt.id,
      CASE
        WHEN mr.is_transfer = true THEN 'transfers'
        WHEN mr.category = 'utility' THEN 'energy'
        WHEN mr.category = 'loan' THEN 'loans'
        WHEN mr.category = 'fee' THEN 'bills'
        WHEN mr.category = 'food' AND bt.amount < -20 THEN 'groceries'
        WHEN mr.category = 'food' THEN 'eating_out'
        WHEN mr.category = 'gambling' THEN 'entertainment'
        WHEN mr.category = 'travel' THEN 'transport'
        WHEN mr.category = 'healthcare' THEN 'insurance'
        WHEN mr.category = 'charity' THEN 'bills'
        WHEN mr.category = 'education' THEN 'professional'
        WHEN mr.category = 'pets' THEN 'bills'
        ELSE mr.category
      END as new_category
    FROM bank_transactions bt
    JOIN merchant_rules mr
      ON LOWER(bt.description) LIKE '%' || mr.raw_name_normalised || '%'
    WHERE bt.user_id = p_user_id
      AND NOT EXISTS (
        SELECT 1 FROM money_hub_category_overrides o
        WHERE o.user_id = p_user_id
          AND o.transaction_id = bt.id::text
      )
    ORDER BY bt.id, LENGTH(mr.raw_name_normalised) DESC
  )
  UPDATE bank_transactions bt
  SET user_category = mm.new_category
  FROM merchant_matched mm
  WHERE bt.id = mm.id
    AND bt.user_category IS DISTINCT FROM mm.new_category;
  GET DIAGNOSTICS merchant_count = ROW_COUNT;

  -- Step 2: Handle remaining uncategorised
  UPDATE bank_transactions SET user_category = 'transfers'
  WHERE user_id = p_user_id AND user_category IS NULL AND category = 'TRANSFER';

  UPDATE bank_transactions SET user_category = 'income'
  WHERE user_id = p_user_id AND user_category IS NULL AND category = 'CREDIT' AND amount > 0;

  UPDATE bank_transactions SET user_category = 'bills'
  WHERE user_id = p_user_id AND user_category IS NULL AND category IN ('STANDING_ORDER', 'DIRECT_DEBIT');

  RETURN jsonb_build_object('merchant_rules_applied', merchant_count, 'status', 'complete');
END;
$$;
