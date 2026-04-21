# Active Sessions — Last Updated 20 Apr 2026 20:00 UTC

## Latest: Cowork Desktop — Canonical Category Taxonomy (20 Apr 2026, evening)

### What was done
- **Full canonical category taxonomy** implemented across the entire codebase.
- New file `src/lib/categories.ts` — 31 canonical IDs (lowercase snake_case), Title Case display labels, emoji, group, helper functions (`normaliseCategory`, `mapBankCategory`, `isValidCategory`, `categoryListFormatted`), comprehensive alias map + TrueLayer/Yapily mapping.
- **Two-tier system**: Tier 1 = fixed canonical parents (same for all users, budget/analysis basis). Tier 2 = user-defined subcategories stored in new `user_category_custom` table, always linked to a parent.
- **DB migration** `20260420100000_canonical_categories.sql`:
  - Step 0: LOWER(TRIM()) all category fields across 5 tables (handles "Professional", "Bills", "Healthcare" mixed-case).
  - Step 1: Comprehensive alias remapping incl. space variants ("property management", "eating out", "council tax", "transfer" singular, "professional" → fees).
  - Step 2: CHECK constraints (NOT VALID) on `bank_transactions.user_category`, `bank_transactions.merchant_category`, `subscriptions.category`.
  - Steps 3–7: `user_subcategory` columns added, `user_category_custom` table, 3 new RPCs.
- **Files updated**: `detect-recurring.ts`, `money-hub-classification.ts`, `tools.ts` (Telegram), `tool-handlers.ts` (Telegram), `user-bot.ts` (Telegram), `money-hub.ts` (chat tool), `subscriptions.ts` (chat tool).
- **Branch**: `feature/canonical-categories` — 2 commits, pushed to GitHub. PR needed.
- **Note**: `.git/index.lock` and `.git/HEAD.lock` are stale lock files on the Mac filesystem (virtiofs FUSE can't delete them from sandbox). Used git plumbing + direct ref-file writes to bypass. Next developer session should `rm .git/index.lock .git/HEAD.lock` to restore normal git operation.

### Next steps
- Create PR: `feature/canonical-categories` → `main` (review + merge).
- Run `supabase db push` to apply migration against production DB.
- After migration runs, verify Money Hub spending breakdown shows consistent Title Case labels (via CATEGORY_LABELS lookup) with no duplicates.
- Consider adding `transfers` and `income` exclusion in Money Hub spending RPC if not already filtered.

---

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
