-- Single-flight claim for finishing a Hosted Pages authorisation.
--
-- The redirect callback and the abandonment poller can both finish the
-- same journey, and the callback itself has been observed running twice
-- for one authorisation. Each finish fetches /accounts and fires a
-- background sync, so a duplicate doubles every call made against a
-- consent that is seconds old.
--
-- callback_claimed_at is taken with a conditional UPDATE in
-- src/lib/yapily/callback-claim.ts so only one caller wins. It is
-- deliberately a timestamp rather than a new status value: a claim that
-- is never released (a crashed callback) simply goes stale, and the
-- existing status CHECK constraint is left untouched.
--
-- Strictly additive.

alter table public.yapily_pending_consent_requests
  add column if not exists callback_claimed_at timestamptz;

comment on column public.yapily_pending_consent_requests.callback_claimed_at is
  'Set by whichever route (callback or abandonment poller) is finishing this authorisation. Stale after 2 minutes. See src/lib/yapily/callback-claim.ts.';
