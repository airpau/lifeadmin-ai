-- Referral system enhancements and Awin postback tracking
-- RULE 2: Only additive changes. No removals or renames.

-- Add missing columns to referrals table
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS signup_at TIMESTAMPTZ;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS points_awarded_signup BOOLEAN DEFAULT FALSE;
ALTER TABLE referrals ADD COLUMN IF NOT EXISTS points_awarded_paid BOOLEAN DEFAULT FALSE;

-- Add unique constraint on referral_code if not exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'referrals_referral_code_key'
  ) THEN
    ALTER TABLE referrals ADD CONSTRAINT referrals_referral_code_key UNIQUE (referral_code);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Awin postback transaction log
CREATE TABLE IF NOT EXISTS awin_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  transaction_id TEXT NOT NULL,
  commission_pence INTEGER,
  status TEXT DEFAULT 'pending',
  points_awarded BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE awin_transactions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_awin_transactions_user ON awin_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_awin_transactions_txn ON awin_transactions(transaction_id);
