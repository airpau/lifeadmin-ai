-- User category overrides: when a user recategorises a transaction or merchant,
-- store the override so it persists across syncs and applies to future matches

CREATE TABLE IF NOT EXISTS money_hub_category_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  -- Match by merchant name (applies to all transactions from this merchant)
  merchant_pattern TEXT NOT NULL,
  -- The user's chosen category
  user_category TEXT NOT NULL,
  -- Optional: override for a specific transaction only
  transaction_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE money_hub_category_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own overrides" ON money_hub_category_overrides FOR ALL USING (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_mhco_user ON money_hub_category_overrides(user_id);
CREATE INDEX IF NOT EXISTS idx_mhco_merchant ON money_hub_category_overrides(user_id, merchant_pattern);

-- Add user_category column to bank_transactions for storing user overrides
-- This preserves the original bank category while allowing user customisation
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS user_category TEXT;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS income_type TEXT
  CHECK (income_type IN ('salary', 'freelance', 'benefits', 'rental', 'investment', 'refund', 'transfer', 'other'));
