-- Store the user's IANA timezone (e.g. 'Europe/London', 'America/New_York').
-- Used by Telegram notification crons to enforce per-user quiet hours.
-- NULL means unknown — crons fall back to Europe/London.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS timezone TEXT;
