#!/usr/bin/env bash
# Commit script for the Yapily build-review work.
# Branches off main and lays down six labelled commits matching
# the six P0 changes in docs/YAPILY_BUILD_REVIEW_PLAN.md.
#
# Run from the repo root on your local machine. Paul, this is yours
# to run — the sandbox couldn't safely manipulate the worktree state.
#
# Usage:
#   bash docs/YAPILY_BUILD_REVIEW_COMMIT_SCRIPT.sh
#
# What it does:
#   1. Verifies you have a clean working tree on main (aborts otherwise)
#   2. Branches feature/yapily-hosted-flow
#   3. Stages + commits each P0 hunk on its own
#   4. Pushes the branch and prints the PR open URL

set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

echo "→ Switching to main and pulling latest"
git checkout main
git pull --ff-only

echo "→ Sanity-checking working tree"
if [[ -n "$(git status --porcelain)" ]]; then
  echo "✗ Working tree has uncommitted changes. Stash or commit before running."
  git status --short
  exit 1
fi

BRANCH="feature/yapily-hosted-flow"
echo "→ Branching $BRANCH"
git checkout -b "$BRANCH"

# ──────────────────────────────────────────────────────────────────
# Re-apply the changes by checking out the working files from your
# previous workspace state. This script assumes you saved my edits
# to disk before running (which Cowork does automatically).
#
# If for some reason the files don't match, run the diff first:
#   git diff main -- src/lib/yapily.ts
# ──────────────────────────────────────────────────────────────────

# P0-1 — Hosted Pages flow
git add \
  supabase/migrations/20260501080000_yapily_hosted_flow.sql \
  src/lib/yapily.ts \
  src/lib/yapily/connection-store.ts \
  src/app/api/auth/yapily/route.ts \
  src/app/api/yapily/callback/route.ts
git commit -m "feat(yapily): switch consumer connect to Hosted Pages flow

Migle's T1+T2: replace POST /account-auth-requests with
POST /hosted/consent-requests. The user is now redirected to
Yapily's hosted consent page, our callback handles the hosted-flow
redirect params, and the new hosted_consent_id column links the
pending bank_connections row back to the upstream request so the
fallback poll cron can promote it later.

- src/lib/yapily.ts:
  - createHostedConsentRequest()  — POST /hosted/consent-requests
  - getHostedConsentRequest()     — used by the poll cron
  - getInstitution(id)            — fetches the institution + features
  - createAccountAuthorisation kept for backwards compat
- src/app/api/auth/yapily/route.ts: hosted flow + persist pending row
- src/app/api/yapily/callback/route.ts: hosted-flow params,
  business_log on error, surface error_description, snapshot
  institution.features
- src/lib/yapily/connection-store.ts: hostedConsentId match takes
  precedence; persist institution_features
- migration 20260501080000_yapily_hosted_flow.sql: additive columns
  for the hosted flow + polling state + capability cache

Refs: docs/YAPILY_BUILD_REVIEW_PLAN.md"

# P0-2 — Structured errors + 403 → re-consent
git add \
  src/lib/yapily/error-handler.ts \
  src/app/api/bank/sync-now/route.ts \
  src/app/api/cron/bank-sync/route.ts
git commit -m "feat(yapily): structured errors + 403 → re-consent flow

Migle's T6+T7: yapilyRequest now throws YapilyError with the upstream
status code, code, and raw body. New handleYapilyError() helper logs
to business_log per class, and on 403 flips bank_connections.status
to 'expired' so ConsentRenewalBanner picks it up.

- src/lib/yapily/error-handler.ts (new): shared per-class outcome
  + business_log audit trail
- src/app/api/bank/sync-now: branch on YapilyError.status; bail out
  on 403/429
- src/app/api/cron/bank-sync: same pattern, plus connection-skip
  semantics so the cron doesn't loop on a dead consent

Refs: docs/YAPILY_BUILD_REVIEW_PLAN.md"

# P0-3 — 3-minute fallback polling cron
git add \
  src/app/api/cron/yapily-consent-poll/route.ts \
  vercel.json
git commit -m "feat(yapily): 3-min fallback polling cron with backoff

Migle's T4: when a hosted consent has been pending for >3 minutes
without a redirect callback, poll GET /hosted/consent-requests/{id}
once per minute (min(60s * 2^poll_attempts, 600s) backoff). On
AUTHORIZED, run the same upsert path the happy callback uses and
trigger the initial-sync; on terminal REJECTED/REVOKED/FAILED/EXPIRED,
mark the connection revoked.

- src/app/api/cron/yapily-consent-poll/route.ts (new)
- vercel.json: schedule every minute

Refs: docs/YAPILY_BUILD_REVIEW_PLAN.md"

# P0-4 — Per-institution capability gating + single-use
git add \
  src/app/api/cron/sync-upcoming/route.ts \
  src/app/api/bank/renew-consent/route.ts
git commit -m "feat(yapily): per-institution capability gate + single-use

Migle's T10: gate scheduled-payments / periodic-payments / direct-debits
on institution.features so we only call endpoints the institution
advertises support for. Treat each of those three as single-use per
consent — once consumed, never call again until consent is renewed.

- src/app/api/cron/sync-upcoming: feature gate + *_consumed_at
  tracker; capabilities fall through when institution_features is
  empty (legacy rows pre-dating the cache)
- src/app/api/bank/renew-consent: clear the three consumed_at columns
  on successful reconfirmConsent so the renewed consent gets a fresh
  allowance

Refs: docs/YAPILY_BUILD_REVIEW_PLAN.md"

# P0-5 — Pagination 'before' + 5-min window
git add \
  src/app/api/yapily/initial-sync/route.ts
git commit -m "feat(yapily): paginated initial sync + 5-min window guard

Migle's T11: walk transaction pages by setting 'before' to the
earliest tx date in the previous batch until the response is empty.
Also apply the 5-minute back-window on the lower bound so any
late-arriving transactions surfaced inside Yapily's documented 5-min
historical-data window aren't missed.

(The same pagination opts shape is wired into bank-sync + sync-now
in earlier commits.)

Refs: docs/YAPILY_BUILD_REVIEW_PLAN.md"

# P0-6 — Disconnect endpoint
git add \
  src/app/api/bank/disconnect/route.ts
git commit -m "feat(yapily): disconnect calls DELETE /account-auth-requests/{id}

Migle's T8: the disconnect modal now revokes the upstream consent on
Yapily's side via DELETE /account-auth-requests/{id} before mutating
local state. Best-effort upstream call — a 404 is treated as
idempotent (already revoked), other failures are logged but do not
block the local revoke.

- src/app/api/bank/disconnect: deleteAccountAuthorisation() before
  the mode-switch, gated on willRevokeConnection

Refs: docs/YAPILY_BUILD_REVIEW_PLAN.md"

# Documentation
git add \
  docs/YAPILY_BUILD_REVIEW_PLAN.md \
  docs/YAPILY_BUILD_REVIEW_COMMIT_SCRIPT.sh
git commit -m "docs(yapily): build review plan + commit script

Working notes for Migle's Monday build review. Documents the gap
analysis (current code vs the 11 test cases on her Build Review
Testing Steps PDF), the file-by-file change list, build order, and
the test-account strategy."

echo
echo "→ Pushing $BRANCH to origin"
git push -u origin "$BRANCH"

echo
echo "✓ Done. Open the PR here:"
echo "  https://github.com/airpau/lifeadmin-ai/compare/main...$BRANCH?expand=1"
echo
echo "Suggested PR title:"
echo "  feat(yapily): hosted-pages flow + 6 P0 changes for Migle build review"
echo
echo "Suggested PR body:"
echo "  See docs/YAPILY_BUILD_REVIEW_PLAN.md for the full plan and gap analysis."
echo "  Six P0 commits: P0-1 hosted flow, P0-2 errors, P0-3 polling,"
echo "  P0-4 capability gate, P0-5 pagination, P0-6 disconnect."
echo "  Migration 20260501080000_yapily_hosted_flow.sql is additive only."
echo "  All TS errors on touched files clean. Pre-existing repo-wide errors"
echo "  unrelated to this PR (whatsapp template-registry, .next cache)."
