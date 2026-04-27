#!/usr/bin/env bash
# Paybacker — staged merge-conflict resolver for commit 6ed4f978 → HEAD
# Generated 27 Apr 2026 to unblock the launch sprint sign-in flow.
#
# WHAT THIS DOES:
#   Phase A — git checkout --ours for 19 files (HEAD wins: auth, exports,
#             public pages, package.json, CLAUDE.md, sensitive profile + API).
#   Phase B — git checkout --theirs for 18 files (6ed4f978 wins: MCP hardening,
#             plan-limits, savings-utils, price-detector, edge-runtime cron,
#             styling refactor on most dashboard pages).
#   Phase C — re-applies the SavingsHero wiring to dashboard/page.tsx after
#             --ours strips it (Claude added it on top of the conflicted file).
#   Phase D — leaves 11 files unresolved for manual handling and prints them.
#
# WHAT IT DOES NOT DO:
#   - No commits, no push, no `git merge --continue`. You inspect first.
#   - Does not run tsc; the dangerous six need to be resolved before you can.
#
# Run from the repo root:
#   chmod +x resolve-merge-conflicts.sh
#   ./resolve-merge-conflicts.sh

set -euo pipefail

cd "$(dirname "$0")"

if [[ ! -f vercel.json ]] || [[ ! -d .git ]]; then
  echo "ERROR: run this from the lifeadmin-ai repo root." >&2
  exit 1
fi

# Refuse to run if there's no merge in progress — better to fail loud than
# accidentally checkout-overwrite a clean tree.
if [[ ! -f .git/MERGE_HEAD ]]; then
  echo "WARNING: .git/MERGE_HEAD not found — this script expects a paused merge."
  echo "         If you've already done 'git merge --abort' and started fresh, that's fine."
  echo "         If git status shows 'You have unmerged paths:', proceed."
  read -r -p "Continue anyway? [y/N] " ans
  [[ "$ans" =~ ^[Yy]$ ]] || exit 1
fi

# ---------- Phase A: take HEAD (--ours) ----------
HEAD_FILES=(
  # Auth — production user-facing flows
  "src/app/auth/login/page.tsx"
  "src/app/auth/signup/page.tsx"
  # Public marketing pages
  "src/app/pricing/page.tsx"
  "src/app/careers/page.tsx"
  "src/app/about/page.tsx"
  "src/app/blog/_shared.tsx"
  "src/app/preview/homepage/page.tsx"
  # Exports — working in production
  "src/app/api/export/csv/route.ts"
  "src/app/api/export/xlsx/route.ts"
  "src/components/DataExportCard.tsx"
  "src/app/dashboard/export/page.tsx"
  # Tutorials + telegram settings
  "src/app/dashboard/tutorials/page.tsx"
  "src/app/dashboard/settings/telegram/page.tsx"
  # Money-hub root (additive on the rest)
  "src/app/dashboard/money-hub/page.tsx"
  # Profile — sensitive (plan tier, bank/email connections)
  "src/app/dashboard/profile/page.tsx"
  # Two API routes verified against live Supabase schema:
  # dispute_watchdog_links.email_connection_id STILL EXISTS as uuid.
  "src/app/api/disputes/[id]/link-email-thread/route.ts"
  "src/app/api/disputes/[id]/sync-replies-now/route.ts"
  # Homepage stats endpoint — safer to keep HEAD (user-facing data)
  "src/app/api/preview/homepage-stats/route.ts"
  # Dependencies — firebase-admin IS still imported by src/lib/push/fcm.ts,
  # so HEAD must keep it in package.json.
  "package.json"
  # Docs
  "CLAUDE.md"
  # Dashboard root — Claude added SavingsHero, will re-apply in Phase C below
  "src/app/dashboard/page.tsx"
)

# ---------- Phase B: take 6ed4f978 (--theirs) ----------
THEIRS_FILES=(
  # MCP server modernization
  "mcp-server/src/index.ts"
  # Edge-runtime cron upgrade
  "src/app/api/cron/trial-expiry/route.ts"
  # MCP hardening (security improvements)
  "src/lib/mcp-auth.ts"
  "src/lib/mcp-tokens.ts"
  "src/app/api/mcp/transactions/route.ts"
  "src/app/api/mcp/tokens/route.ts"
  "src/app/dashboard/settings/mcp/page.tsx"
  # Refactored utilities (deliberate direction)
  "src/lib/plan-limits.ts"
  "src/lib/savings-utils.ts"
  "src/lib/price-increase-detector.ts"
  "src/lib/dispute-sync/types.ts"
  # Styling-only refactor on dashboard pages (.card → Tailwind)
  "src/app/dashboard/contracts/page.tsx"
  "src/app/dashboard/contract-vault/page.tsx"
  "src/app/dashboard/deals/page.tsx"
  "src/app/dashboard/spending/page.tsx"
  "src/app/dashboard/rewards/page.tsx"
  "src/app/dashboard/profile/report/page.tsx"
  # Admin / legal — refactor direction
  "src/app/dashboard/admin/legal-refs/page.tsx"
  "src/app/dashboard/admin/legal-updates/page.tsx"
)

# ---------- Apply Phase A ----------
echo ""
echo "=== Phase A: git checkout --ours (HEAD wins) ==="
for f in "${HEAD_FILES[@]}"; do
  if [[ -f "$f" ]]; then
    git checkout --ours -- "$f" && echo "  ours  ✓  $f"
  else
    echo "  skip  ⚠  $f (not found)"
  fi
done

# ---------- Apply Phase B ----------
echo ""
echo "=== Phase B: git checkout --theirs (6ed4f978 wins) ==="
for f in "${THEIRS_FILES[@]}"; do
  if [[ -f "$f" ]]; then
    git checkout --theirs -- "$f" && echo "  theirs✓  $f"
  else
    echo "  skip  ⚠  $f (not found)"
  fi
done

# ---------- Phase C: re-apply SavingsHero to dashboard root ----------
echo ""
echo "=== Phase C: re-apply SavingsHero wiring to dashboard/page.tsx ==="
DASHBOARD="src/app/dashboard/page.tsx"
if [[ -f "$DASHBOARD" ]]; then
  if grep -q 'SavingsHero' "$DASHBOARD"; then
    echo "  SavingsHero already present — skipping"
  else
    # Insert import after the SavingsSkeleton import line
    if grep -q "from '@/components/dashboard/SavingsSkeleton'" "$DASHBOARD"; then
      python3 -c "
import re, pathlib
p = pathlib.Path('$DASHBOARD')
src = p.read_text()
# 1) add import
src2 = src.replace(
    \"import SavingsSkeleton from '@/components/dashboard/SavingsSkeleton';\",
    \"import SavingsSkeleton from '@/components/dashboard/SavingsSkeleton';\nimport SavingsHero from '@/components/dashboard/SavingsHero';\",
    1,
)
# 2) inject the JSX after <PlanLimitsBanner />
src3 = src2.replace(
    '<PlanLimitsBanner />',
    '<PlanLimitsBanner />\n      <SavingsHero />',
    1,
)
if src3 == src:
    raise SystemExit('Could not patch — anchors not found')
p.write_text(src3)
print('  patched ✓ ' + str(p))
"
    else
      echo "  ⚠ SavingsSkeleton import anchor not found — re-apply manually:"
      echo "      add: import SavingsHero from '@/components/dashboard/SavingsHero';"
      echo "      add: <SavingsHero /> just after <PlanLimitsBanner />"
    fi
  fi
fi

# ---------- Phase D: report what's left ----------
echo ""
echo "=== Phase D: files that still need YOUR review ==="
echo ""
echo "MERGE BOTH SIDES (additive — read both, keep both):"
for f in \
  "src/components/NotificationBell.tsx" \
  "src/components/dispute/WatchdogCard.tsx" \
  "src/lib/dispute-sync/fetchers.ts" \
  "src/lib/dispute-sync/sync-runner.ts" \
  "src/app/dashboard/money-hub/payments/page.tsx" \
  ; do
  if grep -q '^<<<<<<< HEAD' "$f" 2>/dev/null; then
    echo "  $f"
  fi
done
echo ""
echo "DANGEROUS — read carefully (see MERGE_CONFLICT_RESOLUTIONS.md):"
for f in \
  "src/app/dashboard/complaints/page.tsx" \
  "src/app/dashboard/subscriptions/page.tsx" \
  "src/app/dashboard/admin/page.tsx" \
  "src/app/dashboard/forms/page.tsx" \
  "src/app/dashboard/layout.tsx" \
  ; do
  if grep -q '^<<<<<<< HEAD' "$f" 2>/dev/null; then
    echo "  $f"
  fi
done
echo ""

# ---------- Final report ----------
remaining=$(grep -rln '^<<<<<<< HEAD' \
  --include='*.ts' --include='*.tsx' --include='*.json' --include='*.sql' --include='*.md' --include='*.js' \
  src/ supabase/ mcp-server/ 2>/dev/null | wc -l | tr -d ' ')

echo "=================================================="
echo "Conflicts remaining: $remaining"
echo ""
echo "Next steps:"
echo "  1. Resolve the files listed above"
echo "  2. git status              # verify nothing else is unmerged"
echo "  3. git add -A              # stage all resolutions"
echo "  4. npx tsc --noEmit        # zero errors before continuing"
echo "  5. git merge --continue    # finish the merge"
echo "  6. git push                # ship it"
echo "=================================================="
