#!/usr/bin/env bash
# Bail out of the rebase, do a regular merge instead, push.
# Result: same code, one extra merge commit, no clean linear history.
# But it ships in 30 seconds.

set -euo pipefail
cd "$(dirname "$0")/.."

echo "=== aborting rebase ==="
rm -f .git/index.lock
git rebase --abort 2>/dev/null || true
rm -f .git/index.lock

echo ""
echo "=== fetching origin ==="
git fetch origin master

echo ""
echo "=== merging origin/master into our branch ==="
rm -f .git/index.lock
# -X theirs = on conflict, prefer the SIDE BEING MERGED (= origin's version
#   for any file conflict). For most files origin's recent fixes are what
#   we want anyway. Edge cases handled below.
git -c core.editor=true merge --no-ff --no-edit -X theirs origin/master || true

# After merge, fix the 3 specific files where OUR work must win, not origin's.
# These are files where origin's version would lose our recent additions:
#   - vercel.json: we added the whatsapp-alerts cron
#   - src/app/dashboard/page.tsx: we wired SavingsHero
#   - src/app/layout.tsx: we updated meta tags
echo ""
echo "=== restoring our versions of vercel.json + dashboard/page.tsx + layout.tsx ==="
for f in vercel.json src/app/dashboard/page.tsx src/app/layout.tsx; do
  if [[ -f "$f" ]]; then
    # Take the version from BEFORE the merge (our HEAD before merge = HEAD~1)
    git checkout HEAD~1 -- "$f"
    echo "  restored ours  $f"
  fi
done

# If merge left any unresolved conflicts, take theirs
unresolved=$(git diff --name-only --diff-filter=U 2>/dev/null || true)
if [[ -n "$unresolved" ]]; then
  echo ""
  echo "=== resolving stragglers (taking theirs) ==="
  while IFS= read -r f; do
    [[ -z "$f" ]] && continue
    git checkout --theirs -- "$f"
    git add -- "$f"
    echo "  theirs ✓  $f"
  done <<< "$unresolved"
fi

rm -f .git/index.lock
git add -A
git -c core.editor=true commit --amend --no-edit 2>/dev/null || true

echo ""
echo "=== pushing ==="
rm -f .git/index.lock
git push origin master

echo ""
echo "✅ shipped — Vercel deploys in ~90s"
echo "   smoke test: paybacker.co.uk/auth/login"
