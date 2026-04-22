-- Add missing trial tracking columns to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS trial_starts_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_expired_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS trial_converted_at TIMESTAMPTZ;

-- Backfill trial_starts_at for existing users who already have trial_ends_at set
UPDATE profiles
SET trial_starts_at = created_at
WHERE trial_ends_at IS NOT NULL
  AND trial_starts_at IS NULL;

-- Recreate handle_new_user to initialise a 7-day onboarding trial on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, trial_starts_at, trial_ends_at)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NOW(),
    NOW() + INTERVAL '7 days'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
