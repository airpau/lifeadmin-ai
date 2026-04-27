#!/usr/bin/env bash
# Finish the 14-day-sprint commit + push.
# Run from your terminal in ~/lifeadmin-ai
# Why this script: the Cowork sandbox can't unlink files inside .git,
# so each git operation it ran left a stale .git/index.lock. Running
# from your terminal works normally.

set -euo pipefail
cd "$(dirname "$0")"

# Clear any stale lock left by sandbox runs
rm -f .git/index.lock

# All 19 files are already staged — verify
echo "=== staged files ==="
git diff --cached --name-only | head -25
echo ""

# Commit
echo "=== committing ==="
git commit -F .git-commit-message.txt
rm -f .git-commit-message.txt

# Type check before pushing (CLAUDE.md hard rule)
echo ""
echo "=== running tsc ==="
if ! npx tsc --noEmit; then
  echo ""
  echo "❌ tsc failed — DO NOT PUSH. Paste the errors back into chat."
  exit 1
fi

# Push
echo ""
echo "=== pushing to origin/master ==="
git push origin master

echo ""
echo "✅ Done. Vercel will redeploy automatically."
echo "   Smoke test: paybacker.co.uk/auth/login"
