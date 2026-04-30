-- Resend inbound webhook (src/app/api/webhooks/resend-inbound/route.ts)
-- writes user replies to ticket_messages with a `sender_email` field
-- so we know which address the reply came from. The column was
-- referenced in the writer without ever being formally added —
-- every webhook insert was silently failing, and Paul's 2026-04-29
-- reply on TKT-0018 never reached the ticket as a result.
ALTER TABLE ticket_messages
  ADD COLUMN IF NOT EXISTS sender_email TEXT;
