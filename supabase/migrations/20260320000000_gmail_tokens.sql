-- Gmail OAuth tokens table
CREATE TABLE gmail_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expiry TIMESTAMPTZ,
  scopes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

ALTER TABLE gmail_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own gmail tokens"
  ON gmail_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage own gmail tokens"
  ON gmail_tokens FOR ALL
  USING (auth.uid() = user_id);

CREATE INDEX idx_gmail_tokens_user ON gmail_tokens(user_id);

CREATE TRIGGER update_gmail_tokens_updated_at
  BEFORE UPDATE ON gmail_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
