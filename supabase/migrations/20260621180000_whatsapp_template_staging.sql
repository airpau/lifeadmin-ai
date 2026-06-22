-- Zero-downtime WhatsApp template body changes (additive only).
--
-- A staged template change submits a NEW Twilio Content for Meta approval and
-- parks its SID in these pending_* columns WITHOUT touching the live, approved
-- `sid` / `approval_status`. The dispatch path keeps sending via the live SID
-- (no pause). The daily whatsapp-template-status cron polls pending_sid and,
-- once Meta approves it, promotes it (sid = pending_sid) and clears pending_*.
-- A rejected staged change leaves the live template completely untouched.

ALTER TABLE public.whatsapp_template_sids
  ADD COLUMN IF NOT EXISTS pending_sid          TEXT,
  ADD COLUMN IF NOT EXISTS pending_status       TEXT,        -- pending | rejected (cleared on promote)
  ADD COLUMN IF NOT EXISTS pending_submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS pending_body         TEXT;

CREATE INDEX IF NOT EXISTS idx_wts_pending
  ON public.whatsapp_template_sids (pending_status)
  WHERE pending_status = 'pending';
