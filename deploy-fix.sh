#!/bin/bash
# deploy-fix.sh — run once from the lifeadmin-ai project root in your Terminal
set -e
cd "$(dirname "$0")"

echo "🔓 Clearing stale git locks..."
rm -f .git/index.lock .git/HEAD.lock .git/refs/heads/master.lock \
       .git/refs/heads/feature/sprint-20260406-fca-savings-rate.lock 2>/dev/null || true

echo "📋 Staging changed files..."
git add \
  src/lib/truelayer.ts \
  src/app/api/auth/callback/truelayer/route.ts \
  src/app/api/auth/callback/google/route.ts \
  src/app/api/auth/google/route.ts \
  src/app/api/complaints/generate/route.ts \
  src/app/api/disputes/route.ts \
  src/app/api/money-hub/route.ts \
  src/app/api/money-hub/expected-bills/route.ts \
  src/app/api/bank/sync-now/route.ts \
  src/app/api/cron/bank-sync/route.ts \
  src/app/dashboard/complaints/page.tsx \
  src/app/dashboard/layout.tsx \
  src/app/dashboard/scanner/page.tsx \
  src/app/dashboard/money-hub/OverviewPanel.tsx \
  src/app/dashboard/money-hub/SpendingPanel.tsx \
  src/app/dashboard/money-hub/page.tsx \
  src/lib/telegram/tools.ts

echo "✅ Committing..."
git commit -m "fix: bank sync, money hub income, expected bills UX, TrueLayer date bug

CRITICAL FIXES:
- Fix TrueLayer 400 error: 'to cannot be in the future' — was sending tomorrow as
  the to-date; TrueLayer interprets date-only strings as end-of-day which is in the
  future. Now sends current UTC timestamp instead. This was breaking ALL bank syncs.
- Fix connected_at reset on bank reconnection: was resetting to today on every
  reconnect, making the sync floor move to today and skipping recent history.
  Now preserves original connected_at on reconnect.
- Bank sync gap: sync-now and cron bank-sync now start from last known transaction
  date per account (not hardcoded 90 days), filling exact gap since last sync.

MONEY HUB FIXES:
- Fix income breakdown always empty: get_monthly_income RPC returns {source,
  source_total} but route was reading {category, category_total}. Fixed with
  support for both column name variants.
- Remove duplicate spending breakdown from OverviewPanel (SpendingPanel shows it)
- Add property_management and utility to spending category labels
- Expected bills: bank sync warning banner when connections expired + bills Not seen
- Expected bills: prominent green Mark as paid button for past-due bills
- Expected bills: fix ordinal dates (2nd/3rd/4th not 2th/3th/4th)
- Better Deals: filter out £0 annual saving deals
- Sync timeout fix: sync button no longer crashes page on Vercel 60s timeout

OTHER FIXES:
- Add Scanner to sidebar nav (was completely unreachable without knowing URL)
- Fix email reconnect OAuth flow with returnTo in base64 JSON state
- Add train delay compensation issue type with UK rail legal references

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"

echo "🚀 Pushing to master (triggers Vercel deploy)..."
git push origin master

echo "✅ Done! Vercel will deploy in ~2 minutes."
echo ""
echo "After deploy: reconnect your bank again from the Scanner page."
echo "The sync will now correctly fetch from your last transaction date."
rm -f deploy-fix.sh
