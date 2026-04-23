# Active Sessions — Last Updated 23 Apr 2026 18:00 UTC

## Latest: Business Monitor — 23 Apr 2026 (evening)
- 5 PRs merged to production today:
  - #202: fix(upcoming-payments): detect incoming scheduled/periodic/direct-debit from Yapily
  - #203: fix(money-hub): show loan receipts in income breakdown + total
  - #204: fix(money-hub): rename loan income label to 'Loan Credit' + collapse types
  - #205: fix(money-hub): capitalise every spending-category label
  - #194: fix(homepage): demo double-scaling, remove 14-day trial copy, make 'open full draft' work
- 7 new PRs opened today: #195–#201 (disputes UX, email layout, marketing copy, iPhone video fix, opportunity drawer, dashboard dedup, thread search)
- 30 open PRs in queue — review backlog building
- No urgent flags; Riley active
- Evening Telegram check-in sent to Paul

## Latest: Business Monitor — 22 Apr 2026 (evening)
- 5 PRs merged to production today:
  - #150: fix(watchdog): fail loudly on OAuth refresh failures + tighten price alerts
  - #149: feat(dashboard): Claude Design shell chrome — Phase 1 foundation
  - #148: fix(homepage): restore demos + competitor matrix lost in 10e4614
  - #146: fix(homepage): remove "Preview · Homepage v2" badge from production
  - #145: docs: Open Banking source-of-truth audit
- 3 new PRs opened today: #147 (bank dedup Faster Payments), #122 (email targeted savings alert), #120 (Codex P1/P2 bundle)
- 30 open PRs in queue — review backlog building
- Evening Telegram check-in sent to Paul

## Latest: Business Monitor — 20 Apr 2026 (evening)
- 4 PRs merged to production today:
  - #100: Homepage hero live saved-this-month figure (no more "coming soon")
  - #101: Google Sheets export tab live, parallelised dashboard overview
  - #103: Sheets Sync Now button + first-sync backfill
  - #104: Sheets DB query pagination + dedup by transaction_id (idempotent)
- 3 new PRs opened: #99 (email rate limit types), #102 (gmail scan guard), #105 (homepage redesign preview)
- 30 open PRs in queue — review backlog building
- Evening Telegram check-in sent to Paul



## Latest: Cowork Session — 11 Apr 2026
- Fixed Telegram bot (was dead — fire-and-forget root cause)
- Rewrote financial tools (get_expected_bills, get_upcoming_payments) with intelligent bank data cross-referencing
- Updated bot system prompt with financial intelligence rules
- Checked Yapily emails — KYC under Compliance review since 3 Apr, follow-up email drafted
- Full details: `shared-context/session-handoff-11apr2026.md`

## Current Session
- **Interface:** Cowork Desktop (Claude Opus 4.6)
- **Started:** 11 Apr 2026
- **Task:** Migrating agents to Claude Managed Agents platform
- **Status:** GitHub MCP removal complete for all 9 agents. Shared context updated.

## Completed This Session
1. Fixed MCP transport (WebStandardStreamableHTTPServerTransport) for Vercel serverless
2. Verified end-to-end MCP tool access from managed agent sessions
3. Removed GitHub MCP from all 9 agent configs on platform.claude.com
4. Updated shared context files (handoff-notes, active-sessions)

## Agent Status (All on platform.claude.com)
| Agent | Status | Version | GitHub MCP |
|-------|--------|---------|------------|
| Alert Tester | Active | v3 | Removed ✅ |
| Digest Compiler | Active | v3 | Removed ✅ |
| Support Triager | Active | v3 | Removed ✅ |
| Email Marketer | Active | v3 | Removed ✅ |
| UX Auditor | Active | v3 | Removed ✅ |
| Feature Tester | Active | v3 | Removed ✅ |
| Bug Triager | Active | v3 | Removed ✅ |
| Reviewer | Active | v3 | Removed ✅ |
| Builder | Active | v4 | Removed ✅ |
