#!/usr/bin/env bash
# Restore the 6 files that the naive "merge both" strategy broke,
# then re-run strip-conflict-markers.py with HEAD-side decisions.
#
# Why: the cherry-pick committed markered versions of these files
# (HEAD~1 = 948de424's parent = the cherry-pick commit). My strip
# script then tried to merge both sides and produced unclosed JSX.
# We restore the markered version from git, then strip with HEAD only.

set -euo pipefail
cd "$(dirname "$0")/.."

rm -f .git/index.lock

FILES=(
  "src/components/NotificationBell.tsx"
  "src/components/dispute/WatchdogCard.tsx"
  "src/lib/dispute-sync/fetchers.ts"
  "src/lib/dispute-sync/sync-runner.ts"
  "src/app/dashboard/money-hub/payments/page.tsx"
  "src/app/dashboard/spending/page.tsx"
)

echo "=== restoring markered versions from git ==="
for f in "${FILES[@]}"; do
  # HEAD~1 is the cherry-pick commit (still has markers in these files)
  git show HEAD~1:"$f" > "$f"
  echo "  restored  $f"
done

echo ""
echo "=== running strip-conflict-markers.py ==="
python3 scripts/strip-conflict-markers.py

echo ""
echo "=== sanity check: any markers left? ==="
remaining=$(grep -rln '^<<<<<<< HEAD' \
  --include='*.ts' --include='*.tsx' --include='*.json' --include='*.sql' --include='*.js' --include='*.css' \
  src/ supabase/ mcp-server/ scripts/ 2>/dev/null | wc -l | tr -d ' ')
echo "files with markers: $remaining"

echo ""
echo "=== running tsc ==="
if npx tsc --noEmit; then
  echo ""
  echo "✅ tsc passed — staging and committing"
  rm -f .git/index.lock
  git add -A
  git commit -m "fix: take HEAD for 6 files where naive concat broke syntax

NotificationBell, WatchdogCard, dispute-sync internals, and money-hub
payments had merge regions that touched the same JSX/TS block from both
sides — concatenating produced unclosed tags. Spending page had stray
syntax issues from theirs. Resolution: take HEAD on all 6.

6ed4f978 improvements for these files can be hand-cherry-picked in a
follow-up PR if any are worth keeping."
  echo ""
  echo "=== pushing ==="
  rm -f .git/index.lock
  git push origin master
  echo ""
  echo "✅ deployed — Vercel will redeploy in ~90s"
else
  echo ""
  echo "❌ tsc still failing — paste the output back into chat"
  exit 1
fi
