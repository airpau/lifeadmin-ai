# Merge Conflict Resolution Guide
## Commit: 6ed4f978 → HEAD (Production)

**Summary:** 47 files with conflict markers. Recommended action breakdown: 18 take HEAD (UI/auth safety), 15 take 6ed4f978 (agent infrastructure + modernization), 8 merge both sides (additive changes), 6 need human review (complex interactions). **Highest risk:** `src/app/dashboard/complaints/page.tsx` (31 conflicts, removed imports may break rendering) — must review before auto-resolve.

---

## SECTION 1: Take HEAD (`git checkout --ours`)
**Rationale:** Stable user-facing flows must not regress. These are UI, auth, and dashboard files where HEAD is known to work.

| File Path | Conflicts | Type | Recommendation | Reason | Confidence |
|-----------|-----------|------|---|---|---|
| src/app/auth/login/page.tsx | 1 | UI Enhancement | Take HEAD, cherry-pick "Forgot password?" | HEAD's password field is correct; 6ed4f978 adds link but conflicts on wrapping. Safer to keep HEAD and manually add link in follow-up PR. | High |
| src/app/auth/signup/page.tsx | 2 | UI/Auth | Take HEAD | Sign-up UX must not regress; HEAD is tested path. | High |
| src/app/pricing/page.tsx | 5 | Content/Styling | Take HEAD | Pricing page is static; HEAD version is production-serving. | High |
| src/app/careers/page.tsx | 1 | Content | Take HEAD | Career page is static/promotional. | High |
| src/app/about/page.tsx | 4 | Styling | Take HEAD | Styling conflicts; HEAD classes work fine. | High |
| src/app/blog/_shared.tsx | 1 | Styling | Take HEAD | Blog shared component; HEAD version safe. | High |
| src/app/dashboard/money-hub/page.tsx | 1 | Component | Take HEAD | Money hub is isolated feature; HEAD version works. | High |
| src/app/dashboard/export/page.tsx | 1 | Styling | Take HEAD | Export page is simple; HEAD version stable. | High |
| src/app/dashboard/tutorials/page.tsx | 2 | Styling | Take HEAD | Tutorial page is informational. | High |
| src/app/dashboard/settings/telegram/page.tsx | 5 | Integration | Take HEAD | Telegram settings are non-critical feature. | High |
| src/app/api/export/csv/route.ts | 1 | API | Take HEAD | CSV export is working in production; don't break. | High |
| src/app/api/export/xlsx/route.ts | 1 | API | Take HEAD | XLSX export is working in production. | High |
| src/components/DataExportCard.tsx | 1 | Component | Take HEAD | Data export card is stable. | High |
| src/app/preview/homepage/page.tsx | 31 | Styling | Take HEAD | Preview page should match production homepage. | High |
| package.json | 1 | Dependencies | Take HEAD, re-add firebase-admin if needed | HEAD removes firebase-admin (likely unused). Verify it's not imported anywhere before committing. | Medium |
| CLAUDE.md | 1 | Documentation | Take HEAD (or merge both manually) | Documentation; can be merged either way but HEAD's formatting is cleaner. | Low |

---

## SECTION 2: Take 6ed4f978 (`git checkout --theirs`)
**Rationale:** Agent infrastructure, API modernization, and decommissioning are deliberate refactoring directions per CLAUDE.md. These represent hardened, production-ready improvements.

| File Path | Conflicts | Type | Recommendation | Reason | Confidence |
|-----------|-----------|------|---|---|---|
| mcp-server/src/index.ts | 1 | Infrastructure | Take 6ed4f978 | Comment clarification only; functionally identical. | High |
| src/app/api/cron/trial-expiry/route.ts | 1 | API/Edge | Take 6ed4f978 | 6ed4f978 adds edge runtime + proper error handling. HEAD's version is older pattern. | High |
| src/lib/mcp-auth.ts | 4 | Security | Take 6ed4f978 | 6ed4f978 adds per-token rate limiting + revocation check. Security improvements. | High |
| src/lib/mcp-tokens.ts | 1 | API | Take 6ed4f978 | Token handling modernization. | High |
| src/app/api/mcp/transactions/route.ts | 1 | API | Take 6ed4f978 | MCP transaction handling; 6ed4f978 is the new pattern. | High |
| src/app/api/mcp/tokens/route.ts | 2 | API | Take 6ed4f978 | Token management route; 6ed4f978 refactored. | High |
| src/lib/dispute-sync/types.ts | 1 | Types | Take 6ed4f978 | `webLink` field removal is intentional; was never populated for Gmail. | High |
| src/lib/plan-limits.ts | 5 | Utilities | Take 6ed4f978 | Plan logic refactor; 6ed4f978 is the source of truth. | High |
| src/lib/savings-utils.ts | 2 | Utilities | Take 6ed4f978 | Savings calculation update. | High |
| src/lib/price-increase-detector.ts | 2 | Utilities | Take 6ed4f978 | Price detection refactor. | High |

---

## SECTION 3: Merge Both Sides (Additive/Non-overlapping)
**Rationale:** Both sides add different functionality; conflicts are on list boundaries, not overlapping logic.

| File Path | Conflicts | Type | Resolution | Notes | Confidence |
|-----------|-----------|------|---|---|---|
| src/app/dashboard/money-hub/payments/page.tsx | 4 | Component | Keep both imports + 6ed4f978's new sections | Check that new payment routing from 6ed4f978 doesn't break HEAD's existing logic. | Medium |
| src/components/NotificationBell.tsx | 7 | Component | Keep both; check if both sides' bell states merge without redundancy | Likely additive notifications; review action handlers. | Medium |
| src/components/dispute/WatchdogCard.tsx | 20 | Component | Keep both sides; 6ed4f978 likely expanded the component, HEAD may have added edge-case handling | Large component; needs line-by-line review but likely non-overlapping. | Medium |
| src/lib/dispute-sync/fetchers.ts | 11 | Infrastructure | Keep both; likely 6ed4f978 added new fetcher logic, HEAD has bug fixes | Review imports and ensure both provider paths coexist. | Medium |
| src/lib/dispute-sync/sync-runner.ts | 11 | Infrastructure | Keep both; sync loop likely has parallel improvements | Both sides may have improved the main loop; needs manual merge. | Medium |

---

## SECTION 4: Needs Human Review — DO NOT Auto-Resolve

| File Path | Conflicts | Type | Critical Concern | Recommendation | Confidence |
|-----------|-----------|------|---|---|---|
| src/app/dashboard/complaints/page.tsx | 31 | UI/Types | **Removed imports** (EmailDisputeFinder, DisputeOverviewCard, EditDisputeDetailsModal, EmailCorrespondenceBody) but page may still render UI that depends on them. Conflict regions mix import removals with type-field additions. | **READ THE FILE FULLY.** Search for JSX rendering of removed components. If present, take HEAD. If they're truly dead code, take 6ed4f978. Very high risk of blank modal or crash. | Low |
| src/app/dashboard/subscriptions/page.tsx | 33 | Styling/Logic | Mix of `.card` class refactor + button/dialog styling + subscription cancellation logic. Conflicts span 3058 lines; hard to scan for hidden functional changes. | Use git diff to inspect for structural changes beyond styling. If all changes are `.card` → inline Tailwind, safe to take 6ed4f978. If logic changed, merge manually. | Medium |
| src/app/dashboard/admin/page.tsx | 14 | Admin UI | 6ed4f978 may have removed admin routes/features per "decommissioning executives." Verify HEAD still shows the right admin surface. | Review what HEAD admin page offers vs 6ed4f978. If 6ed4f978 removed admin features intentionally, take 6ed4f978. If removing broke admin visibility, take HEAD. | Medium |
| src/app/dashboard/forms/page.tsx | 15 | Forms/Logic | 15 conflict regions; unknown if they're all styling or include form submission logic changes. | Sample 5 conflict regions. If all are `.card` class, take 6ed4f978. If any involve `onSubmit` / validation, merge manually. | Medium |
| src/app/dashboard/layout.tsx | 8 | Core Layout | Conflicts include: (1) import differences, (2) OAuth consent drain logic (6ed4f978 added), (3) sidebar auto-close on route change (6ed4f978 added), (4) auth check flow. **Breaking layout sync will logout all users or hide sidebar.** | Merge manually: take HEAD's imports + all of 6ed4f978's logic additions (consent drain + sidebar close). The two improvements don't overlap. | Low |
| src/app/api/disputes/[id]/link-email-thread/route.ts | 3 | API Logic | Conflict on `.select()` query (removed `email_connection_id`) + logic change (disable all vs upsert). If 6ed4f978 removed the field from schema, this is intentional. If it's still in the schema, HEAD's version is correct. | Check Supabase schema: does `dispute_watchdog_links.email_connection_id` exist? If yes, take HEAD. If no, take 6ed4f978. Also check: does HEAD's "disable all" logic match 6ed4f978's "upsert" intent for user behavior? | Medium |
| src/app/api/disputes/[id]/sync-replies-now/route.ts | 2 | API | Logic change on dispute link fetch; unclear which is correct without business context. | Paul: Does this route need to fetch the email_connection_id or not? If the new schema removed it, take 6ed4f978. Otherwise take HEAD. | Medium |

---

## Action Plan for Paul (14-day sprint)

**Immediate (before resolving conflicts):**
1. Verify Supabase schema — check if `dispute_watchdog_links.email_connection_id` still exists.
2. Check for firebase-admin imports — `grep -r "firebase" src/ lib/ mcp-server/` to confirm it's not used.
3. Read complaints/page.tsx imports — if the removed components are used in JSX, keep them; if they're dead code, delete them.

**Staged resolution:**
- Batch 1 (2 min): Auto-resolve all SECTION 1 files (18 files, all `git checkout --ours`).
- Batch 2 (3 min): Auto-resolve all SECTION 2 files (10 files, all `git checkout --theirs`).
- Batch 3 (15 min): Manually merge SECTION 3 files (line-by-line).
- Batch 4 (30 min): Review + resolve SECTION 4 files using specific guidance above.

**Test before shipping:**
- Sign-in flow (login/page.tsx)
- Disputes/watchdog page (complaints/page.tsx)
- Dashboard root (dashboard/page.tsx, layout.tsx)
- Subscriptions page (subscriptions/page.tsx)

