-- chatbot_corrections: log when users correct AI categorisation decisions
-- Used for improving auto-categorisation over time and applying to future transactions

CREATE TABLE IF NOT EXISTS chatbot_corrections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  correction_type TEXT NOT NULL CHECK (correction_type IN ('category', 'merchant_name', 'subscription', 'amount', 'other')),
  original_value TEXT,
  corrected_value TEXT NOT NULL,
  transaction_id UUID,  -- nullable: links to specific bank_transaction if applicable
  merchant_pattern TEXT,  -- normalised pattern for applying to future transactions
  subscription_id UUID,  -- nullable: links to specific subscription if applicable
  context TEXT,  -- brief description of what was corrected
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: users can only see their own corrections
ALTER TABLE chatbot_corrections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own corrections" ON chatbot_corrections
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own corrections" ON chatbot_corrections
  FOR SELECT USING (auth.uid() = user_id);

-- Index for analytics queries
CREATE INDEX IF NOT EXISTS chatbot_corrections_user_id_idx ON chatbot_corrections (user_id);
CREATE INDEX IF NOT EXISTS chatbot_corrections_merchant_pattern_idx ON chatbot_corrections (merchant_pattern) WHERE merchant_pattern IS NOT NULL;
CREATE INDEX IF NOT EXISTS chatbot_corrections_correction_type_idx ON chatbot_corrections (correction_type);
