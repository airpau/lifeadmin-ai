-- Capture the provider's ready-to-use deep-link URL at import time so
-- the dispute UI can offer "Open in Outlook" (and eventually "Open in
-- Gmail" if we migrate to Gmail's rfc822 URLs).
--
-- Microsoft Graph's /me/messages resource exposes `webLink` — a pre-
-- signed OWA URL that opens the message in the user's Outlook Web.
-- We were dropping it on import because the $select clause didn't ask
-- for it; now we'll capture it and store it alongside the existing
-- supplier_message_id.
--
-- Gmail API doesn't have an equivalent webLink field — Gmail deep-
-- links are constructed client-side from the message id. So this
-- column stays NULL for Gmail-imported rows, and the UI falls back
-- to the existing Gmail URL format when supplier_web_link IS NULL.

ALTER TABLE public.correspondence
  ADD COLUMN IF NOT EXISTS supplier_web_link text;
