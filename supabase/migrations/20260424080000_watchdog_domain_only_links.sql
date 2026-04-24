-- Allow dispute_watchdog_links with no thread_id, so the "I've sent it"
-- cancellation flow can register a link anchored purely on sender_domain.
--
-- Context: when a user sends a cancellation letter via mailto: in their
-- native email client, the message ID and thread ID live in their Gmail
-- account and never cross our OAuth boundary (we're gmail.readonly).
-- We still want Watchdog to notice the provider's reply, which the
-- domain-scan path already supports — but the table enforced thread_id
-- NOT NULL, blocking domain-only links.
--
-- Additive change: relax NOT NULL. Existing thread-scoped links are
-- unaffected; new domain-only rows just leave thread_id NULL and the
-- sync-runner skips the thread fetch (see src/lib/dispute-sync/
-- sync-runner.ts — guards the fetchNewMessages call on link.thread_id).

ALTER TABLE public.dispute_watchdog_links
  ALTER COLUMN thread_id DROP NOT NULL;
