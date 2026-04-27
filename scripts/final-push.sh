#!/usr/bin/env bash
# Last step. 8 files are already staged. This commits + pushes.
set -euo pipefail
cd "$(dirname "$0")/.."

rm -f .git/index.lock

git commit -m "fix: take HEAD for 6 files where naive concat broke syntax

NotificationBell, WatchdogCard, dispute-sync internals, and money-hub
payments had merge regions that touched the same JSX/TS block from both
sides — concatenating produced unclosed tags. Spending page had stray
syntax issues from theirs. Resolution: take HEAD on all 6.

Also includes the strip-conflict-markers.py + fix-broken-resolutions.sh
recovery scripts as artifacts in scripts/.

Co-Authored-By: Claude <noreply@anthropic.com>"

rm -f .git/index.lock
git push origin master

echo ""
echo "✅ pushed. Vercel will redeploy (~90s). Smoke test paybacker.co.uk/auth/login"
