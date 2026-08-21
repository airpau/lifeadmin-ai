-- Daily claim lock for the automated social post cron.
--
-- Why: /api/cron/social-post wrote its content_drafts row AFTER publishing to
-- Facebook, Instagram and X. Any run that published and then hit the 120s
-- maxDuration left no record behind, so the next invocation saw zero rows for
-- today and published the same content again. Live duplicate pairs exist on
-- 2026-08-21 (13:17 and 13:39), 2026-06-22 and 2026-04-24.
--
-- Fix: the cron now claims the day BEFORE doing any work, by inserting a row
-- carrying a unique dedup_key. A second concurrent invocation gets 23505 and
-- exits. The row is settled to status='posted' on completion, and deleted only
-- on paths that published nothing.
--
-- Strictly additive: two nullable columns, one widened allowed-values list, and
-- one partial unique index. No column or row is removed or rewritten, and
-- existing rows keep dedup_key NULL, which the partial index ignores.

ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS dedup_key TEXT;
ALTER TABLE content_drafts ADD COLUMN IF NOT EXISTS post_date DATE;

-- A claim needs a state meaning "in flight, not yet published". Reusing
-- 'pending' would be wrong: that value is the founder approval queue read by
-- list_pending_content_drafts and the Telegram admin listing, and a transient
-- machine claim must not appear there. Widening the list is additive, since
-- every previously valid value stays valid.
ALTER TABLE content_drafts DROP CONSTRAINT IF EXISTS content_drafts_status_check;
ALTER TABLE content_drafts ADD CONSTRAINT content_drafts_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text,
    'approved'::text,
    'rejected'::text,
    'posted'::text,
    'failed'::text,
    'publishing'::text
  ]));

-- Partial index so the constraint applies only to rows that opt in by setting
-- dedup_key. Every manual draft and every historical row is unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS content_drafts_dedup_key_unique
  ON content_drafts (dedup_key)
  WHERE dedup_key IS NOT NULL;

-- Supports the admin view of "what went out on day X".
CREATE INDEX IF NOT EXISTS content_drafts_post_date_idx
  ON content_drafts (post_date DESC)
  WHERE post_date IS NOT NULL;

COMMENT ON COLUMN content_drafts.dedup_key IS
  'Idempotency key for automated publishers. Claimed before publishing, unique where not null. e.g. social-post:2026-08-21';
COMMENT ON COLUMN content_drafts.post_date IS
  'UTC date the automated post was claimed for. Matches the cron schedule, not the local date.';
