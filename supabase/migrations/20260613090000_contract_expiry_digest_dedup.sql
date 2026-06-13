-- Renewal-alert digest dedup.
--
-- The contract-expiry-alerts cron used to send ONE WhatsApp/Telegram/email
-- per expiring contract, and re-alerted at 30d/14d/7d thresholds (the
-- alert_30d_sent_at / alert_14d_sent_at / alert_7d_sent_at columns). That
-- produced back-to-back WhatsApp messages — one per subscription — at 09:00.
--
-- The cron now batches all of a user's due renewals into a SINGLE digest and
-- gives each contract exactly ONE value-tiered warning (30d for >=£50/mo,
-- 7d for £10-50/mo, 3d for <£10/mo). This column records that the contract
-- has already been folded into a sent digest so it is not alerted again.
--
-- Strictly additive — the legacy alert_*_sent_at columns are left intact for
-- historical rows and are simply no longer written by the new code path.

ALTER TABLE contract_expiry_alerts
  ADD COLUMN IF NOT EXISTS digest_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN contract_expiry_alerts.digest_sent_at IS
  'When this contract was included in a batched renewal digest. One alert per contract, timed by value tier. NULL = not yet alerted.';
