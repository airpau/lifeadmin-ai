-- Bank connections table
CREATE TABLE IF NOT EXISTS bank_connections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL,
  provider_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  account_ids TEXT[], -- array of connected account IDs
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'revoked')),
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bank_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own bank connections" ON bank_connections
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Bank transactions table
CREATE TABLE IF NOT EXISTS bank_transactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  connection_id UUID REFERENCES bank_connections(id) ON DELETE CASCADE NOT NULL,
  transaction_id TEXT NOT NULL, -- TrueLayer transaction ID
  account_id TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL, -- positive = credit, negative = debit
  currency TEXT DEFAULT 'GBP',
  description TEXT,
  merchant_name TEXT,
  category TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurring_group TEXT, -- merchant name normalised for grouping
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, transaction_id)
);

ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own transactions" ON bank_transactions
  USING (auth.uid() = user_id);

-- Index for recurring detection queries
CREATE INDEX idx_bank_transactions_user_merchant ON bank_transactions(user_id, merchant_name);
CREATE INDEX idx_bank_transactions_user_timestamp ON bank_transactions(user_id, timestamp DESC);
