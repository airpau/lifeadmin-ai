-- WhatsApp Pocket Agent — conversation memory + pending-action confirmation flow.
--
-- Strictly additive per CLAUDE.md. Two JSONB columns on whatsapp_sessions:
--
-- 1. conversation_history JSONB — rolling window of the last ~10 turns as a
--    JSON array of {role, content, ts} objects. This is a faster, agent-
--    private read than reconstructing history from whatsapp_message_log
--    every turn (the log includes outbound chunks, template renders, system
--    fallbacks, and media stubs — none of which belong in the agent prompt).
--
--    Existing user-bot.ts continues to read from whatsapp_message_log; the
--    new pocket-agent wrapper writes here so a future refactor can switch
--    sources without breaking the live bot.
--
-- 2. pending_action JSONB — when a destructive tool is queued behind a
--    YES/NO confirmation, the wrapper stashes the parsed intent here. The
--    next inbound from the user is matched against this row: YES executes
--    the action, NO drops it, anything else clears the slot and routes the
--    new message to the agent.
--
--    Shape:
--      {
--        "kind": "send_dispute_letter" | "chase_supplier" | …,
--        "args": { ... arbitrary action-specific args ... },
--        "summary": "Send the EE complaint letter (cites CRA 2015 s.49)",
--        "queued_at": "2026-05-28T…Z",
--        "expires_at": "2026-05-28T…Z"
--      }
--
--    Wrapper clears the slot after 30 minutes of inactivity (matches the
--    conversation-history TTL the user prompt specifies).

ALTER TABLE whatsapp_sessions
  ADD COLUMN IF NOT EXISTS conversation_history JSONB,
  ADD COLUMN IF NOT EXISTS pending_action JSONB,
  ADD COLUMN IF NOT EXISTS conversation_updated_at TIMESTAMPTZ;

-- Optional helper index for ops queries ("how many active pending_action
-- slots are there?") — partial so it stays tiny.
CREATE INDEX IF NOT EXISTS idx_whatsapp_sessions_pending_action
  ON whatsapp_sessions(whatsapp_phone)
  WHERE pending_action IS NOT NULL;
