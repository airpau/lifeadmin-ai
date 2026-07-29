-- Yapily build review (Migle Ivanauskaite, Jul 2026)
--
-- Step 3: persist failed consent redirects instead of console-only logging.
--         Previously a user cancelling at their bank left the pending row
--         at 'pending' forever with no queryable record of the failure.
--
-- Step 4: give the fallback poller real exponential backoff state, so
--         GET /hosted/consent-requests/{id} is retried on a growing
--         interval rather than once per cron tick.
--
-- All columns are additive and nullable/defaulted, so existing rows and
-- existing INSERT statements keep working untouched.
--
-- Applied to production 2026-07-29.

alter table public.yapily_pending_consent_requests
  add column if not exists error_detail jsonb,
  add column if not exists poll_attempts integer not null default 0,
  add column if not exists next_poll_at timestamptz;

comment on column public.yapily_pending_consent_requests.error_detail is
  'Full redirect query string captured when Yapily/the bank returns an error param. Build review step 3.';
comment on column public.yapily_pending_consent_requests.poll_attempts is
  'Number of fallback polls performed against GET /hosted/consent-requests/{id}. Drives exponential backoff. Build review step 4.';
comment on column public.yapily_pending_consent_requests.next_poll_at is
  'Earliest time the fallback poller may poll this row again (exponential backoff). Null = poll as soon as the 3-minute floor passes.';

-- Partial index so the poller's hot query stays cheap as the table grows.
-- The poller runs every minute, so this one matters.
create index if not exists yapily_pending_consent_requests_poll_idx
  on public.yapily_pending_consent_requests (created_at, next_poll_at)
  where status = 'pending';
