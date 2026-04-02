# Paybacker Memory — Last Updated 2026-04-01

## Critical Facts
- **Product**: Paybacker (NOT LifeAdmin AI), domain: paybacker.co.uk
- **Type**: Web-based PWA (NOT an app)
- **Supabase project**: kcxxlesishltdmfctlmo
- **Paul's user_id**: 64a7d7bf-dd1f-48ae-8468-0c7244f29db1
- **No longer using Antigravity** — too expensive. All frontend changes need alternative implementation.
- **Frontend monolith**: `src/app/dashboard/money-hub/page.tsx` — ~2,903 lines

## EE Card Issue
- Cards 4239, 7209, 9384 on account 84e1a1a0ef4e9454c10699cd96a7e716 are EE-branded
- Open Banking returns "EE" as merchant_name for ALL transactions on these cards
- Description format: `{4digitCard} {2digitDay}{3charMonth}{2digitYear} {CD|D} {ACTUAL_MERCHANT} {LOCATION} {COUNTRY}`
- **Fixed**: `extract_merchant_from_description()` and `fix_ee_card_merchant_names()` deployed
- **75 transactions fixed**, 0 remaining with merchant_name = 'EE'
- **Bank-sync edge function still needs updating** to call fix_ee_card_merchant_names after each sync

## Category System
- Canonical categories: transfers, income, bills, shopping, groceries, mortgage, loans, tax, council_tax, energy, water, broadband, mobile, insurance, professional, software, eating_out, fitness, fuel, transport, streaming, entertainment, security, storage, music, other
- **'transfer' (singular) is WRONG** — always use 'transfers' (plural)
- **Spending excludes**: user_category IN ('transfers', 'income') and category = 'TRANSFER'
- 630 transactions still have NULL user_category (all spending) — these show as "other" on frontend

## Database Functions Deployed
| Function | Purpose |
|----------|---------|
| `extract_merchant_from_description(text)` | Parse real merchant from bank description |
| `fix_ee_card_merchant_names(uuid)` | Fix EE-branded card merchant names |
| `detect_and_sync_recurring_transactions(uuid)` | Scan & flag recurring, auto-create subscriptions |
| `get_expected_bills(uuid, int, int)` | Deduplicated expected bills, excludes dismissed |
| `dismiss_expected_bill(uuid, text, int, int)` | Persist bill dismissal to DB |
| `restore_expected_bill(uuid, text, int, int)` | Restore a dismissed bill |
| `apply_all_category_overrides(uuid)` | Backfill all overrides to bank_transactions |
| `get_monthly_spending(uuid, int, int)` | Spending by category, excludes transfers/income |
| `get_monthly_spending_total(uuid, int, int)` | Single spending total for a month |

## Database Triggers Deployed
- `trg_apply_category_override` — AFTER INSERT on money_hub_category_overrides → updates matching bank_transactions.user_category
- `trg_apply_category_override_update` — AFTER UPDATE on money_hub_category_overrides → same

## Tables Created
- `dismissed_expected_bills` — persists bill dismissals (replaces broken localStorage)
  - Columns: id, user_id, bill_key, bill_month (NULL = permanent), dismissed_at
  - RLS enabled, indexed on (user_id, bill_month)

## Data Fixes Applied (2026-04-01)
1. Paratus AMC: 11 transactions → user_category = 'mortgage' (was 'bills')
2. EE merchant names: 75 transactions fixed
3. Missing subscriptions added: Starlink (£56.36), Loqbox (£31.96), Lunchflow (£10.99)
4. 3 bogus EE subscription entries deleted
5. 7 false-positive auto-detected subscriptions deleted
6. 5 duplicate subscriptions deleted
7. Revolut card top-ups: 10 transactions → 'transfers' (was shopping/groceries)
8. 'transfer' normalised to 'transfers': 14 transactions
9. Category overrides backfilled: 42 transactions updated
10. TRANSFER category bulk fix: 295 transactions → user_category = 'transfers'
11. Airbnb/CREDIT income fix: 316 transactions → user_category = 'income'
12. Amazon shopping fix: 67 transactions → user_category = 'shopping'
13. Batch merchant categorisation: 517 transactions (mortgages, loans, tax, bills, etc.)
14. Remaining income fix: 20 transactions → user_category = 'income'

## Spending Accuracy
- February 2026 was showing £76,723.43 — £54K of transfers were being counted
- After fixes: £20,618.55 (correct, verified against category breakdown)
- The `get_monthly_spending_total()` function is the source of truth



## Subscription System Fixes (2026-04-01)
- `get_subscription_total(uuid)` — returns {monthly_total, annual_total, active_count}
- `dismiss_subscription(uuid, uuid)` — dismisses + returns updated totals
- `cancel_subscription(uuid, uuid)` — cancels + returns updated totals
- `get_subscriptions_with_actions(uuid)` — returns all active subs with cancellation_url/email/phone from merchant_rules
- `generate_cancellation_email(uuid, uuid)` — generates cancellation email template for any sub
- 32 of 38 active subscriptions now have cancellation contact data in merchant_rules
- Remaining without: council tax (4), BBLS Loan (1), Plex (1 - matching quirk)

## Frontend Fix Documents
- `/mnt/outputs/money-hub-fixes.md` — expected bills dismiss persistence patches
- `/mnt/outputs/paybacker-frontend-fixes.md` — COMPLETE guide for all frontend changes
- `/mnt/outputs/claude-code-subscription-fixes-prompt.md` — subscription detection & EE card fix prompt
