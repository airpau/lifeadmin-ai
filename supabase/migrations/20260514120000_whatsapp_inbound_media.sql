-- WhatsApp Inbound Media — Phase 2
--
-- Both the Twilio and Meta parsers can now classify inbound messages into
-- text / interactive / media / location / unsupported (see InboundMessageKind
-- in src/lib/whatsapp/types.ts). For media inbounds we want to persist the
-- provider-reported URL/ID + MIME type so a future OCR/bill-parsing worker
-- can dereference the asset without re-reading the webhook payload.
--
-- Additive only — no DROP, no column rename. Both columns are nullable so
-- the existing rows (all text, all without media metadata) continue to read
-- back as NULL and downstream code already handles that.

ALTER TABLE whatsapp_message_log
  ADD COLUMN IF NOT EXISTS media_url TEXT;

ALTER TABLE whatsapp_message_log
  ADD COLUMN IF NOT EXISTS media_mime_type TEXT;

-- Audit index — we expect the future OCR worker to poll for unprocessed
-- media. Partial index keeps it cheap; rows with media_url IS NOT NULL are
-- a tiny fraction of the log.
CREATE INDEX IF NOT EXISTS idx_whatsapp_log_pending_media
  ON whatsapp_message_log(created_at DESC)
  WHERE media_url IS NOT NULL;
