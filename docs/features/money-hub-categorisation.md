# Money Hub categorisation — standardisation plan

Written 2026-04-23 after a full-pipeline audit triggered by user
feedback that "categorisation is breaking" and a request to match
Emma's level of trust.

## Current state (pre-PR)

Categorisation data flows through five distinct taxonomies that
don't agree with each other:

| Source | Location | Category count | Role |
|---|---|---|---|
| **Config** | `src/lib/category-config.ts` — `CATEGORY_CONFIG` | 26 | Drives UI labels/icons/colours |
| **Fallback detector** | `src/lib/money-hub-classification.ts` — `detectFallbackSpendingCategory()` | ~15 keyword regexes | Classifies uncategorised txns at display time |
| **Subscription detector** | `src/lib/detect-recurring.ts` — `CATEGORY_KEYWORDS` | 13 | Tags newly-detected subscription rows |
| **Chatbot tools** | `src/lib/chat/tools/money-hub.ts` | 16 hard-coded strings | Parses user prompts ("show groceries") |
| **Spending API labels** | `src/app/api/spending/route.ts` — `CATEGORY_LABELS` | 27 | Emoji + colour for spending breakdown chart |

The 5 taxonomies disagreed in 4 places before this PR:

1. Detector returned `groceries` / `eating_out` — **not in `CATEGORY_CONFIG`** → UI showed generic title-case labels.
2. Detector returned `shopping` — **not in `CATEGORY_CONFIG`** → same.
3. Detector returned `energy`; config only had `utility`; alias table pointed `utility → energy` but `energy` had no config entry, creating a two-way loop that rendered both labels on different screens.
4. Config key `loan`, detector returned `loans`; alias `loan → loans` (wrong direction).

## This PR

Targeted fixes only — no database changes, no migration, no removal
of existing keys (CLAUDE.md additive-only rule).

- Added **five missing keys** to `CATEGORY_CONFIG`: `groceries`,
  `eating_out`, `shopping`, `energy`, `loans`. Each gets an
  appropriate Lucide icon + tonal colour.
- Rewrote **`SPENDING_CATEGORY_ALIASES`** so every alias target is
  now a key that exists in `CATEGORY_CONFIG`. Documented the
  invariant in a comment at the top of the map.
- Added **four new aliases** (`dining`, `restaurants`, `supermarket`,
  `supermarkets`) so bank-provided raw categories map to the
  detector's canonical keys.

## What this fixes today

| Symptom | Before | After |
|---|---|---|
| Tesco / Sainsbury's / Asda show as "groceries" on overview but generic "Groceries" (different casing) on drill-down | Separate rows | Single row with shopping-cart icon |
| British Gas / Octopus / EDF show "Energy" in one view, "Utilities" in another | Split | Config now has both; aliases normalise to one |
| Amazon / eBay / Argos show unstyled "Shopping" label with generic "Other" icon | Broken | Proper shopping-bag icon |
| Zopa / Funding Circle tagged `loans` render via title-case fallback | Uppercase drift | Proper "Loans" with banknote icon |

## Follow-up (separate PR)

The full Emma-parity rewrite is tracked as roadmap work, not shipped
here:

1. **Merchant rules table.** Migrate the regex tree in
   `detectFallbackSpendingCategory()` + `CATEGORY_KEYWORDS` into a
   `merchant_rules` database table with deterministic (confidence =
   100) seeds for the top 500 UK merchants. Every categorisation
   call hits the table, not hard-coded regexes.
2. **Single override read path.** Introduce a shared
   `resolveCategory(txn)` helper used by every API route. Audit
   confirms `/api/spending` already consults the overrides table,
   but the chatbot's Money Hub tool path bypasses it — fix that.
3. **Learning-engine hardening.** Tighten the pattern matcher
   (currently a bidirectional substring match which over-matches
   e.g. `TESCO` → `SAINSBURY TESCO CLUBCARD`). Switch to exact
   merchant key or Levenshtein ≤ 2.
4. **Non-greedy transfer heuristic.** `applyInternalTransferHeuristic`
   at `money-hub-classification.ts:262` flags any ≥£500 transaction
   with a transfer keyword as internal, which mis-tags genuine
   salary credits on the same day as a £500 furniture purchase.
   Scope by account pair + reference match, not amount.
5. **Bank-data normalisation.** Some banks send all-caps
   `BILL_PAYMENT`, others `bill_payment`, others `Bill Payment`.
   Canonicalise at the sync boundary (inside
   `/api/cron/bank-sync`) rather than apologising for it five
   layers later.

## Invariant we now enforce

> Every category string returned by any backend module MUST be
> a key in `CATEGORY_CONFIG`. Aliases in
> `SPENDING_CATEGORY_ALIASES` MUST have a value that is a key in
> `CATEGORY_CONFIG`. Violating these makes the UI render the
> generic title-case fallback, which is the symptom users
> describe as "broken categorisation".

A lint step that fails CI if either invariant is broken is on the
roadmap.
