# Watchdog — Build Handoff Notes

Feature branch: `feature/watchdog-email-sync`
Drafted: 19 April 2026
Plan: `docs/DISPUTE_EMAIL_SYNC_PLAN.md` (approved)

---

## What's built in this branch

All foundation (backend) work is done. No UI yet. No deployment yet.

### Files added

```
supabase/migrations/20260420000000_dispute_email_sync.sql
src/lib/dispute-sync/types.ts
src/lib/dispute-sync/provider-domains.ts
src/lib/dispute-sync/fetchers.ts
src/lib/dispute-sync/imap-thread-fetcher.ts
src/lib/dispute-sync/matcher.ts
src/lib/dispute-sync/imap-matcher.ts
src/lib/dispute-sync/sync-runner.ts
src/app/api/disputes/[id]/suggest-threads/route.ts
src/app/api/disputes/[id]/link-email-thread/route.ts
src/app/api/disputes/[id]/sync-replies-now/route.ts
src/app/api/cron/dispute-reply-sync/route.ts
```

### Files modified

```
src/lib/plan-limits.ts  — adds disputeThreadLinks + watchdogSyncIntervalMinutes
                          to PLAN_LIMITS, plus checkWatchdogLinkLimit() and
                          getEffectiveTier() helpers
vercel.json             — registers the new */30 * * * * cron
docs/DISPUTE_EMAIL_SYNC_PLAN.md — approval stamp + amendment affordances
```

### Type check

`npx tsc --noEmit` reports only two errors and neither is on this branch:
- `.next/dev/types/validator.ts` — stale dev build artifact, re-generated on next build
- `src/app/api/cron/trial-expiry/route.ts` — pre-existing unrelated error

---

## What's NOT built (next session)

1. Dispute-detail UI card ("Link email thread" / "Sync now" / "Relink")
2. NotificationBell component + `/api/notifications/*` routes (unread count, mark-read, list)
3. "NEW REPLY" badge + unread-pulse on the disputes list
4. "Move this reply to a different dispute" button on auto-imported correspondence entries
5. Unit tests for matcher + fetchers (mocks for Gmail/Graph responses)
6. End-to-end test against Paul's real OneStream dispute in staging
7. Vercel preview deploy + prod cutover

---

## Review checklist before merging

- [ ] Run `npx tsc --noEmit` — no new errors vs. master baseline
- [ ] Apply migration on staging Supabase via MCP (`mcp__supabase__apply_migration`)
- [ ] Verify no destructive SQL — grep `DROP\|ALTER.*DROP` returns nothing from this migration
- [ ] Confirm new migration filename sorts AFTER `20260418000005_content_drafts_source_idea.sql` ✓
- [ ] `CRON_SECRET` env var exists in Vercel production ✓ (used by other crons)
- [ ] No new env vars required (Gmail / Outlook / Telegram secrets already set)

---

## How it works in 6 bullets

1. User has a dispute with OneStream. They tap "Find thread" in the new dispute-detail card (UI pending).
2. `GET /api/disputes/[id]/suggest-threads` calls the matcher, which hits Gmail/Graph/IMAP with a domain+keyword search and returns the top 3 likely threads.
3. User picks one. `POST /api/disputes/[id]/link-email-thread` writes a row to `dispute_email_threads` and does an initial sync.
4. Every 30 minutes the `dispute-reply-sync` cron iterates active links. For each, it calls `fetchNewMessages()` (since `last_synced_at`), dedupes on `supplier_message_id`, inserts each new message into `correspondence` as a `company_email` entry flagged `detected_from_email=true`.
5. For each new message: `record_dispute_reply()` bumps counters, a `user_notifications` row is created for the in-app bell, and a Telegram alert fires via `sendProactiveAlert()` (respects `telegram_alert_preferences.dispute_replies`, which defaults to TRUE).
6. Free tier has `watchdogSyncIntervalMinutes=null` → the cron skips them. They can hit `POST /api/disputes/[id]/sync-replies-now` to pull manually.

---

## Known sharp edges for UI session

- The link endpoint does an **initial full sync** on POST — this means the very first link call can take several seconds (it pulls the whole thread history). UI should show a spinner with "Importing history…" and route-level `maxDuration = 60`.
- When user picks a thread, pass the full candidate payload (connectionId, provider, threadId, subject, senderAddress) in the POST body. All those fields are returned by `/suggest-threads`.
- For "Move this reply" and "Relink thread" affordances: they need new endpoints that are NOT in this commit. Suggested shape:
  - `PATCH /api/disputes/[id]/correspondence/[entryId]` with body `{ move_to_dispute_id: string }`
  - `POST /api/disputes/[id]/link-email-thread` already behaves as upsert, so "Relink" is just: DELETE existing link → POST new one.

---

## Rollback plan

If Watchdog misbehaves in production, degrade gracefully without data loss:

1. Set every `dispute_email_threads.sync_enabled = false`
2. Remove the `dispute-reply-sync` entry from `vercel.json` and redeploy
3. The UI gracefully hides the "Linked thread" card when no active link exists
4. All imported correspondence entries remain in the user's timeline — nothing is lost

No migration rollback needed; the tables can stay empty.
