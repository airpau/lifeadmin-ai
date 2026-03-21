CREATE TABLE IF NOT EXISTS usage_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  action TEXT NOT NULL,
  year_month TEXT NOT NULL, -- format: YYYY-MM
  count INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, action, year_month)
);

ALTER TABLE usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own usage" ON usage_logs FOR SELECT USING (auth.uid() = user_id);

-- Atomic increment function (upsert)
CREATE OR REPLACE FUNCTION increment_usage(p_user_id UUID, p_action TEXT, p_year_month TEXT)
RETURNS void AS $$
BEGIN
  INSERT INTO usage_logs (user_id, action, year_month, count)
  VALUES (p_user_id, p_action, p_year_month, 1)
  ON CONFLICT (user_id, action, year_month)
  DO UPDATE SET count = usage_logs.count + 1, updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
