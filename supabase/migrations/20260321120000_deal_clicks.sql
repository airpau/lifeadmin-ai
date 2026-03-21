CREATE TABLE IF NOT EXISTS deal_clicks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  provider TEXT NOT NULL,
  category TEXT NOT NULL,
  deal_id TEXT NOT NULL,
  awin_mid TEXT,
  clicked_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE deal_clicks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own clicks" ON deal_clicks
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own clicks" ON deal_clicks
  FOR SELECT USING (auth.uid() = user_id);
