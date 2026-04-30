# Active Sessions — Last Updated 25 Apr 2026 18:00 UTC

## Latest: Business Monitor — 25 Apr 2026 (evening)
- 1 PR merged to production today:
  - #304: fix(money-hub): spending grand total matches banner for all plan tiers
- 4 new PRs opened today (all email morning digest fix, #308 is the final iteration):
  - #305, #306, #307 — earlier iterations, superseded
  - #308: fix(emails): merge morning digest, fix dismissed re-creation, Reply-To, dark HTML
- 30 open PRs in queue — review backlog building
- Evening Telegram check-in sent to Paul

## Previous: Business Monitor — 24 Apr 2026 (evening)
- 10 PRs merged to production today (cancellations feature sprint + mobile/UX fixes):
  - #282: feat(disputes): Open-in-Email + "I've sent it" for every dispute
  - #281: fix(mobile): iOS input zoom prevention + onboarding UX wins
  - #280: feat(cancellations): watchdog auto-tracks replies + copy updates
  - #279: feat(cancellations): mailto uses provider address + handoff flow
  - #278: feat(marketing): founder note on /about + regulated trust band on /
  - #277: feat(cancellations): discovery leg for unseen providers
  - #276: fix(marketing): footer 404s + login stay-signed-in + about page
  - #275: feat(cancellations): weekly Perplexity refresh cron
  - #274: feat(cancellations): DB-backed cancel info + AI persistence
  - #273: fix(money-hub): reverse-sync recategorisation + Pro-gate exports
- 3 new PRs opened today: #256 (mcp schema bugs), #247 (email rate limit fix), #246 (subscriptions 22 UX findings)
- 30 open PRs in queue — review backlog building
- Evening Telegram check-in sent to Paul

## Previous: Business Monitor — 22 Apr 2026 (evening)
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
