/**
 * Stable transaction-identity keys for the Yapily-only architecture.
 *
 * Why we can't trust `transaction_id` directly:
 *   Yapily's `transactionHash` is a synthetic id built from
 *   (accountId + institutionId + credit/debit + date + amount +
 *   description) plus per-call ranking — Yapily themselves warn it can
 *   change if the underlying institution data shifts. The raw
 *   `transactionId` field is even less reliable: many UK banks don't
 *   return one at all, and where they do it can drift across consents.
 *
 *   So we compute our own keys from the truly-immutable fields. Both
 *   `accountIdentificationsHash` (sort code + account number) and
 *   `stableTxHash` (date + signed amount + normalised description)
 *   are stable across:
 *     - Re-authorisation (consent refreshed in place)
 *     - Full reconnect (new consent_id)
 *     - Switching aggregators (Yapily → Plaid → whatever)
 *     - Yapily reissuing transaction_ids
 *
 * The DB has a partial unique index on
 * (user_id, account_identifications_hash, stable_tx_hash) so a
 * properly-keyed upsert is a no-op for any transaction we already have
 * — duplicates are physically impossible at the row level.
 */

import { createHash } from 'crypto';

export interface YapilyAccountIdentification {
  /** Yapily uses uppercase enum strings: SORT_CODE | ACCOUNT_NUMBER | IBAN | BIC | ... */
  type: string;
  identification: string;
}

/**
 * Hash a UK or EU bank account's real-world identity into a 64-char
 * hex string that is stable for the lifetime of the account.
 *
 * UK: prefer SORT_CODE + ACCOUNT_NUMBER (the canonical "06-71-22 / 12345678").
 * EU: use IBAN.
 * Falls back to BIC + something if neither pair is present.
 *
 * Input is the `accountIdentifications` array Yapily returns on the
 * Account resource.
 */
export function buildAccountIdentificationsHash(identifications: YapilyAccountIdentification[]): string | null {
  if (!Array.isArray(identifications) || identifications.length === 0) return null;

  // Normalise: uppercase types, strip non-alphanumerics from values.
  const normalised = identifications
    .map((i) => ({
      type: (i.type || '').toUpperCase(),
      value: String(i.identification || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase(),
    }))
    .filter((i) => i.type && i.value);

  if (normalised.length === 0) return null;

  // UK preferred path: SORT_CODE + ACCOUNT_NUMBER.
  const sortCode = normalised.find((i) => i.type === 'SORT_CODE')?.value;
  const accountNumber = normalised.find((i) => i.type === 'ACCOUNT_NUMBER')?.value;
  if (sortCode && accountNumber) {
    return sha256(`UK:${sortCode}:${accountNumber}`);
  }

  // EU preferred path: IBAN.
  const iban = normalised.find((i) => i.type === 'IBAN')?.value;
  if (iban) {
    return sha256(`IBAN:${iban}`);
  }

  // Fallback: deterministic concat of every (type, value) pair.
  // Last-resort path — if neither (sort+account) nor IBAN is present,
  // we still want a stable hash rather than NULL. Sort by type so the
  // ordering is deterministic.
  const fallback = normalised
    .sort((a, b) => a.type.localeCompare(b.type))
    .map((i) => `${i.type}:${i.value}`)
    .join('|');
  return sha256(`FALLBACK:${fallback}`);
}

/**
 * Hash a single transaction into a stable identity. Same real-world
 * payment → same hash, even if Yapily reissues transactionId.
 *
 * Inputs:
 *   - accountIdentificationsHash: as computed above; pins the
 *     transaction to a specific real-world bank account.
 *   - dateIso: the booking/value date in YYYY-MM-DD form.
 *   - amount: numeric amount (positive or negative).
 *   - currency: ISO code (e.g. GBP); included so a £10 charge and a
 *     €10 charge on the same day don't collide for multi-currency
 *     accounts.
 *   - signCode: 'CREDIT' or 'DEBIT' — Yapily's
 *     transactionInformation.creditDebitIndicator. We store sign
 *     explicitly so a +£10 refund and a -£10 charge are always
 *     distinct hashes regardless of how the bank reports the magnitude.
 *   - description: narrative / merchant name (we normalise it before
 *     hashing).
 */
export function buildStableTxHash(input: {
  accountIdentificationsHash: string;
  dateIso: string;
  amount: number;
  currency: string;
  signCode: 'CREDIT' | 'DEBIT';
  description: string;
}): string {
  // Pence to avoid float comparison hell. Math.round handles 1.005 →
  // 100.5 cases by snapping to nearest pence; banks always settle to
  // whole pence so this is lossless in practice.
  const pence = Math.round(input.amount * 100);
  const signedPence = input.signCode === 'CREDIT' ? Math.abs(pence) : -Math.abs(pence);
  const normalisedDesc = normaliseDescription(input.description);
  const payload = [
    input.accountIdentificationsHash,
    input.dateIso,
    String(signedPence),
    input.currency.toUpperCase(),
    normalisedDesc,
  ].join('|');
  return sha256(payload);
}

/**
 * Description normalisation for the hash. We're not trying to
 * canonicalise to a human merchant name (that's the job of
 * `merchant-normalise.ts`); we just want a string that's stable
 * across reconnects.
 *
 * Rules:
 *   - lowercase
 *   - collapse multiple whitespace to single space
 *   - strip the long numeric trailers banks append (e.g. the "FP
 *     15/04/26 0637 500000001749510782" tail on a Faster Payment) —
 *     these include timestamps and reference numbers that vary
 *     between consents reporting the same transaction.
 *   - strip common pending/auth prefixes
 *   - trim
 */
function normaliseDescription(raw: string): string {
  if (!raw) return '';
  let s = raw.toLowerCase();
  // Strip leading/trailing whitespace + collapse internal runs.
  s = s.replace(/\s+/g, ' ').trim();
  // Drop pending markers that flip when a transaction settles.
  s = s.replace(/^(pending|provisional|auth|authorisation|temp|hold|holds|reserved)[\s\-:_]+/g, '');
  // Drop the trailing reference + timestamp banks append on Faster
  // Payments / direct debits ("FP 15/04/26 0637 500000001749510782").
  s = s.replace(/\s+fp\s+\d{2}\/\d{2}\/\d{2}\s+\d{4}\s+\d{6,}\s*$/g, '');
  s = s.replace(/\s+\d{12,}\s*$/g, '');
  // Final trim.
  return s.trim();
}

function sha256(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}
