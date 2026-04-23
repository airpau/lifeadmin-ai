// src/lib/yapily/upcoming.ts
//
// Wrappers for the four deterministic "Upcoming Payments" endpoints
// exposed by Yapily. Each returns a normalised list of rows suitable
// for upsert into the `upcoming_payments` table.
//
// All calls are server-side only (rely on YAPILY_APPLICATION_UUID +
// YAPILY_APPLICATION_SECRET basic auth, same as the existing client
// at src/lib/yapily.ts). The core fetch helper from yapily.ts isn't
// exported, so we keep this module self-contained.

const YAPILY_BASE_URL = 'https://api.yapily.com';

function authHeader(): string {
  const uuid = process.env.YAPILY_APPLICATION_UUID;
  const secret = process.env.YAPILY_APPLICATION_SECRET;
  if (!uuid || !secret) {
    throw new Error('YAPILY_APPLICATION_UUID and YAPILY_APPLICATION_SECRET must be set');
  }
  return `Basic ${Buffer.from(`${uuid}:${secret}`).toString('base64')}`;
}

interface YapilyEnvelope<T> {
  meta?: unknown;
  data?: T;
  error?: { message?: string };
}

interface RawAmount {
  amount?: number | string | null;
  currency?: string | null;
}

/**
 * Work out whether a scheduled / periodic / direct-debit row represents
 * money going OUT (outgoing) or money coming IN (incoming).
 *
 * Historically we hard-coded "outgoing" because UK retail current accounts
 * only expose outbound scheduled transfers through these endpoints. But
 * business accounts (confirmed for HSBC Business) surface incoming
 * scheduled transfers here too — those come back with either a negative
 * amount string or a `creditDebitIndicator: 'CREDIT'` field. Both happen
 * in the wild depending on the bank, so we check both.
 *
 * Defaults to 'outgoing' when we can't tell, matching the historical
 * behaviour for retail accounts that don't include either signal.
 */
function detectDirection(row: {
  amount?: RawAmount | null;
  creditDebitIndicator?: string | null;
}): 'incoming' | 'outgoing' {
  const indicator = String(row.creditDebitIndicator || '').toUpperCase();
  if (indicator === 'CREDIT') return 'incoming';
  if (indicator === 'DEBIT') return 'outgoing';
  const amountRaw = row.amount?.amount;
  if (amountRaw !== undefined && amountRaw !== null) {
    const n = parseFloat(String(amountRaw));
    if (!Number.isNaN(n) && n > 0) return 'incoming';
    if (!Number.isNaN(n) && n < 0) return 'outgoing';
  }
  return 'outgoing';
}

/**
 * Small helper so each endpoint wrapper is ~3 lines. Throws on
 * non-2xx. Callers wrap in try/catch to implement graceful
 * degradation when a bank doesn't expose a particular endpoint.
 */
async function yapilyGet<T>(path: string, consentToken: string): Promise<T> {
  const res = await fetch(`${YAPILY_BASE_URL}${path}`, {
    headers: {
      Authorization: authHeader(),
      consent: consentToken,
      'Content-Type': 'application/json',
    },
    // Yapily occasionally returns big pages — no edge runtime here.
    cache: 'no-store',
  });

  if (!res.ok) {
    let msg = `Yapily ${res.status} ${res.statusText}`;
    try {
      const body = (await res.json()) as YapilyEnvelope<unknown>;
      if (body?.error?.message) msg += ` — ${body.error.message}`;
    } catch {
      // ignore parse error
    }
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  const envelope = (await res.json()) as YapilyEnvelope<T>;
  return (envelope.data ?? ([] as unknown as T));
}

/** Shape the four endpoint wrappers return to callers. Keeps the
 *  cron code free of provider-specific quirks. */
export interface UpcomingRow {
  source:
    | 'pending_credit'
    | 'pending_debit'
    | 'scheduled_payment'
    | 'standing_order'
    | 'direct_debit';
  direction: 'incoming' | 'outgoing';
  counterparty: string | null;
  amount: number; // positive number; `direction` carries the sign
  currency: string;
  expectedDate: string; // YYYY-MM-DD
  yapilyResourceId: string | null;
  confidence: 1.0;
  raw: unknown;
}

// ─── Scheduled payments (future-dated one-off transfers) ───────────
interface YapilyScheduledPayment {
  id?: string;
  scheduledPaymentDateTime?: string;
  amount?: RawAmount;
  creditDebitIndicator?: string | null;
  payee?: { name?: string | null } | null;
  payer?: { name?: string | null } | null;
  reference?: string | null;
}

export async function getScheduledPayments(
  accountId: string,
  consentToken: string,
): Promise<UpcomingRow[]> {
  const data = await yapilyGet<YapilyScheduledPayment[]>(
    `/accounts/${encodeURIComponent(accountId)}/scheduled-payments`,
    consentToken,
  );
  return (data || []).map((p) => {
    const amount = Math.abs(parseFloat(String(p.amount?.amount ?? 0)) || 0);
    const direction = detectDirection(p);
    // For incoming rows the human-readable counterparty is the payer, not the payee.
    const counterparty =
      direction === 'incoming'
        ? p.payer?.name || p.reference || p.payee?.name || null
        : p.payee?.name || p.reference || null;
    return {
      source: 'scheduled_payment' as const,
      direction,
      counterparty,
      amount,
      currency: p.amount?.currency || 'GBP',
      expectedDate: toDateOnly(p.scheduledPaymentDateTime),
      yapilyResourceId: p.id || null,
      confidence: 1.0,
      raw: p,
    };
  });
}

// ─── Standing orders (periodic payments) ───────────────────────────
interface YapilyPeriodicPayment {
  id?: string;
  nextPaymentDateTime?: string;
  firstPaymentDateTime?: string;
  nextPaymentAmount?: RawAmount;
  amount?: RawAmount;
  creditDebitIndicator?: string | null;
  payee?: { name?: string | null } | null;
  payer?: { name?: string | null } | null;
  reference?: string | null;
  frequency?: string;
}

export async function getPeriodicPayments(
  accountId: string,
  consentToken: string,
): Promise<UpcomingRow[]> {
  const data = await yapilyGet<YapilyPeriodicPayment[]>(
    `/accounts/${encodeURIComponent(accountId)}/periodic-payments`,
    consentToken,
  );
  return (data || []).map((p) => {
    const amountSrc = p.nextPaymentAmount ?? p.amount;
    const amount = Math.abs(parseFloat(String(amountSrc?.amount ?? 0)) || 0);
    const direction = detectDirection({ amount: amountSrc, creditDebitIndicator: p.creditDebitIndicator });
    const counterparty =
      direction === 'incoming'
        ? p.payer?.name || p.reference || p.payee?.name || null
        : p.payee?.name || p.reference || null;
    return {
      source: 'standing_order' as const,
      direction,
      counterparty,
      amount,
      currency: amountSrc?.currency || 'GBP',
      expectedDate: toDateOnly(p.nextPaymentDateTime || p.firstPaymentDateTime),
      yapilyResourceId: p.id || null,
      confidence: 1.0,
      raw: p,
    };
  });
}

// ─── Direct debits ─────────────────────────────────────────────────
interface YapilyDirectDebit {
  id?: string;
  nextPaymentDateTime?: string;
  previousPaymentDateTime?: string;
  nextPaymentAmount?: RawAmount;
  previousPaymentAmount?: RawAmount;
  creditDebitIndicator?: string | null;
  name?: string | null;
  reference?: string | null;
  status?: string;
  frequency?: string;
}

export async function getDirectDebits(
  accountId: string,
  consentToken: string,
): Promise<UpcomingRow[]> {
  const data = await yapilyGet<YapilyDirectDebit[]>(
    `/accounts/${encodeURIComponent(accountId)}/direct-debits`,
    consentToken,
  );
  return (data || []).map((d) => {
    const amountSrc = d.nextPaymentAmount ?? d.previousPaymentAmount;
    const amount = Math.abs(parseFloat(String(amountSrc?.amount ?? 0)) || 0);
    // Direct debits are virtually always outgoing in UK retail, but business
    // accounts occasionally surface incoming collection mandates via the same
    // endpoint — fall through to detectDirection() which defaults to
    // 'outgoing' when neither signal is present.
    const direction = detectDirection({ amount: amountSrc, creditDebitIndicator: d.creditDebitIndicator });
    return {
      source: 'direct_debit' as const,
      direction,
      counterparty: d.name || d.reference || null,
      amount,
      currency: amountSrc?.currency || 'GBP',
      expectedDate: toDateOnly(d.nextPaymentDateTime),
      yapilyResourceId: d.id || null,
      confidence: 1.0,
      raw: d,
    };
  });
}

// ─── Pending transactions (bank-dependent) ─────────────────────────
// Some banks (HSBC, Starling) expose bookingStatus=pending. Many
// (Monzo, Barclays, some NatWest consents) do not. The caller catches
// errors from this fn and continues with the other three sources.
interface YapilyTransaction {
  id?: string;
  date?: string;
  bookingDateTime?: string;
  valueDateTime?: string;
  amount?: number | string | null;
  currency?: string | null;
  status?: string;
  bookingStatus?: string;
  description?: string | null;
  merchantName?: string | null;
  payee?: { name?: string | null } | null;
  payer?: { name?: string | null } | null;
}

export async function getPendingTransactions(
  accountId: string,
  consentToken: string,
): Promise<UpcomingRow[]> {
  // Not every bank respects the query param; some filter server-side,
  // others return all and require client-side filtering. Request all
  // and filter ourselves so both behaviours work.
  const raw = await yapilyGet<YapilyTransaction[]>(
    `/accounts/${encodeURIComponent(accountId)}/transactions?bookingStatus=pending&limit=250`,
    consentToken,
  );

  return (raw || [])
    .filter((t) => {
      const flag = (t.bookingStatus || t.status || '').toUpperCase();
      return flag === 'PENDING';
    })
    .map((t) => {
      const amountNum = parseFloat(String(t.amount ?? 0)) || 0;
      const direction: 'incoming' | 'outgoing' = amountNum >= 0 ? 'incoming' : 'outgoing';
      return {
        source: (direction === 'incoming' ? 'pending_credit' : 'pending_debit') as
          | 'pending_credit'
          | 'pending_debit',
        direction,
        counterparty:
          t.merchantName ||
          t.payee?.name ||
          t.payer?.name ||
          t.description ||
          null,
        amount: Math.abs(amountNum),
        currency: t.currency || 'GBP',
        expectedDate: toDateOnly(t.valueDateTime || t.bookingDateTime || t.date),
        yapilyResourceId: t.id || null,
        confidence: 1.0,
        raw: t,
      };
    });
}

// ─── helpers ───────────────────────────────────────────────────────
function toDateOnly(iso: string | null | undefined): string {
  if (!iso) return new Date().toISOString().slice(0, 10);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

/** Default featureScope list to send on consent creation/renewal for
 *  an upcoming-payments-enabled bank link. Exported so the auth route
 *  and consent-renewal cron both use the same set. */
export const UPCOMING_FEATURE_SCOPES = [
  'ACCOUNT_SCHEDULED_PAYMENTS',
  'ACCOUNT_PERIODIC_PAYMENTS',
  'ACCOUNT_DIRECT_DEBITS',
  'ACCOUNT_TRANSACTIONS',
  'ACCOUNT_TRANSACTIONS_WITH_MERCHANT',
  'ACCOUNT_BALANCES',
] as const;
