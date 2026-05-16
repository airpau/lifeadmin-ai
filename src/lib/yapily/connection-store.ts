/**
 * Yapily-only persistence layer for bank connections + transactions.
 *
 * Two operations matter here:
 *
 *   upsertYapilyConnection
 *     Called by the OAuth callback + the re-authorise flow. Looks for
 *     an existing live connection that matches the user's institution
 *     and at least one of the account hashes Yapily just returned. If
 *     one exists, it's UPDATED in place (consent rotated, account list
 *     refreshed, status reactivated). If none exists, a fresh row is
 *     inserted. This is the single point that prevents duplicate
 *     bank_connections rows for the same real-world bank.
 *
 *   upsertYapilyTransactions
 *     Called by the initial-sync + the periodic bank-sync cron.
 *     Computes account_identifications_hash + stable_tx_hash for every
 *     incoming transaction, pre-filters against rows already in the DB
 *     for the same (user, account_hash, stable_tx_hash) tuple, and
 *     inserts only the new ones. Pre-filter is needed because Postgres
 *     ON CONFLICT against partial unique indexes is finicky — checking
 *     first and inserting only the survivors is simpler, atomic per
 *     batch, and matches the invariant exactly.
 *
 * Invariant after both operations have run:
 *   For every (user_id, account_identifications_hash, stable_tx_hash)
 *   there is exactly one row in bank_transactions WHERE deleted_at IS
 *   NULL. The DB-level partial UNIQUE index from
 *   20260427210000_yapily_stable_keys_phase_a.sql enforces this even if
 *   the application layer has a bug.
 */

import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import { encrypt } from '@/lib/encrypt';
import { buildAccountIdentificationsHash, buildStableTxHash } from '@/lib/yapily/transaction-keys';
import { buildYapilyAccountDisplayName } from '@/lib/yapily';
import type { YapilyAccount, YapilyTransaction } from '@/types/yapily';

function getAdmin(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export interface AccountSnapshot {
  yapilyAccountId: string;
  displayName: string;
  accountIdentificationsHash: string | null;
  accountIdentificationsRaw: Array<{ type: string; identification: string }>;
  currency: string;
}

/**
 * Project a Yapily account list into the snapshot shape the rest of
 * this module operates on. Computed once in the callback, passed to
 * the sync — keeps the hashing logic in one place.
 *
 * Suppresses Monzo "POT" accounts. Per Yapily docs (Vitally GA2):
 * Monzo doesn't return transaction data for type=POT, so they show
 * up as ghost accounts in the UI with eternally-empty histories.
 * We hide them here so they never enter bank_connections.account_ids,
 * never appear in the dashboard, and aren't fetched by any sync.
 */
export function snapshotAccounts(accounts: YapilyAccount[]): AccountSnapshot[] {
  return accounts
    .filter((a) => {
      const t = (a.type ?? '').toUpperCase();
      const at = (a.accountType ?? '').toUpperCase();
      const isPot = t === 'POT' || at === 'POT';
      if (isPot) {
        console.log(`[yapily.snapshotAccounts] skipping Monzo POT account id=${a.id}`);
      }
      return !isPot;
    })
    .map((a) => ({
      yapilyAccountId: a.id,
      displayName: buildYapilyAccountDisplayName(a),
      accountIdentificationsHash: buildAccountIdentificationsHash(a.accountIdentifications || []),
      accountIdentificationsRaw: a.accountIdentifications || [],
      currency: a.currency || 'GBP',
    }));
}

export interface ConnectionUpsertInput {
  userId: string;
  institutionId: string;
  bankName: string | null;
  consentToken: string;
  yapilyConsentId: string;
  /**
   * Hosted Pages flow only — the consentRequestId Yapily returned from
   * POST /hosted/consent-requests. Distinct from yapilyConsentId; we
   * keep both so the renew flow keeps using consentId while the
   * abandonment poller uses consentRequestId. Optional so the legacy
   * /account-auth-requests path stays a no-op.
   */
  yapilyConsentRequestId?: string | null;
  consentExpiresAt: string;
  accounts: AccountSnapshot[];
}

export interface ConnectionUpsertResult {
  connectionId: string;
  reused: boolean;
  previousConnectionIds: string[];
}

/**
 * Lookup-or-merge a Yapily consent into bank_connections.
 *
 * Match rules, in order:
 *   1. Same user_id + same institution_id + at least one
 *      account_identifications_hash overlaps a stored hash on a live
 *      connection (NOT deleted, NOT revoked). This is the strongest
 *      signal — same bank, same real-world account.
 *   2. If no overlap is found but the user already has a live
 *      connection at this institution with NULL hashes (legacy /
 *      partially-migrated row), reuse it and stamp the new hashes.
 *   3. Otherwise insert a new row.
 *
 * Stale active rows for the same institution+account that DON'T match
 * the new hashes are flipped to status='revoked_duplicate' so the
 * Money Hub doesn't double-count their transactions.
 */
export async function upsertYapilyConnection(
  input: ConnectionUpsertInput,
): Promise<ConnectionUpsertResult> {
  const admin = getAdmin();
  const incomingHashes = input.accounts
    .map((a) => a.accountIdentificationsHash)
    .filter((h): h is string => !!h);
  const incomingAccountIds = input.accounts.map((a) => a.yapilyAccountId);
  const incomingDisplayNames = input.accounts.map((a) => a.displayName);

  // 1. Find every live connection at this institution for this user.
  const { data: existing } = await admin
    .from('bank_connections')
    .select('id, status, account_ids, account_identifications_hashes, yapily_consent_id, deleted_at')
    .eq('user_id', input.userId)
    .eq('institution_id', input.institutionId)
    .is('deleted_at', null);

  const live = (existing ?? []).filter(
    (c: { status: string }) => c.status !== 'revoked' && c.status !== 'revoked_duplicate' && c.status !== 'archived',
  ) as Array<{
    id: string;
    status: string;
    account_ids: string[] | null;
    account_identifications_hashes: string[] | null;
    yapily_consent_id: string | null;
  }>;

  // 2. Pick a row to merge into. Prefer hash-overlap; else pick the
  //    most recently-updated live row at this institution; else null.
  const overlapMatch = live.find((c) => {
    const stored = c.account_identifications_hashes ?? [];
    return stored.some((h) => h && incomingHashes.includes(h));
  });
  const consentMatch = !overlapMatch && live.find((c) => c.yapily_consent_id === input.yapilyConsentId);
  const fallbackLive = !overlapMatch && !consentMatch ? live[0] : null;
  const target = overlapMatch ?? consentMatch ?? fallbackLive ?? null;

  const now = new Date().toISOString();
  const previousConnectionIds: string[] = [];

  if (target) {
    // 3a. Update the matched row in place. Replace account list with
    //     the latest snapshot — this naturally handles the case where
    //     the user added or removed an account during reconnect.
    const { error } = await admin
      .from('bank_connections')
      .update({
        provider: 'yapily',
        institution_id: input.institutionId,
        bank_name: input.bankName,
        consent_token: encrypt(input.consentToken),
        yapily_consent_id: input.yapilyConsentId,
        ...(input.yapilyConsentRequestId !== undefined
          ? { yapily_consent_request_id: input.yapilyConsentRequestId }
          : {}),
        consent_granted_at: now,
        consent_expires_at: input.consentExpiresAt,
        // Reset the single-use tracking flag — a reconnect means a new
        // consent, so the upcoming-payments endpoints become callable
        // again. Null is the "ready to pull" sentinel the cron checks.
        upcoming_endpoints_fetched_at: null,
        account_ids: incomingAccountIds,
        account_display_names: incomingDisplayNames,
        account_identifications_hashes: incomingHashes.length === incomingAccountIds.length
          ? incomingHashes
          : input.accounts.map((a) => a.accountIdentificationsHash ?? ''),
        status: 'active',
        connected_at: now,
        updated_at: now,
        deleted_at: null,
      })
      .eq('id', target.id);
    if (error) throw new Error(`Connection update failed: ${error.message}`);

    // Demote any OTHER live rows at the same institution that didn't
    // match — they're stale duplicates from before the merge logic
    // existed (e.g. Paul's 4 NatWest TL rows pre-Wednesday). Soft-
    // mark, don't delete; the disconnect modal lets the user decide
    // what to do with their transactions.
    for (const other of live) {
      if (other.id === target.id) continue;
      const { error: updErr } = await admin
        .from('bank_connections')
        .update({ status: 'revoked_duplicate', updated_at: now })
        .eq('id', other.id);
      if (updErr) {
        console.warn(`[yapily.connection-store] Failed to demote ${other.id}:`, updErr.message);
      } else {
        previousConnectionIds.push(other.id);
      }
    }

    return { connectionId: target.id, reused: true, previousConnectionIds };
  }

  // 3b. No matching live row — insert a new one. Generate a
  //     deterministic provider_id from the institution + first account
  //     hash so subsequent inserts for the SAME user+institution+
  //     account land on the same key (the provider_id unique index
  //     becomes a second guard against duplicates if the hash overlap
  //     check above ever misses something).
  const providerIdSeed = incomingHashes[0] || incomingAccountIds[0] || `${input.institutionId}_${Date.now()}`;
  const providerId = `yapily_${input.institutionId}_${providerIdSeed.slice(0, 16)}`;

  const { data: inserted, error } = await admin
    .from('bank_connections')
    .insert({
      user_id: input.userId,
      provider: 'yapily',
      provider_id: providerId,
      institution_id: input.institutionId,
      bank_name: input.bankName,
      consent_token: encrypt(input.consentToken),
      yapily_consent_id: input.yapilyConsentId,
      ...(input.yapilyConsentRequestId !== undefined
        ? { yapily_consent_request_id: input.yapilyConsentRequestId }
        : {}),
      consent_granted_at: now,
      consent_expires_at: input.consentExpiresAt,
      account_ids: incomingAccountIds,
      account_display_names: incomingDisplayNames,
      account_identifications_hashes: input.accounts.map((a) => a.accountIdentificationsHash ?? ''),
      status: 'active',
      connected_at: now,
    })
    .select('id')
    .single();

  if (error || !inserted) {
    throw new Error(`Connection insert failed: ${error?.message || 'unknown error'}`);
  }
  return { connectionId: inserted.id, reused: false, previousConnectionIds };
}

export interface TransactionUpsertInput {
  userId: string;
  connectionId: string;
  account: AccountSnapshot;
  transactions: YapilyTransaction[];
}

export interface TransactionUpsertResult {
  inserted: number;
  skippedAsDuplicate: number;
  skippedNoHash: number;
}

/**
 * Insert Yapily transactions, deduplicating against any existing rows
 * with the same (user_id, account_identifications_hash, stable_tx_hash).
 * Returns counts so the caller can log + diagnose.
 *
 * Pre-filter rather than ON CONFLICT because:
 *   - Our partial UNIQUE index is conditional on deleted_at IS NULL +
 *     hashes IS NOT NULL. Postgres ON CONFLICT on a partial index
 *     requires repeating the WHERE predicate, which Supabase's
 *     supabase-js .upsert() doesn't expose cleanly.
 *   - Pre-filter gives us accurate insert / dedup counts for logging.
 *   - Concurrency risk is negligible: a single user's syncs are
 *     serialised by the bank-sync cron + the initial-sync trigger.
 *     The partial unique index is the safety net if two syncs ever
 *     race — one would error, the caller would log, the other would
 *     win. No silent duplicates.
 */
export async function upsertYapilyTransactions(
  input: TransactionUpsertInput,
): Promise<TransactionUpsertResult> {
  const admin = getAdmin();

  if (!input.account.accountIdentificationsHash) {
    // No hash → can't safely dedup. Should never happen for a UK or EU
    // account; log and bail without writing anything.
    console.warn(
      `[yapily.connection-store] Account ${input.account.yapilyAccountId} has no identifications hash — skipping ${input.transactions.length} transactions`,
    );
    return { inserted: 0, skippedAsDuplicate: 0, skippedNoHash: input.transactions.length };
  }

  // 1. Build the candidate row + hash for each incoming transaction.
  const candidates = input.transactions
    .map((tx) => buildCandidate(input, tx))
    .filter((c): c is NonNullable<ReturnType<typeof buildCandidate>> => c !== null);

  if (candidates.length === 0) {
    return { inserted: 0, skippedAsDuplicate: 0, skippedNoHash: input.transactions.length };
  }

  // 2. Look up which stable_tx_hashes are already in the DB for this
  //    user + account hash. Single round-trip against the index.
  const wantedHashes = candidates.map((c) => c.row.stable_tx_hash);
  const { data: existing } = await admin
    .from('bank_transactions')
    .select('stable_tx_hash')
    .eq('user_id', input.userId)
    .eq('account_identifications_hash', input.account.accountIdentificationsHash)
    .is('deleted_at', null)
    .in('stable_tx_hash', wantedHashes);
  const existingSet = new Set((existing ?? []).map((r: { stable_tx_hash: string }) => r.stable_tx_hash));

  // 3. Deduplicate within the incoming batch itself — Yapily can
  //    occasionally return the same transaction twice in one
  //    /transactions response (we've seen it on settled transitions).
  const newRows: Array<ReturnType<typeof buildCandidate>> = [];
  const seen = new Set<string>(existingSet);
  let skippedAsDuplicate = 0;
  for (const c of candidates) {
    if (!c) continue;
    if (seen.has(c.row.stable_tx_hash)) {
      skippedAsDuplicate++;
      continue;
    }
    seen.add(c.row.stable_tx_hash);
    newRows.push(c);
  }

  if (newRows.length === 0) {
    return {
      inserted: 0,
      skippedAsDuplicate,
      skippedNoHash: input.transactions.length - candidates.length,
    };
  }

  // 4. Insert the survivors in batches of 500. On batch failure (the
  //    legacy (user_id, transaction_id) UNIQUE constraint firing
  //    against a soft-deleted row from a previous consent — Yapily
  //    sometimes reissues the same transaction_id after a reconnect
  //    or disconnect/restore), fall back to per-row inserts so a
  //    single bad row doesn't drop today's other new transactions.
  //
  //    Bug Paul flagged 2026-05-15: bank_sync_log was logging
  //    status='success' for 10 consecutive runs but 0 inserts each
  //    time, because Vercel logs at 16:00 UTC showed
  //    `[yapily.connection-store] insert batch failed` and the catch
  //    just logged the message without rescuing the rest of the batch.
  //    The £2,200 British Gas debit on 2026-05-15 sat in the API
  //    response but never landed in Postgres.
  let inserted = 0;
  let perRowSkipped = 0;
  for (let i = 0; i < newRows.length; i += 500) {
    const batch = newRows.slice(i, i + 500).map((r) => r!.row);
    const { error } = await admin.from('bank_transactions').insert(batch);
    if (!error) {
      inserted += batch.length;
      continue;
    }
    console.error(
      `[yapily.connection-store] insert batch failed (${batch.length} rows) — falling back to per-row: ${error.message} (code=${(error as { code?: string }).code ?? '?'})`,
    );
    for (const row of batch) {
      const { error: rowErr } = await admin.from('bank_transactions').insert(row);
      if (rowErr) {
        perRowSkipped++;
        const code = (rowErr as { code?: string }).code ?? '?';
        console.warn(
          `[yapily.connection-store] row skipped tx=${row.transaction_id} date=${row.timestamp} amount=${row.amount} code=${code}: ${rowErr.message}`,
        );
      } else {
        inserted++;
      }
    }
  }
  if (perRowSkipped > 0) {
    console.warn(
      `[yapily.connection-store] per-row fallback rescued ${inserted} rows but skipped ${perRowSkipped} (likely tx_id collisions against soft-deleted rows — see legacy UNIQUE(user_id, transaction_id) constraint)`,
    );
  }

  return {
    inserted,
    skippedAsDuplicate,
    skippedNoHash: input.transactions.length - candidates.length,
  };
}

/**
 * Build a single bank_transactions row from a Yapily transaction.
 * Returns null when the transaction is malformed (e.g. no amount or
 * date) — in practice Yapily never returns such rows, but the guard
 * keeps the inserter strict.
 */
function buildCandidate(input: TransactionUpsertInput, tx: YapilyTransaction) {
  const amount = tx.transactionAmount?.amount ?? tx.amount;
  const currency = tx.transactionAmount?.currency ?? tx.currency ?? input.account.currency ?? 'GBP';
  const ts = tx.bookingDateTime || tx.date;
  if (typeof amount !== 'number' || !ts) return null;

  // Direction resolution. Two upstream conventions exist:
  //   1. Signed amount: negative = debit, positive = credit. Most UK
  //      retail current accounts (e.g. Monzo via Yapily) follow this.
  //   2. Unsigned amount + creditDebitIndicator: positive for both,
  //      direction in the indicator. HSBC Business and several
  //      corporate banks follow this. Until 2026-05-14 we treated every
  //      unsigned amount as CREDIT, which is why HSBC Business showed
  //      £0 income — every credit landed with signCode=CREDIT but every
  //      debit ALSO came through positive and got the same signCode,
  //      meaning debits became phantom credits in signed_amount_pence
  //      and credits in turn matched the transfer-pair heuristic. Fix:
  //      trust the indicator when it's present.
  const indicator = String(tx.creditDebitIndicator || '').toUpperCase();
  let signCode: 'CREDIT' | 'DEBIT';
  if (indicator === 'CREDIT' || indicator === 'DEBIT') {
    signCode = indicator;
  } else if (amount < 0) {
    signCode = 'DEBIT';
  } else if (amount > 0) {
    signCode = 'CREDIT';
  } else {
    // amount === 0 — extremely rare, treat as DEBIT to keep it out of
    // income totals. signed_amount_pence will be 0 either way.
    signCode = 'DEBIT';
  }

  const description =
    tx.description ||
    (Array.isArray(tx.transactionInformation) ? tx.transactionInformation.join(' ') : '') ||
    tx.reference ||
    '';

  const stableTxHash = buildStableTxHash({
    accountIdentificationsHash: input.account.accountIdentificationsHash!,
    dateIso: ts.slice(0, 10),
    amount,
    currency,
    signCode,
    description,
  });
  const signedPence = Math.round(Math.abs(amount) * 100) * (signCode === 'CREDIT' ? 1 : -1);
  // `amount` column is the signed view that the rest of the app reads
  // (auto_categorise + get_monthly_*). If Yapily handed us an unsigned
  // amount + indicator, we re-sign it here so downstream queries that
  // depend on `amount > 0` / `amount < 0` (every income/spending RPC)
  // see the correct direction.
  const signedAmount = signCode === 'CREDIT' ? Math.abs(amount) : -Math.abs(amount);

  return {
    row: {
      user_id: input.userId,
      connection_id: input.connectionId,
      transaction_id: tx.id,
      account_id: input.account.yapilyAccountId,
      account_identifications_hash: input.account.accountIdentificationsHash!,
      stable_tx_hash: stableTxHash,
      signed_amount_pence: signedPence,
      amount: signedAmount,
      currency,
      description: description || null,
      merchant_name: tx.merchantName || null,
      // Persist the bank-side direction in the `category` column so the
      // Money Hub classifier and the get_monthly_income_total RPC both
      // pick it up — both use UPPER(category) IN ('CREDIT', 'INTEREST')
      // to identify income, and previously this column was always NULL.
      category: signCode,
      timestamp: ts,
    },
  };
}
