-- Loyalty system enhancements: streaks, badges, and points expiry
-- RULE 2: Only additive changes to user_points. No removals or renames.

-- Streak tracking columns on user_points
ALTER TABLE user_points ADD COLUMN IF NOT EXISTS current_streak INTEGER DEFAULT 0;
ALTER TABLE user_points ADD COLUMN IF NOT EXISTS longest_streak INTEGER DEFAULT 0;
ALTER TABLE user_points ADD COLUMN IF NOT EXISTS last_active_month TEXT;
ALTER TABLE user_points ADD COLUMN IF NOT EXISTS streak_bonus_claimed_month TEXT;

-- Points expiry tracking
ALTER TABLE user_points ADD COLUMN IF NOT EXISTS last_points_earned_at TIMESTAMPTZ;
ALTER TABLE user_points ADD COLUMN IF NOT EXISTS expiry_warning_sent BOOLEAN DEFAULT FALSE;

-- Badges table
CREATE TABLE IF NOT EXISTS user_badges (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  badge_id TEXT NOT NULL,
  badge_name TEXT NOT NULL,
  badge_description TEXT,
  badge_emoji TEXT,
  earned_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, badge_id)
);

ALTER TABLE user_badges ENABLE ROW LEVEL SECURITY;

-- Users can view their own badges
CREATE POLICY IF NOT EXISTS "Users view own badges"
  ON user_badges FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_badges_user ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge ON user_badges(badge_id);
