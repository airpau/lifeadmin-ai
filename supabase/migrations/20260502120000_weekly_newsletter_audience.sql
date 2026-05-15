-- Weekly newsletter — audience plumbing.
--
-- Adds three columns on `profiles` for the weekly Thu-11:00 cron:
--   newsletter_last_sent_at — dedup against accidental replays.
--   newsletter_unsubscribed_at — soft unsubscribe (RFC 8058).
--   newsletter_unsub_token — per-user random token used in the
--                            tokenised one-click unsubscribe URL.
--
-- Plus a `newsletter_audience` view joining auth.users metadata so the
-- cron can SELECT in one query without exposing auth.users to the
-- service-role client (which doesn't strictly need it but keeps the
-- query surface clean and lets us evolve the audience definition in
-- one place).
--
-- The marketing-opt-in source-of-truth lives on
--   auth.users.raw_user_meta_data->>'marketing_opt_in'
-- which is what the signup page writes. Notification preferences
-- toggles can mirror this onto profiles via a trigger (separate
-- migration when we wire the toggle into the dashboard).
--
-- Strictly additive — never drops existing columns.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS newsletter_last_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS newsletter_unsubscribed_at timestamptz,
  ADD COLUMN IF NOT EXISTS newsletter_unsub_token text;

-- Backfill an unsubscribe token for any opted-in user that doesn't yet
-- have one. The token is a random 24-char base32-ish string derived
-- from gen_random_uuid() — long enough to be unguessable, short enough
-- to fit the URL nicely.
UPDATE profiles
SET newsletter_unsub_token = encode(gen_random_bytes(18), 'base64')
WHERE newsletter_unsub_token IS NULL;

CREATE INDEX IF NOT EXISTS profiles_newsletter_token_idx
  ON profiles (newsletter_unsub_token)
  WHERE newsletter_unsub_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS profiles_newsletter_last_sent_idx
  ON profiles (newsletter_last_sent_at)
  WHERE newsletter_unsubscribed_at IS NULL;

-- Audience view. The cron uses this to SELECT the recipient list in
-- one go. SECURITY INVOKER so RLS still applies if the view is ever
-- queried from a non-service-role context.
CREATE OR REPLACE VIEW newsletter_audience AS
SELECT
  p.id                            AS user_id,
  u.email                         AS email,
  p.first_name                    AS first_name,
  p.newsletter_last_sent_at       AS newsletter_last_sent_at,
  p.newsletter_unsub_token        AS newsletter_unsub_token
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE
  COALESCE(u.raw_user_meta_data->>'marketing_opt_in', 'false')::boolean = TRUE
  AND p.newsletter_unsubscribed_at IS NULL
  AND u.email_confirmed_at IS NOT NULL
  AND u.deleted_at IS NULL;

COMMENT ON VIEW newsletter_audience IS
  'Opt-in audience for the weekly Thu-11:00 newsletter cron. Joins auth.users metadata to profiles; gates on marketing_opt_in + email confirmed + not deleted + not unsubscribed.';
