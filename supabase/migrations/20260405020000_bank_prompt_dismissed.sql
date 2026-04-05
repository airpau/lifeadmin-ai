-- Add bank_prompt_dismissed_at to profiles
-- Used to persist 30-day snooze on bank connection prompts/banners
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS bank_prompt_dismissed_at TIMESTAMPTZ;
