-- Founding member programme: first 25 signups get Pro free for 30 days
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS founding_member BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS founding_member_expires TIMESTAMPTZ;
