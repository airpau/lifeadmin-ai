-- Fix subscription auto-detection

-- Fix is_subscription flags
UPDATE merchant_rules SET is_subscription = true WHERE category IN ('streaming', 'software', 'fitness', 'mobile');
UPDATE merchant_rules SET is_subscription = true WHERE category IN ('utility', 'broadband', 'insurance', 'mortgage', 'council_tax', 'loan');
UPDATE merchant_rules SET is_subscription = false WHERE is_subscription IS NULL;

-- Add payment_type column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns WHERE table_name = 'merchant_rules' AND column_name = 'payment_type'
  ) THEN
    ALTER TABLE merchant_rules ADD COLUMN payment_type TEXT DEFAULT 'one_off';
  END IF;
END $$;

UPDATE merchant_rules SET payment_type = 'subscription' WHERE category IN ('streaming', 'software', 'fitness');
UPDATE merchant_rules SET payment_type = 'direct_debit' WHERE category IN ('utility', 'broadband', 'insurance', 'mortgage', 'council_tax', 'mobile');

-- Backfill merchant_name on transactions
UPDATE bank_transactions bt
SET merchant_name = mr.display_name
FROM merchant_rules mr
WHERE bt.merchant_name IS NULL
  AND UPPER(bt.description) LIKE '%' || mr.raw_name || '%';
