-- Share My Win — log every time a user shares a won dispute to social.
-- Used to surface aggregate share volume and (optionally) gate referral rewards.

CREATE TABLE IF NOT EXISTS dispute_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES disputes(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('twitter', 'whatsapp', 'linkedin', 'facebook', 'copy')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE dispute_shares ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users manage own shares" ON dispute_shares;
CREATE POLICY "Users manage own shares" ON dispute_shares FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_dispute_shares_user ON dispute_shares(user_id);
CREATE INDEX IF NOT EXISTS idx_dispute_shares_dispute ON dispute_shares(dispute_id);
