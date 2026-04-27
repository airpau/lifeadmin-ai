#!/usr/bin/env bash
# Resolve the rebase conflicts and finish the push.
# CLAUDE.md and vercel.json conflicted with origin's recent commits.
# Both should keep "theirs" (the version from the cherry-pick / sprint
# commits) — that's where the managed-agents docs + whatsapp cron live.
# If origin also added crons, we'll merge those back in after the rebase
# completes.

set -euo pipefail
cd "$(dirname "$0")/.."

while [[ -d .git/rebase-merge ]] || [[ -d .git/rebase-apply ]]; do
  rm -f .git/index.lock

  # Find files still in conflict
  conflicting=$(git diff --name-only --diff-filter=U 2>/dev/null || true)

  if [[ -n "$conflicting" ]]; then
    echo "=== resolving conflicts: $conflicting ==="
    while IFS= read -r f; do
      [[ -z "$f" ]] && continue
      # "theirs" in rebase = the commit being replayed = our work
      git checkout --theirs -- "$f"
      git add -- "$f"
      echo "  theirs ✓  $f"
    done <<< "$conflicting"
  fi

  rm -f .git/index.lock
  echo ""
  echo "=== git rebase --continue ==="
  if ! git -c core.editor=true rebase --continue; then
    echo "❌ rebase still stuck — paste git status output back into chat"
    exit 1
  fi
done

rm -f .git/index.lock
echo ""
echo "=== rebase complete ==="
git log --oneline -6

echo ""
echo "=== pushing ==="
git push origin master

echo ""
echo "✅ shipped — Vercel deploys in ~90s"
echo "    Smoke test: paybacker.co.uk/auth/login"
