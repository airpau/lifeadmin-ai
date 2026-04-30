# Open Banking Data Integrity Audit — 2026-04-22

## Executive summary

`bank_transactions` is the de facto single source of truth for Open Banking
data, but the rest of the app does not treat it that way. Downstream
features (Subscriptions, Savings Goals, Price-Increase Alerts, Renewal
Reminders) create **frozen snapshots** at insert time and never reconcile
against the underlying transactions. When a user reclassifies, deletes, or
resyncs bank data, those snapshots drift — producing the "one update here
doesn't update there" discrepancies users report.

The fix is bidirectional linking and post-sync reconciliation, not new
features.

## 1. Ingestion surface

Bank data enters the system through three routes:

- TrueLayer — `src/app/api/cron/bank-sync/route.ts` (daily, tiered by plan)
- Yapily — same cron file, alternative provider
- Manual sync (Pro only) — `src/app/api/bank/sync-now/route.ts` (6h cooldown, 3/day cap)
- OAuth callbacks — `src/app/api/auth/callback/truelayer/route.ts`,
  `src/app/api/auth/yapily/route.ts`

Writes land in:

- `bank_connections` — provider metadata, tokens, last-sync timestamps,
  `current_balance`. Status of `active | expired | revoked | token_expired`.
- `bank_transactions` — raw txns; unique on `(user_id, transaction_id)`.
  OB-provided `category` is usually NULL and gets filled by RPC post-sync.
  Has `user_category` (override) and `income_type` (inferred) columns.

Post-sync, four RPCs fire in order
(`src/app/api/bank/sync-now/route.ts:480-485`):

1. `deduplicate_bank_transactions(p_user_id)` — removes TrueLayer/Yapily overlap
2. `fix_ee_card_merchant_names(p_user_id)` — EasyJet card description cleanup
3. `auto_categorise_transactions(p_user_id)` — fills `category` column
4. `detect_and_sync_recurring_transactions(p_user_id)` — creates `subscriptions` rows

A JS-side `detectRecurring()` (`src/lib/detect-recurring.ts:133-322`) also
runs. **The RPC logic is Postgres-side only and is not visible in the
repo**, which itself is a source-of-truth risk — two codepaths claiming to
classify the same data.

## 2. Derived state — what reads the SOT, what caches a copy

| Feature | File | Reads from | Uses classifier? | Drift risk |
|---|---|---|---|---|
| Money Hub dashboard | `src/app/api/money-hub/route.ts:135-184` | `bank_transactions` + `money_hub_category_overrides` | Yes (`resolveMoneyHubTransaction`) | LOW — re-derived every GET |
| Subscription list | `src/app/api/subscriptions/route.ts` | `subscriptions` (snapshot) | No | HIGH — stores average amount + manual `next_billing_date` |
| Budget planner | `src/app/api/money-hub/route.ts:269-272` | `money_hub_budgets` + `authCategoryTotals` (JS-derived) | Yes | LOW–MED — current in backend; frontend cache can lag |
| Savings goals | `src/app/api/money-hub/route.ts` | `money_hub_savings_goals` | N/A | VERY HIGH — manual `current_amount`, `linked_account_id` never read |
| Expected bills / renewal reminders | `src/lib/email/renewal-reminders.ts:20-99` | `subscriptions.next_billing_date` | No | HIGH — honours manual date over live txns |
| Price-increase alerts | `src/app/api/price-alerts/detect/route.ts:45-58` | `price_increase_alerts` (snapshot) | Detection-time only | HIGH — never re-scanned |
| Chat / Money Hub tool | `src/app/api/chat/tools/money-hub.ts:32-54` | `bank_transactions` via `getClassifiedTransactions` | Yes | LOW |
| Chat / Subscriptions tool | `src/app/api/chat/tools/subscriptions.ts:31-86` | `subscriptions` | No | MED |
| Telegram tool handlers | `src/lib/telegram/tool-handlers.ts:21-45` | `bank_transactions` via classifier | Yes | LOW |

**Pattern:** anything that reads `bank_transactions` through
`resolveMoneyHubTransaction` is live. Anything that reads a derived table
(`subscriptions`, `price_increase_alerts`, `money_hub_savings_goals`) is a
potential drift point.

## 3. Write paths that fork the truth

1. **Bank sync upsert** — `src/app/api/bank/sync-now/route.ts:280-282,437-438`.
   Raw fields only. Does not call the JS classifier at ingest; defers to
   the `auto_categorise_transactions` RPC. The RPC does not consult
   `money_hub_category_overrides`, so a brand-new matching txn can come in
   with the wrong category on first render until overrides reapply on the
   next Money Hub GET.
2. **Recategorise endpoint** — `src/app/api/money-hub/recategorise/route.ts:102-140`.
   Writes both `money_hub_category_overrides` and
   `bank_transactions.user_category`. PR #141 extended this to clear
   stale overrides and flag positive-amount txns as `credit_loan`. Still
   does **not** propagate to `subscriptions.category` on the matching row.
3. **Auto-detected subscriptions** — `src/lib/detect-recurring.ts:273-282`.
   Snapshot insert: `amount = average of matched txns`, `category = rule
   lookup`. No link stored back to the txns that generated it; no
   re-detection after the fact.
4. **Manual subscription CRUD** — `src/app/api/subscriptions/route.ts:55-159`.
   User-edited `amount`, `billing_cycle`, `next_billing_date` never
   validated against bank data.
5. **Savings goals** — `money_hub_savings_goals.current_amount` is
   manually edited. `linked_account_id` is written but never read by any
   sync code. Goals will never auto-advance.
6. **Price-increase alerts** — `src/app/api/price-alerts/detect/route.ts`.
   Snapshot insert. No background re-scan when the "new amount" txn is
   deleted or refunded.

## 4. Concrete drift risks a user will notice

1. **Delete bank connection → phantom subscriptions.**
   `bank_transactions.connection_id` cascades on delete (migration
   `20260321130000_open_banking.sql:26`), but the `subscriptions` table
   has no link to `bank_connections` — only a `source='bank'` flag. The
   subscriptions keep showing, renewal emails keep firing.
2. **Save for £5 000 holiday → goal never moves.**
   `money_hub_savings_goals.linked_account_id` is written at creation,
   never read. `current_amount` is manual. The linked balance sits in
   `bank_connections.current_balance` and is never reconciled.
3. **Reclassify Spotify → Money Hub shows streaming, Subscriptions still says software.**
   Override propagation stops at `bank_transactions`; the
   `subscriptions.category` set by `detect-recurring.ts:273-282` is
   write-once.
4. **Price increase alert goes stale.**
   Netflix £10 → £12 alert created on 1 Apr. Netflix bills £14 on 20 Apr.
   Alert still displays £10 → £12 because `detect/route.ts` only inserts
   new alert rows, never updates existing.
5. **Gym subscription amount goes stale.**
   Auto-detect averages the first N txns and freezes the number at
   `src/lib/detect-recurring.ts:263`. No post-sync job re-averages.
6. **Renewal email on wrong date.**
   User manually sets `next_billing_date = 15 May`. Bank charges on 10
   May. `src/app/api/subscriptions/route.ts:24-45` only advances the
   date if it's already in the past — it ignores live txns.
7. **Refunded txn still feeds income / category totals.**
   If a charge comes in then gets reversed, both rows are in
   `bank_transactions`. The classifier counts both. No reconciliation
   logic for refund pairs.
8. **RPC categoriser ignores overrides on first render after sync.**
   New txn arrives via `auto_categorise_transactions`, gets a generic
   category, ignores `money_hub_category_overrides` on the merchant.
   Money Hub next GET re-resolves via JS and fixes it — but a report
   generator or email that runs between sync and next GET sees the
   wrong category.
9. **Dedup split-brain.** RPC dedup
   (`deduplicate_bank_transactions`) and JS dedup
   (`src/app/api/money-hub/route.ts:29-40`) run with independent rules.
   Low-probability but possible: one removes row A, other removes row B,
   both think they won.
10. **Subscription collapse on near-duplicate merchants.**
    `src/lib/detect-recurring.ts:206-236` merges at 60% keyword overlap,
    so "NETFLIX INC" and "NETFLIX FAMILY UK" can collapse into one row.
    Budget and alerts then operate on the wrong amount.

## 5. Recommended fixes, prioritised

| # | Fix | Prevents | Effort | Key files |
|---|---|---|---|---|
| 1 | Add bidirectional link: new `subscription_id` FK on `bank_transactions` (or join table). On reclassify, propagate to linked subscription. On connection delete, cascade. | Risks 1, 3, 5 | L | migration, `detect-recurring.ts`, `money-hub/recategorise/route.ts` |
| 2 | Cascade delete / orphan flag when `bank_connections` is removed. | Risk 1 | S | migration + delete route |
| 3 | Post-sync RPC `sync_goal_balances(p_user_id)` that pushes `bank_connections.current_balance` into `money_hub_savings_goals.current_amount` where `linked_account_id` matches. | Risk 2 | M | new migration; wire into `sync-now/route.ts:480-485` |
| 4 | Re-run price-increase detection each sync: RPC updates existing active alerts rather than only inserting new rows. | Risk 4 | M | `detectPriceIncreases` → RPC; call post-sync |
| 5 | Post-sync `update_subscription_amounts` RPC that re-averages `source='bank'` subscriptions when variance > ~15 %. | Risk 5 | M | migration + sync call |
| 6 | Auto-advance `next_billing_date` from the most recent matching txn when `source='bank'`, rather than only on past-date rollover. | Risk 6 | S | `subscriptions/route.ts:24-45` |
| 7 | Pair refund txns in the classifier: when a positive-amount credit matches a prior negative within N days at the same merchant, exclude both from totals. | Risk 7 | M | `money-hub-classification.ts` |
| 8 | Unify overrides with RPC: teach `auto_categorise_transactions` to read `money_hub_category_overrides` so first render is right. | Risk 8 | S | migration (RPC) |
| 9 | Pick one dedup owner. Either delete JS dedup and rely on the RPC, or the other way. Document the invariant. | Risk 9 | S | `money-hub/route.ts:29-40` or migration |
| 10 | Raise the subscription merge threshold from 60 % → 80 % overlap **and** require matching billing cycle + amount band. | Risk 10 | S | `detect-recurring.ts:228-232` |

Start with #2 (phantom subscriptions) and #6 (billing-date drift) — both
are small, both visible to every paying user this week. #1 and #3 are the
bigger architectural wins; they are most of the way to "OB is the only
source of truth" as a property of the system.

## Appendix — things **not** at risk

- Money Hub totals, chat tools, Telegram tool handlers — all re-derive
  from `bank_transactions` on every request using the same classifier.
  The issue is only with tables that **persist** derived state.
- Complaint letter generator — pulls txn details on-demand, never caches.
- Dispute timeline — stores its own records (emails, notes), not derived
  from OB.
