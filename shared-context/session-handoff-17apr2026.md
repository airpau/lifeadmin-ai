# Session Handoff — 17 April 2026 (Cowork session)

## Trigger
Paul reported: "Test Valley Council" subscription manually recategorised to
"Council Tax" on the Subscriptions page did **not** update the Money Hub
"spending by category" totals. Demanded "complete unity between subscriptions
and moneyhub data" and self-learning across the system.

## Root cause (what was actually broken)

1. `/api/subscriptions/[id]` PATCH handler fired its Money Hub / merchant_rules
   propagation calls as fire-and-forget `.then()` chains. Vercel's serverless
   runtime kills those promises as soon as the response returns, so they
   frequently never completed.
2. The handler rolled its own `merchant_rules` upsert + `money_hub_category_overrides`
   upsert instead of calling the canonical `learning-engine.ts`.
3. `money_hub_category_overrides` had **no unique index** that matched the
   `ON CONFLICT (user_id, merchant_pattern)` target the code was trying to use,
   so every upsert silently failed.
4. `bank_transactions.user_category` was never retroactively updated when a
   subscription category changed, so the Money Hub view (which groups by
   `bank_transactions.user_category`) kept showing stale totals.
5. `detect_internal_transfers()` referenced `bank_transactions.updated_at`,
   which doesn't exist — every call threw a column-not-found error.
6. `auto_categorise_transactions()` only had 4 phases (merchant_rules,
   Open-Banking TRANSFER, CREDIT→income, SO/DD→bills). Card purchases and
   faster-payment rows with no merchant_rule match were left NULL, which the
   Money Hub view silently dropped from "spending by category".

## What was deployed to production Supabase (`kcxxlesishltdmfctlmo`)

1. Migration `20260417000000_subscription_category_unity.sql`:
   - Partial unique index `idx_mhco_user_merchant_pattern_uniq`
     on `money_hub_category_overrides(user_id, merchant_pattern)` where
     `transaction_id IS NULL` — fixes the silent-upsert-failure.
   - `apply_subscription_category_correction()` RPC (SECURITY DEFINER) —
     single authoritative entry-point that updates:
       * `subscriptions.category`
       * `money_hub_category_overrides` (merchant-pattern override)
       * `bank_transactions.user_category` (retroactive recategorisation)
     Respects per-transaction overrides, never touches `transfers`.
2. Migration `20260417010000_restore_categorisation_pipeline.sql`:
   - `detect_internal_transfers()` rewritten — removed the invalid
     `updated_at = NOW()` write.
   - `auto_categorise_transactions()` rewritten — added Phase 5 (faster-payment
     description echoes → `transfers`) and Phase 6 (catch-all remaining NULL
     debits → `other`) so no spending row is ever silently dropped.

## What was changed in source code

- `src/app/api/subscriptions/[id]/route.ts` — PATCH handler rewritten:
  * `await Promise.all([...])` around the propagation calls (fixes the
    Vercel fire-and-forget kill).
  * Calls canonical `learnFromCorrection` from `learning-engine.ts`.
  * Calls `apply_subscription_category_correction` RPC in the same Promise.all.
  * Sync failures are caught — the PATCH response itself still succeeds.
- `src/app/auth/login/page.tsx` — pre-existing TS1005 error fixed by adding
  the missing `}` that closes the `LoginPage()` function. Needed for Vercel
  deploy (CLAUDE.md: "zero type errors required").
- `supabase/migrations/20260417010000_restore_categorisation_pipeline.sql`
  — new, matches what was applied to production.

## Data backfill run against Paul's account (`64a7d7bf-dd1f-48ae-8468-0c7244f29db1`)

- Looped `apply_subscription_category_correction` across all 56 active,
  non-dismissed subscriptions (skipping those still categorised `other` or
  NULL) → 56 reconciled.
- After pipeline restore, one final pass:
  * `detect_internal_transfers` → 4 transfers paired.
  * `auto_categorise_transactions` → 311 total (305 catch-all `other`,
    6 faster-payment transfers). **April 2026 now has zero NULL-category
    debit rows.**

April 2026 spending breakdown, debit side (post-fix):

| category            | txns | £        |
|---------------------|------|----------|
| transfers           | 21   | 7,764.29 |
| loan                | 4    | 4,779.36 |
| mortgage            | 3    | 4,339.31 |
| bills               | 18   | 3,715.36 |
| professional        | 4    | 2,540.47 |
| other (catch-all)   | 18   | 2,433.16 |
| property_management | 3    | 1,336.31 |
| software            | 16   | 1,072.00 |
| groceries           | 8    |   511.64 |
| cash                | 1    |   480.00 |
| loans               | 3    |   351.70 |
| insurance           | 2    |   247.57 |
| council_tax         | 2    |   202.22 | ← Test Valley Council now lands here
| food                | 9    |   175.59 |
| …                   | …    | …        |

## BLOCKED — manual action required from Paul (on his Mac)

The sandbox cannot remove stuck git state on the workspace mount (OS-level
filesystem permission). Paul needs to clean these up from his Mac terminal:

```bash
cd /path/to/lifeadmin-ai

# 1. Abort the stuck rebase from the previous session.
#    (master onto f154e1c from 745c3fd — never completed.)
git rebase --abort 2>/dev/null || rm -rf .git/rebase-merge .git/index.lock .git/HEAD.lock

# 2. Pull latest from remote (should fast-forward cleanly now).
git pull --ff-only origin master

# 3. Confirm the uncommitted work is still on disk.
git status --short
# Expect to see:
#   M src/app/auth/login/page.tsx
#   ?? supabase/migrations/20260417010000_restore_categorisation_pipeline.sql

# 4. Remove the scratch file Claude left behind (ignorable).
rm -f tsconfig.check.json

# 5. Stage + commit + push the two real changes.
git add src/app/auth/login/page.tsx \
        supabase/migrations/20260417010000_restore_categorisation_pipeline.sql
git commit -m "Restore categorisation pipeline + fix login TS error

- Fix detect_internal_transfers: drop invalid updated_at write
- Extend auto_categorise_transactions with Phase 5 (faster-payment
  echoes → transfers) and Phase 6 (catch-all → other) so no debit
  row is silently dropped from the Money Hub view
- Close unclosed function body in src/app/auth/login/page.tsx so
  Vercel type-check passes again

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>"

git push origin master
```

Both migrations are **already applied to production Supabase** — the commit
is just for source-of-truth parity. Vercel deploy can go ahead as soon as
the push lands.

## Verification steps on Paul's end

1. Open Money Hub for April 2026. Council Tax should read **£202.22** (was
   £0 before the original bug report, then £196.88 before Test Valley Council
   landed). Test Valley Council and Winchester City Council both appear.
2. Find any subscription categorised as "Other", change it to a specific
   category, save. Open Money Hub → that category's total should move
   immediately (no refresh cycle, no cron wait).
3. `Money Hub → spending by category` total should now match the sum of
   all April debits (nothing silently dropped).
