-- One-time backfill to assign user_category to historical transactions
-- based on merchant_rules patterns.
-- Execute this query via the Supabase SQL Editor.

UPDATE bank_transactions bt
SET user_category = mr.category
FROM merchant_rules mr
WHERE bt.user_category IS NULL
AND (
  bt.description ILIKE '%' || mr.pattern || '%'
  OR bt.merchant_name ILIKE '%' || mr.pattern || '%'
);
