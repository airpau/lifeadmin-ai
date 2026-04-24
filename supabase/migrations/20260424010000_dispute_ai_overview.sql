-- Cached AI overview for the dispute detail page.
--
-- The dispute timeline gets unreadable fast — by message 4 or 5 the
-- user has no quick way to see "where am I, what should I do next?".
-- We cache a small Haiku-generated overview keyed on the
-- correspondence count so we don\'t re-run on every page load, but
-- naturally invalidate when a new message lands.

ALTER TABLE public.disputes
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_latest_update text,
  ADD COLUMN IF NOT EXISTS ai_next_action text,
  ADD COLUMN IF NOT EXISTS ai_suggested_steps jsonb,
  ADD COLUMN IF NOT EXISTS ai_summary_correspondence_count integer,
  ADD COLUMN IF NOT EXISTS ai_summary_at timestamptz;
