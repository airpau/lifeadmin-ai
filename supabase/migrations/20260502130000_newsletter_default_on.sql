-- Newsletter audience: flip from opt-IN to opt-OUT.
--
-- Founder decision (2026-05-02): the weekly newsletter goes to every
-- confirmed Paybacker user by default. Users who don't want it use
-- the in-dashboard toggle or the one-click footer link to opt out.
--
-- Lawful basis (PECR reg. 22(3) soft opt-in):
--   1. Recipient gave email during sale negotiation (signup) — ✓
--   2. Marketing relates to similar products / services (UK consumer
--      rights education + Paybacker product updates — directly
--      relevant to the service they signed up for) — ✓
--   3. One-click unsubscribe in every send — ✓ (List-Unsubscribe
--      header + tokenised footer link, plus dashboard toggle)
--
-- Strictly additive: replaces the view, doesn't drop any column.
-- Existing opt-outs (anyone with newsletter_unsubscribed_at set) are
-- naturally preserved by the new gate.

-- 1. Make sure every confirmed user has an unsubscribe token. The
--    20260502120000 migration backfilled tokens for all profiles, but
--    we re-run defensively so any rows created in the gap (or any
--    rows that NULLed the token for some reason) get a fresh one.
UPDATE profiles
SET newsletter_unsub_token = encode(gen_random_bytes(18), 'base64')
WHERE newsletter_unsub_token IS NULL;

-- 2. Replace the audience view. Drops the
--    `marketing_opt_in = TRUE` gate. Keeps the safety filters
--    (email confirmed, account not deleted, not unsubscribed).
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
  p.newsletter_unsubscribed_at IS NULL
  AND u.email_confirmed_at IS NOT NULL
  AND u.deleted_at IS NULL;

COMMENT ON VIEW newsletter_audience IS
  'Opt-OUT audience for the weekly Thu-11:00 newsletter cron. Every '
  'confirmed Paybacker user is in unless they explicitly unsubscribed '
  '(via in-dashboard toggle or RFC 8058 one-click footer link). '
  'PECR soft opt-in basis: signup gave email during sale negotiation; '
  'newsletter is similar-product marketing; opt-out in every send.';
