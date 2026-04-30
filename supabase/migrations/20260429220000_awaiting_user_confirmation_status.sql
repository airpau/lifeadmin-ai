-- Adds the 'awaiting_user_confirmation' value to support_tickets.status.
--
-- After Builder ships a code fix and the production deploy is verified, the
-- ticket should NOT be marked 'resolved' immediately — the user hasn't yet
-- had a chance to verify. Instead the ticket goes to this new status.
--
-- The user is then notified across every channel they have on file (email,
-- Telegram, WhatsApp if Pro, chatbot ticket_messages). Their reply is
-- classified positive/negative/unclear:
--   positive → status = 'resolved' (close)
--   negative → status = 'in_progress' (re-escalate to Builder, iter N+1)
--   unclear  → ask one clarifying question
--
-- ADDITIVE per CLAUDE.md rules: only widens the CHECK constraint value set,
-- no rows invalidated.

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN
    SELECT con.conname
    FROM pg_constraint con
    JOIN pg_class cl ON cl.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cl.relnamespace
    WHERE ns.nspname = 'public'
      AND cl.relname = 'support_tickets'
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%status%CHECK%'
  LOOP
    EXECUTE format('ALTER TABLE support_tickets DROP CONSTRAINT IF EXISTS %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE support_tickets
  ADD CONSTRAINT support_tickets_status_check
  CHECK (status IN (
    'open',
    'in_progress',
    'awaiting_reply',
    'awaiting_user_confirmation',
    'awaiting_response',
    'resolved',
    'closed',
    'dismissed'
  ));

COMMENT ON COLUMN support_tickets.status IS
'Ticket lifecycle. open=needs Riley; in_progress=Riley working / escalated to Builder;
awaiting_reply=Riley sent reply, waiting on user; awaiting_user_confirmation=Builder
shipped fix, waiting on user to verify; awaiting_response=dispute waiting on supplier;
resolved=fix confirmed; closed=user confirmed close; dismissed=spam/no-issue.';

INSERT INTO business_log (category, title, content, created_by, created_at)
SELECT
  'agent_governance',
  'Migration: awaiting_user_confirmation ticket status',
  'Added awaiting_user_confirmation to support_tickets.status. Builder Stage C now sets this instead of resolved. User reply on this status is classified positive/negative/unclear and routed accordingly. Re-escalation reuses builder-pickup with iteration N+1.',
  'migration:20260429220000_awaiting_user_confirmation_status',
  NOW()
WHERE NOT EXISTS (
  SELECT 1 FROM business_log
  WHERE created_by = 'migration:20260429220000_awaiting_user_confirmation_status'
);
