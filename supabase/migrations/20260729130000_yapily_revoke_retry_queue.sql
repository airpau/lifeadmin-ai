-- Yapily build review, step 8 residual caveat.
--
-- Disconnecting calls DELETE /consents/{id} at Yapily BEFORE mutating our
-- own row, which is correct. But if that call failed (Yapily down, 5xx,
-- network), we logged it and carried on: the row flipped to 'revoked'
-- locally while the consent stayed LIVE at the bank, permanently, with no
-- retry. That is the compliance-relevant failure mode — the user believes
-- they have disconnected and they have not.
--
-- These columns turn that silent failure into a retry queue drained by the
-- daily consent-renewal cron, which escalates to the logs after 7 failed
-- attempts.
--
-- All additive and defaulted, so existing rows and inserts are unaffected.
--
-- Applied to production 2026-07-29.

alter table public.bank_connections
  add column if not exists pending_yapily_revoke boolean not null default false,
  add column if not exists revoke_attempts integer not null default 0,
  add column if not exists revoke_last_attempt_at timestamptz,
  add column if not exists revoke_last_error text;

comment on column public.bank_connections.pending_yapily_revoke is
  'True when DELETE /consents/{id} failed during disconnect. The consent may still be live at the bank; the consent-renewal cron retries these. Build review step 8.';
comment on column public.bank_connections.revoke_attempts is
  'Number of upstream revoke attempts made for this connection.';
comment on column public.bank_connections.revoke_last_attempt_at is
  'When the most recent upstream revoke was attempted.';
comment on column public.bank_connections.revoke_last_error is
  'Error message from the most recent failed upstream revoke, including the Yapily tracingId.';

-- Partial index: the retry sweep only ever looks at the failed rows, which
-- should be a tiny fraction of the table.
create index if not exists bank_connections_pending_revoke_idx
  on public.bank_connections (revoke_last_attempt_at)
  where pending_yapily_revoke = true;
