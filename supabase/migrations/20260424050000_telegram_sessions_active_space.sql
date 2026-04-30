-- Active-Space scope for the Telegram bot.
--
-- The web Money Hub already lets users flip between Spaces (e.g.
-- "Business" vs "Personal" vs "Everything"). The bot needs a parallel
-- setting so that questions like "how am I doing this month?" answer
-- for the Space the user last switched to — matching what they see on
-- the dashboard.
--
-- Nullable = "use the user's default Space" (aka "Everything" unless
-- they've explicitly chosen otherwise via preferred_space_id on
-- profiles).
--
-- No FK to account_spaces: when a Space is deleted we want the bot
-- to silently fall back to default rather than orphan the column.
-- The accessors in src/lib/telegram/spaces.ts validate on read.

ALTER TABLE telegram_sessions
  ADD COLUMN IF NOT EXISTS active_space_id UUID NULL;
