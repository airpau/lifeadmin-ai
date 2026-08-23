# Runbook — connecting JPG Operations Ltd HSBC Business to the gym reports

> **Status 23 Aug 2026, 16:30.** Account created, bank connected, token
> stored, gymIQ side fully deployed. The feed is **blocked on deploying
> the Paybacker MCP changes** — see "What's blocking the feed" below.

## The four accounts on this connection

HSBC returns the same display name, "JPG OPERATIONS LIMITED", for all
four, so nothing in the account list distinguishes them. Identified from
transaction patterns instead:

| Ref | What it actually is | Evidence |
|---|---|---|
| `••••Xrvw` | **Trading current account** | 1,794 transactions, £723k in / £736k out over 12 months |
| `••••gewA` | Savings / deposit | 3 transactions: "GROSS INTEREST", a £15,000 transfer out and back |
| `••••fRem` | Credit card | monthly "INTEREST" charges, "DIRECT DEBIT PAYMENT - THANK YOU" repayments |
| `••••Kozp` | Credit card | "ANNUAL FEE", card purchases |

Two things to note. There are **no loan accounts** in what came through,
despite the connection being described as containing two — worth checking
whether HSBC withheld them or they simply aren't on this profile. And the
two card accounts **duplicate each other's transactions**: the same Thorpe
Park £270 on 22 Aug and Savers £25.94 on 15 Aug appear on both.

Only `••••Xrvw` feeds the cash figures. The rest are mirrored into
`club_bank_other_accounts` for reference and excluded from every flow
view, because card debt is not negative cash and duplicated card lines
would double-count real spend.


Built 23 Aug 2026. Everything on the gymIQ side is already deployed and
live. What remains needs you, because open banking consent can only be
given by the account holder authenticating with HSBC.

---

## What's already done

**Paybacker side** (code written, NOT yet committed — see "Landing the
code" at the bottom):

| Change | File |
|---|---|
| `bank_connections.balance_sync_enabled` column | `supabase/migrations/20260823120000_bank_balance_sync_opt_in.sql` — **applied to the live DB** |
| Balance resolver + writer | `src/lib/yapily/balance-sync.ts` (new) |
| `accountBalances` on the Yapily account type | `src/types/yapily.ts` |
| Balance refresh hooked into the sync cron | `src/app/api/cron/bank-sync/route.ts` |
| `dedupe_key` + `account_ref` + `?account_ref=` filter on MCP transactions | `src/app/api/mcp/transactions/route.ts` |
| Per-account balances and real Yapily account types | `supabase/migrations/20260823140000_bank_account_balances.sql` — **applied to the live DB** |
| Per-account balances + `balance_class` on MCP accounts | `src/app/api/mcp/accounts/route.ts` |

**gymIQ side** (project `fugixpfgwhnmhtttdzym`) — all live:

- Tables `club_bank_accounts`, `club_bank_transactions`,
  `club_bank_sync_log`, `club_bank_credentials`. RLS on, no policies:
  service role only, same pattern as `glofox_tokens`.
- Views `club_bank_position`, `club_bank_weekly_flows`,
  `club_bank_monthly_flows`.
- Edge function `club-bank-sync` (v1, `verify_jwt: true`).

**Scheduled tasks:**

- `wednesday-cash--growth-tracker---energie-hoddesdon` — rewritten to
  pull the real balance instead of asking you for it, and to verify
  banked cash against the 80% payout expectation.
- `club-bank-feed-daily-sync` — new, 07:15 daily. Silent when healthy,
  Telegram alert when the feed breaks, goes stale, or consent nears
  expiry.

---

## What's blocking the feed

Everything is wired except one thing: **paybacker.co.uk is running the
old code.** The live `/api/mcp/accounts` returns `account_type:
"business_current"` for all four accounts, including both credit cards,
and `/api/mcp/transactions` has neither `dedupe_key` nor `account_ref`.

Against that deployment the sync would ignore the account filter, drop
every transaction for want of a dedupe key, and log a cheerful success
with zero rows — which reads exactly like a quiet trading week. The edge
function now has a **version guard** that detects the old API and fails
loudly rather than doing that.

So: deploy the Paybacker changes, then the feed comes alive on its own at
the next 07:15 run. Nothing else needs touching.

---

## Done already (no action needed)

- Paybacker account `paul.airey@energiefitness.com`, user
  `23639bd3-47e3-4dd9-80af-71b012821f52`, set to **pro / active**.
  Verified it won't silently revert: `getUserPlan` trusts the stored tier
  unless the status is a terminated one, and `process-downgrades` only
  acts on `plan_downgrade_events` rows the Stripe webhook creates. No
  Stripe subscription exists, so nothing can create one.
- HSBC Business connected, `cc647c8f-326d-43cf-a299-23eb9e05acb2`.
  12 months of history already synced: 1,842 transactions.
  Consent expires **21 Nov 2026**.
- `is_business = true` and `balance_sync_enabled = true` set on it.
- MCP token stored in `club_bank_credentials` with its real expiry
  (**19 Feb 2027**), so a dead token is diagnosable rather than
  mysterious.

---

## Original setup steps (kept for the next club)

### 1. Create the gym's Paybacker account

Sign up at **paybacker.co.uk** with **paul.airey@energiefitness.com**.
There is no account on that address yet (checked).

Keep it separate from your personal Paybacker account on purpose: the
MCP token is user-scoped and `/api/mcp/transactions` returns everything
that user can see. A shared account would mirror your personal spending
into the gym database.

### 2. Tell me when it exists

I'll then run three updates you can't do from the UI:

```sql
-- Pro tier: MCP access is Pro-gated, and Pro also lifts the bank cap
-- and puts the connection on the 4-hourly sync cycle instead of the
-- free tier's Mondays-only.
update profiles set subscription_tier = 'pro', subscription_status = 'active'
where id = '<new user id>';
```

Then, after step 3, on the resulting connection row:
`is_business = true` (so income classification treats énergie payouts as
client payments, not salary) and `balance_sync_enabled = true`.

### 3. Connect the bank

In the Paybacker dashboard, connect a bank and pick **HSBC Business** in
the Yapily picker. Authenticate as JPG Operations Ltd.

HSBC Business is already in live use on this Yapily integration
(`hsbcbusiness_uk`), so the institution side is proven — including the
signed-amount handling that was fixed on 14 May 2026 when HSBC Business
was showing £0 income.

### 4. Mint an MCP token

`paybacker.co.uk/dashboard/settings/mcp` → generate a read token. The
`pbk_…` value is shown **once**, never stored in plaintext. Send it to me
and I'll insert it into `club_bank_credentials` with its 180-day expiry
recorded, so a dead token is diagnosable rather than mysterious.

### 5. First run

Trigger `club-bank-feed-daily-sync` manually. Then run the Wednesday
tracker manually once, to pre-approve the tools it needs so a future
scheduled run doesn't stall on a permission prompt.

---

## Two things to go in with your eyes open

**The Yapily licence question.** Paybacker's Yapily production access was
approved for Paybacker's own consumer product. You'd be using it as the
AISP pipe for a *different legal entity's* business account — JPG
Operations Ltd, not you personally, not a Paybacker consumer. Technically
this is just an AIS consent like any other, and the account holder
(you, as director) is giving it freely. Commercially it's worth a
one-line heads-up to Migle rather than discovering it during a review.
It is also, incidentally, a real B2B use case: "operator connects their
own business account and gets automated cash reporting" is a product,
not a workaround.

**The 90-day clock.** PSD2 requires the account holder to reconfirm
consent at least every 90 days. This feed *will* go quiet roughly
quarterly until you re-authorise. That's expected maintenance, not a
fault — and it's why the daily task alerts 14 days ahead of expiry, and
why every consuming report is instructed to say "feed down" rather than
quoting a stale balance. A silent bank feed looks exactly like a quiet
trading week, which is the single most dangerous failure mode here.

---

## Landing the code

The Paybacker changes are in the working tree but **not committed**. The
repo is on `feat/yapily-stagger-consent-reconfirm` with roughly sixty
files of unrelated in-flight work, and `bank-sync/route.ts`,
`mcp/transactions/route.ts` and `types/yapily.ts` all show staged *and*
unstaged modifications — my edits are interleaved with that other work in
the same files. Splitting them apart would be guesswork, and CLAUDE.md is
explicit that a deploy needs a clean git state.

`npx tsc --noEmit` passes on the full tree as it stands.

Simplest path: land these alongside the rest of the Yapily branch work
when you commit it. The migration is already applied to the live
database, and the column defaults to `false`, so nothing changes
behaviour for any existing connection until the code ships and that one
connection is flagged.
