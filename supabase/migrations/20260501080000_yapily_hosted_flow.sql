-- ─────────────────────────────────────────────────────────────────────
-- Yapily Hosted Pages flow + fallback polling + capability gating
-- 2026-05-01 — Build review prep for Migle / Monday call
--
-- Adds the columns needed for:
--   P0-1  Hosted Pages flow: hosted_consent_id
--   P0-3  3-min fallback polling: consent_status, pending_started_at,
--         last_polled_at, poll_attempts
--   P0-4  Per-institution capability check + single-use semantics:
--         institution_features (text[]),
--         scheduled_payments_consumed_at, periodic_payments_consumed_at,
--         direct_debits_consumed_at
--
-- Strict additive: no DROPs, no destructive ALTERs. Idempotent via
-- "ADD COLUMN IF NOT EXISTS" so re-running this migration is safe.
-- ─────────────────────────────────────────────────────────────────────

-- P0-1 — Hosted Pages flow
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS hosted_consent_id TEXT;
COMMENT ON COLUMN bank_connections.hosted_consent_id IS
  'Yapily-issued ID returned by POST /hosted/consent-requests. Used by '
  'the fallback poll cron to query GET /hosted/consent-requests/{id} '
  'when no redirect callback arrives within 3 minutes.';

-- P0-3 — Fallback polling state
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS consent_status TEXT;
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS pending_started_at TIMESTAMPTZ;
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS last_polled_at TIMESTAMPTZ;
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS poll_attempts INTEGER DEFAULT 0;

COMMENT ON COLUMN bank_connections.consent_status IS
  'Hosted-flow lifecycle status. NULL or "pending" while the user is on '
  'the Yapily hosted page; AUTHORIZED/REJECTED/REVOKED/FAILED/EXPIRED '
  'are terminal and stop the poller.';
COMMENT ON COLUMN bank_connections.pending_started_at IS
  'Set when the hosted consent request is created. The poll cron only '
  'considers rows where pending_started_at < now() - interval ''3 min''.';
COMMENT ON COLUMN bank_connections.last_polled_at IS
  'Last time the poll cron called GET /hosted/consent-requests/{id}. '
  'Used together with poll_attempts to compute exponential backoff.';
COMMENT ON COLUMN bank_connections.poll_attempts IS
  'Incremented each poll while consent_status is intermediate. Backoff '
  'interval is min(60s * 2^poll_attempts, 600s).';

-- Index used by the poll cron to find candidates fast (T4)
CREATE INDEX IF NOT EXISTS idx_bank_connections_pending_consent
  ON bank_connections (pending_started_at)
  WHERE consent_status = 'pending';

-- P0-4 — Per-institution feature cache
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS institution_features TEXT[];
COMMENT ON COLUMN bank_connections.institution_features IS
  'Snapshot of institution.features taken at consent time. The '
  'capability gate in src/lib/yapily/upcoming.ts checks this before '
  'invoking scheduled-payments / periodic-payments / direct-debits, so '
  'we never call an unsupported endpoint on the institution''s behalf.';

-- P0-4 — Single-use endpoint tracking
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS scheduled_payments_consumed_at TIMESTAMPTZ;
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS periodic_payments_consumed_at TIMESTAMPTZ;
ALTER TABLE bank_connections ADD COLUMN IF NOT EXISTS direct_debits_consumed_at TIMESTAMPTZ;

COMMENT ON COLUMN bank_connections.scheduled_payments_consumed_at IS
  'Timestamp the scheduled-payments endpoint was first invoked for '
  'this consent. Yapily treats those endpoints as single-use per '
  'consent — a non-NULL value means we will not call again until the '
  'consent is renewed.';
COMMENT ON COLUMN bank_connections.periodic_payments_consumed_at IS
  'Single-use tracker for the periodic-payments endpoint (see '
  'scheduled_payments_consumed_at).';
COMMENT ON COLUMN bank_connections.direct_debits_consumed_at IS
  'Single-use tracker for the direct-debits endpoint (see '
  'scheduled_payments_consumed_at).';
