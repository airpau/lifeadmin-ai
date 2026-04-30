#!/bin/bash
set -e
cd "$(dirname "$0")"
rm -f .git/index.lock .git/HEAD.lock .git/refs/heads/master.lock 2>/dev/null || true
git add src/lib/truelayer.ts src/app/api/auth/callback/truelayer/route.ts src/app/api/bank/sync-now/route.ts src/app/api/cron/bank-sync/route.ts src/app/api/money-hub/route.ts src/app/api/money-hub/expected-bills/route.ts src/app/dashboard/money-hub/OverviewPanel.tsx src/app/dashboard/money-hub/SpendingPanel.tsx src/app/dashboard/money-hub/page.tsx src/app/api/auth/callback/google/route.ts src/app/api/auth/google/route.ts src/app/api/complaints/generate/route.ts src/app/api/disputes/route.ts src/app/dashboard/complaints/page.tsx src/app/dashboard/layout.tsx src/app/dashboard/scanner/page.tsx src/lib/telegram/tools.ts
git commit -m "fix: TrueLayer date bug, bank sync gap, income breakdown, expected bills UX

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git pull --rebase origin master
git push origin master
echo "✅ Deployed! Vercel will be live in ~2 mins."
rm -f deploy.sh
