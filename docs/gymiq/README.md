# gymIQ bank feed — reference copies

Nothing in this directory is part of the Paybacker build. It is excluded
from `tsconfig.json` (the edge function targets Deno, not Next.js) and
nothing under `src/` imports it.

It lives here because the code deployed to the **gymIQ** Supabase project
(`fugixpfgwhnmhtttdzym`) depends on two changes made on the **Paybacker**
side, and a reviewer needs to see both halves together:

1. `bank_connections.balance_sync_enabled` +
   `src/lib/yapily/balance-sync.ts` — the first code in the repo that
   actually writes `current_balance` / `available_balance`.
2. `dedupe_key` (Paybacker's `stable_tx_hash`) on the
   `/api/mcp/transactions` response — the only safe idempotency key for
   an external mirror, since Yapily reissues its own transaction ids.

## Surface note

Per `CLAUDE.md`, Paybacker ships two products from one repo and they must
not be mixed. The gym feed is a **third** thing: a separate business
(JPG Operations Ltd / énergie Fitness Hoddesdon) that consumes Paybacker
as a customer, over the public per-user MCP API, with a scoped `pbk_`
read token. It gets no special access, no service-role path, and no code
inside `src/`. If that ever stops being true, it has become a product
feature and belongs in a proper surface with its own tier model.

## Shape

```
HSBC Business (JPG Operations Ltd)
        │  Yapily AIS consent, held by Paybacker
        ▼
Paybacker  bank_connections / bank_transactions
        │  GET /api/mcp/accounts      (balances)
        │  GET /api/mcp/transactions  (ledger, dedupe_key)
        │  Bearer pbk_… read token, Pro-gated
        ▼
gymIQ  club-bank-sync edge function
        ▼
       club_bank_accounts · club_bank_transactions · club_bank_sync_log
        ▼
       club_bank_position · club_bank_weekly_flows · club_bank_monthly_flows
        ▼
       Wednesday cash tracker · monthly membership + bonus report
```

## Operating notes

- **Consent expires.** PSD2 requires the account holder to reconfirm at
  least every 90 days. When `club_bank_position.consent_status` stops
  being active, the feed goes quiet and Paul must re-authorise in
  Paybacker. The reporting tasks must say "feed down", never fall back to
  a stale figure.
- **A stale balance is not today's balance.** Always check
  `club_bank_position.balance_is_stale` before quoting cash.
- **The mirror never writes back.** Paybacker is upstream and read-only
  from gymIQ's point of view.
- **`cash_stream` is a heuristic.** `classifyCashStream()` buckets on
  description text and leaves anything unrecognised as `other`. Manual
  corrections made in gymIQ survive re-runs, because the transaction
  upsert uses `ignoreDuplicates`.
