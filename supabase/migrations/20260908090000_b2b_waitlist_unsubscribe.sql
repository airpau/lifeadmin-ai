-- B2B nurture: give every lead a tokenised one-click unsubscribe.
--
-- The /api/cron/b2b-nurture drip has no opt-out path at all, which is why
-- it could never safely be switched on. Marketing sends in this codebase go
-- through sendPaybackerEmail({ variant: 'marketing' }), which REFUSES to send
-- without a tokenised unsubscribeUrl (MissingUnsubscribeUrlError). These two
-- columns are what let the B2B funnel meet that bar, mirroring the shape
-- consumer_leads already uses (unsubscribe_token + unsubscribed_at).
--
-- Strictly additive: no drops, no column removals, no constraint changes.

ALTER TABLE b2b_waitlist
  ADD COLUMN IF NOT EXISTS unsubscribe_token UUID,
  ADD COLUMN IF NOT EXISTS unsubscribed_at TIMESTAMPTZ;

-- Backfill existing rows first, then attach the default, so the column can be
-- made NOT NULL without a window where an old row has a null token.
UPDATE b2b_waitlist
   SET unsubscribe_token = gen_random_uuid()
 WHERE unsubscribe_token IS NULL;

ALTER TABLE b2b_waitlist
  ALTER COLUMN unsubscribe_token SET DEFAULT gen_random_uuid();

ALTER TABLE b2b_waitlist
  ALTER COLUMN unsubscribe_token SET NOT NULL;

-- The unsubscribe endpoint looks a lead up by token alone, so it must be
-- unique and indexed.
CREATE UNIQUE INDEX IF NOT EXISTS b2b_waitlist_unsubscribe_token_idx
  ON b2b_waitlist (unsubscribe_token);

-- The nurture cron filters on this every run.
CREATE INDEX IF NOT EXISTS b2b_waitlist_unsubscribed_at_idx
  ON b2b_waitlist (unsubscribed_at)
  WHERE unsubscribed_at IS NULL;

COMMENT ON COLUMN b2b_waitlist.unsubscribe_token IS
  'Per-lead token for GET/POST /api/unsubscribe?kind=b2b_lead. Never expires.';
COMMENT ON COLUMN b2b_waitlist.unsubscribed_at IS
  'Set when the lead opts out. /api/cron/b2b-nurture skips any row where this is non-null.';
