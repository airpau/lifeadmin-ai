-- 20260821120000_yapily_stagger_and_consent_reconfirmation.sql
--
-- Yapily pre-launch review (Migle Ivanauskaite, 20 Aug 2026).
--
-- Three things came out of that call that need schema support:
--
--   1. STAGGERED REFRESH. The 4-hourly bank refresh currently fans out
--      over every connection at fixed clock times, so all users and all
--      of a single user's banks hit Yapily in one burst. Yapily's limit
--      is 30 req/sec, and simultaneous calls on the SAME consent token
--      also produce spurious 400s and can trip consent expiry. Each
--      connection now carries its own offset within the 4-hour cycle
--      and its own next_sync_at, so a user with three banks refreshes
--      roughly 75 minutes apart, spread across the day.
--
--   2. 90-DAY RECONFIRMATION. UK AIS consents must be reconfirmed every
--      90 days (FCA PS21/19). Yapily's POST /consents/{id}/extend
--      returns lastConfirmedAt + reconfirmBy — the authoritative dates.
--      We were computing `now + 90d` locally and never reading Yapily's
--      answer back, so the two copies drifted.
--
--   3. UNSUPPORTED ENDPOINTS. direct-debits / periodic-payments /
--      scheduled-payments are once-per-consent on UK banks, and many
--      banks don't implement them at all (424 / 501). We need somewhere
--      to record "this bank does not do this" so we stop asking, and
--      somewhere to keep the payload we DID get, since we only get one
--      shot at it per consent.
--
-- Strictly additive: no DROP, no column removal, no destructive ALTER.

-- ─────────────────────────────────────────────────────────────────────
-- 1. bank_connections — new columns
-- ─────────────────────────────────────────────────────────────────────

ALTER TABLE bank_connections
  -- Position of this connection within the 4-hour refresh cycle, in
  -- minutes (0-239). Stable for the life of the connection so a given
  -- bank always refreshes at roughly the same times of day.
  ADD COLUMN IF NOT EXISTS sync_offset_minutes SMALLINT,
  -- When this connection is next due a refresh. The cron selects on
  -- this rather than processing every row on every run.
  ADD COLUMN IF NOT EXISTS next_sync_at TIMESTAMPTZ,
  -- Guards against two concurrent runs picking up the same connection
  -- and issuing simultaneous calls on one consent token.
  ADD COLUMN IF NOT EXISTS sync_claimed_at TIMESTAMPTZ,
  -- UK 90-day reconfirmation, mirrored from the Yapily Consent object.
  ADD COLUMN IF NOT EXISTS consent_last_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS consent_reconfirm_by TIMESTAMPTZ,
  -- Yapily feature names this bank returned 424/501 for. Permanent for
  -- the life of the consent; cleared on re-authorisation.
  ADD COLUMN IF NOT EXISTS unsupported_features TEXT[] NOT NULL DEFAULT '{}'::text[],
  -- The featureScope Yapily actually GRANTED on this consent. We no
  -- longer send a featureScope on the request (see the auth route), so
  -- this is the only reliable record of what the consent covers.
  ADD COLUMN IF NOT EXISTS consent_feature_scope TEXT[];

COMMENT ON COLUMN bank_connections.sync_offset_minutes IS
  'Minute offset (0-239) within the 4-hour refresh cycle. Staggers Yapily calls so a users banks do not all fire at once.';
COMMENT ON COLUMN bank_connections.next_sync_at IS
  'When this connection is next due an automatic refresh. Advanced by the sync interval on every completed run.';
COMMENT ON COLUMN bank_connections.sync_claimed_at IS
  'Set when a cron run claims this connection; cleared on completion. Prevents concurrent calls on one consent token.';
COMMENT ON COLUMN bank_connections.consent_reconfirm_by IS
  'Yapily reconfirmBy: deadline for the next UK 90-day reconfirmation. Authoritative — prefer over locally computed expiry.';
COMMENT ON COLUMN bank_connections.unsupported_features IS
  'Yapily feature names this institution returned 424/501 for. Do not call the matching endpoint again on this consent.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. Backfill the stagger for existing connections
-- ─────────────────────────────────────────────────────────────────────
--
-- Two goals at once:
--   • Spread a single user's connections ~75 minutes apart, which is
--     inside Migle's "at least an hour between calls for different bank
--     connections" guidance.
--   • Give different users different starting points, derived from the
--     user_id hash, so we don't create a new synchronised burst where
--     every user's first connection fires at the same minute.
--
-- The `& 2147483647` masks the sign bit: bit(32)::bigint is signed, and
-- a negative value would make the modulo negative and violate the
-- 0-239 range the scheduler assumes.

WITH ranked AS (
  SELECT
    id,
    ((('x' || substr(md5(user_id::text), 1, 8))::bit(32)::bigint & 2147483647) % 240) AS user_base,
    (ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at, id) - 1) AS conn_index
  FROM bank_connections
)
UPDATE bank_connections bc
SET sync_offset_minutes = ((ranked.user_base + ranked.conn_index * 75) % 240)::smallint
FROM ranked
WHERE ranked.id = bc.id
  AND bc.sync_offset_minutes IS NULL;

-- First due time: spread across the next 4 hours by the offset, then the
-- cron advances each connection by the sync interval from there. Doing
-- it this way means the very first run after deploy is already
-- staggered rather than a single catch-up burst.
UPDATE bank_connections
SET next_sync_at = now() + ((COALESCE(sync_offset_minutes, 0) % 240) || ' minutes')::interval
WHERE next_sync_at IS NULL;

-- Partial index: the scheduler only ever asks for live, due rows.
CREATE INDEX IF NOT EXISTS idx_bank_connections_next_sync_at
  ON bank_connections (next_sync_at)
  WHERE deleted_at IS NULL AND archived_at IS NULL;

-- ─────────────────────────────────────────────────────────────────────
-- 3. upcoming_endpoint_snapshots
-- ─────────────────────────────────────────────────────────────────────
--
-- Why this table exists:
--
-- Yapily's data-restrictions doc is explicit that for UK institutions
-- /direct-debits, /periodic-payments, /scheduled-payments (and
-- /beneficiaries, /identity) "can be accessed once and for a short
-- duration after the consent has been authorised. To access these
-- endpoints again or after the valid period, you will have to obtain a
-- new consent or reauthorise the existing consent."
--
-- So the nightly re-poll we were doing could not have been working past
-- day one — it was generating failed calls, not data. But it also means
-- that once we correctly stop re-polling, the single successful payload
-- is the ONLY copy we will ever have until the user reconnects. Losing
-- it to the daily upcoming_payments prune would make the forward view
-- worse, not better.
--
-- This table keeps the normalised rows from that one successful fetch,
-- so the daily cron can re-project future occurrences from the stored
-- cadence without touching Yapily again.

CREATE TABLE IF NOT EXISTS upcoming_endpoint_snapshots (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  connection_id UUID NOT NULL,
  account_id    TEXT NOT NULL,
  -- 'scheduled-payments' | 'periodic-payments' | 'direct-debits'
  endpoint      TEXT NOT NULL,
  -- The Yapily consent id this snapshot was captured under. A new
  -- consent id means a fresh authorisation and a fresh capture.
  consent_id    TEXT,
  -- Normalised UpcomingRow[] exactly as the wrappers returned it.
  rows          JSONB NOT NULL DEFAULT '[]'::jsonb,
  fetched_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_upcoming_endpoint_snapshot
  ON upcoming_endpoint_snapshots (connection_id, account_id, endpoint);

CREATE INDEX IF NOT EXISTS idx_upcoming_endpoint_snapshots_user
  ON upcoming_endpoint_snapshots (user_id);

ALTER TABLE upcoming_endpoint_snapshots ENABLE ROW LEVEL SECURITY;

-- Owner-read only. All writes go through the service role in the cron,
-- which bypasses RLS, so there is deliberately no INSERT/UPDATE policy.
DROP POLICY IF EXISTS "Users read own upcoming snapshots" ON upcoming_endpoint_snapshots;
CREATE POLICY "Users read own upcoming snapshots"
  ON upcoming_endpoint_snapshots
  FOR SELECT
  USING (auth.uid() = user_id);
