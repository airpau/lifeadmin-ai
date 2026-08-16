-- Retire the legacy TrueLayer Supabase Edge Function `bank-sync` pg_cron jobs.
--
-- APPLIED TO PRODUCTION 2026-08-16 17:42 UTC (via Supabase MCP apply_migration,
-- migration name 20260816180000_retire_legacy_truelayer_bank_sync_cron).
--
-- WHY: the edge function (`supabase/functions/bank-sync`, slug bank-sync,
-- version 2, still ACTIVE) is a TrueLayer-era implementation. For a Yapily row
-- `token_expires_at` is NULL, so `new Date(null) < new Date()` evaluates true
-- (epoch 1970), and `refresh_token` is NULL, so it takes the branch that writes
-- `bank_connections.status = 'token_expired'` — a value no code in src/ ever
-- writes. Its audit call `record_bank_sync(p_status => 'token_expired')`
-- violates `bank_sync_log_status_check` (success|failed|skipped), so
-- supabase-js returns an error object the function ignores: the status flip
-- lands with NO log row and no alert.
--
-- Proven on connection f1776dbb-125f-4915-9261-39289068a622 (HSBC Business,
-- user aireypaul@googlemail.com): function_edge_logs shows
-- `POST | 200 | /functions/v1/bank-sync?trigger=auto` at 2026-08-16T03:00:06.609Z
-- and the row's updated_at was 2026-08-16 03:00:06.578Z — a 31 ms match. No
-- other code path could have written updated_at at that moment (the row's
-- account_identifications_hashes were already complete, so the Vercel cron's
-- hash-backfill branch did not run, and every other Vercel-cron branch that
-- writes updated_at was ruled out).
--
-- SAFE: all three provider='truelayer' rows are status='revoked' AND
-- deleted_at IS NOT NULL. The `bank_connections_due_sync` view requires
-- status='active', so the function can never sync anything — it can only
-- corrupt Yapily rows. All live Yapily syncing is done by the Vercel cron
-- /api/cron/bank-sync (vercel.json: "0 3,9,13,17,20 * * *").
--
-- Additive/reversible: unschedules jobs only, drops nothing. The edge function
-- itself is left deployed but unreferenced. To restore, re-run the original
-- cron.schedule() calls for functions/v1/bank-sync?trigger=auto (0 3,9,15,21 * * *)
-- and ?trigger=month_end (0 1 1 * *).

DO $$
DECLARE
  j record;
BEGIN
  FOR j IN
    SELECT jobid FROM cron.job WHERE command LIKE '%functions/v1/bank-sync%'
  LOOP
    PERFORM cron.unschedule(j.jobid);
    RAISE NOTICE 'Unscheduled legacy bank-sync pg_cron job %', j.jobid;
  END LOOP;
END $$;

-- Repair the rows the legacy job corrupted. 'active' is the status our own sync
-- code mandates for a generic (non-consent-expiry) 403 — see
-- src/app/api/cron/bank-sync/route.ts:427-431. 'token_expired' hid the
-- connection from /api/bank/sync-now, /api/cron/consent-renewal (which filters
-- status IN ('active','expiring_soon')) and the money-hub active-connection card.
UPDATE bank_connections
SET status = 'active', updated_at = now()
WHERE provider = 'yapily'
  AND status = 'token_expired'
  AND deleted_at IS NULL
  AND consent_token IS NOT NULL
  AND (consent_expires_at IS NULL OR consent_expires_at > now());
