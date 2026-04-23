# Upcoming Payments

Emma/HSBC-style "incoming payment arriving tomorrow" feed across every
connected bank account. Rolled out 2026-04-23.

## What it surfaces

Per connected Yapily account, a unified feed over the next 7 / 14 / 30
days containing:

| Source | Badge | Confidence |
|---|---|---|
| `pending_credit` — incoming credit with bookingStatus `PENDING` | Confirmed (mint) | 1.00 |
| `pending_debit` — outgoing debit with bookingStatus `PENDING` | Confirmed (mint) | 1.00 |
| `scheduled_payment` — one-off future-dated transfers | Scheduled (blue) | 1.00 |
| `standing_order` — periodic payments | Scheduled (blue) | 1.00 |
| `direct_debit` — direct debits | Scheduled (blue) | 1.00 |
| `predicted_recurring` — pattern-detected from 180d history | Predicted (grey + %) | ≥ 0.60 |

## Data sources (all Yapily, server-side only)

1. `GET /accounts/{accountId}/scheduled-payments`
2. `GET /accounts/{accountId}/periodic-payments`
3. `GET /accounts/{accountId}/direct-debits`
4. `GET /accounts/{accountId}/transactions?bookingStatus=pending`
5. Local `bank_transactions` history (last 180 days) → recurrence
   detector.

Feature scopes required on the Yapily consent:

- `ACCOUNT_SCHEDULED_PAYMENTS`
- `ACCOUNT_PERIODIC_PAYMENTS`
- `ACCOUNT_DIRECT_DEBITS`
- `ACCOUNT_TRANSACTIONS`
- `ACCOUNT_TRANSACTIONS_WITH_MERCHANT`
- `ACCOUNT_BALANCES`

These are now passed on every new consent created by `/api/auth/yapily`.
Existing connections continue to work on their original scope set; the
expanded scope applies from the next 90-day renewal onward.

## Bank support matrix for pending transactions

Yapily normalises most endpoints across institutions, but
`bookingStatus=pending` is bank-dependent. The production sync is
designed to degrade gracefully — if the bank's consent doesn't expose
pending transactions, we log one line and continue with the other
three sources.

| Bank | Scheduled payments | Periodic payments (SOs) | Direct debits | Pending transactions |
|---|:-:|:-:|:-:|:-:|
| **HSBC** | ✅ | ✅ | ✅ | ✅ |
| **Starling** | ✅ | ✅ | ✅ | ✅ |
| **Monzo** | ✅ | ✅ | ✅ | ❌ (books immediately; no pending state exposed) |
| **Barclays** | ✅ | ✅ | ✅ | ⚠️ Returns pending only for card transactions; BACS credits land settled |
| **Lloyds** | ✅ | ✅ | ✅ | ⚠️ Same as Barclays (Lloyds Banking Group) |
| **NatWest** | ✅ | ✅ | ✅ | ⚠️ Intermittent — depends on AIS product variant |
| **Santander** | ✅ | ✅ | ✅ | ❌ Pending flag not exposed on AIS |
| **Nationwide** | ✅ | ✅ | ✅ | ❌ No pending status on transactions endpoint |

Legend:

- ✅ reliably returns data matching the schema we expect
- ⚠️ returns data but with known caveats
- ❌ endpoint responds with empty / 404 / unsupported on most
  consents — our wrapper catches the error, logs one line, and
  continues

**Status is verified against the Yapily developer docs and the
behaviour of the above-listed institutions' AIS products as of
April 2026.** The sync runs daily; any shift in a bank's support is
observable in `business_log` (`event_type = 'upcoming_payments_sync'`)
as the `pendingEndpointsFailed` counter.

## Where it renders

- **Widget** on `/dashboard/money-hub`: "Next 7 days" card with net
  in-minus-out headline and a mint "Arriving tomorrow" strip when
  at least one confirmed incoming is expected tomorrow.
- **Full page** at `/dashboard/money-hub/upcoming`: timeline view
  with 7 / 14 / 30-day windows, per-account filter, and a "Include
  predicted" toggle.

## Running the feature

| Piece | Path |
|---|---|
| Migration | `supabase/migrations/20260423000000_upcoming_payments.sql` |
| Yapily wrapper | `src/lib/yapily/upcoming.ts` |
| Recurrence detector | `src/lib/upcoming/detect-recurring.ts` |
| Detector tests | `src/lib/upcoming/detect-recurring.test.ts` |
| Daily sync cron | `src/app/api/cron/sync-upcoming/route.ts` (06:00 UTC) |
| List API | `src/app/api/money-hub/upcoming/route.ts` |
| Widget | `src/app/dashboard/money-hub/UpcomingWidget.tsx` |
| Full page | `src/app/dashboard/money-hub/upcoming/page.tsx` |

The sync job logs a row per run to `business_log` with counters for
deterministic / predicted upserts, stale rows pruned, and pending
endpoints skipped.

### Running the tests

```bash
node --experimental-strip-types --test src/lib/upcoming/detect-recurring.test.ts
```

Nine unit tests, all pass as of 2026-04-23. No jest / vitest devDep
was added — the tests use Node's built-in runner.
