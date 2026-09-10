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

import { classifyYapilyError, type YapilyErrorClass } from '@/lib/yapily';
import {
  mapScheduledPayments,
  mapPeriodicPayments,
  mapDirectDebits,
  mapPendingTransactions,
  type UpcomingRow,
  type YapilyScheduledPayment,
  type YapilyPeriodicPayment,
  type YapilyDirectDebit,
  type YapilyTransaction,
} from './upcoming-mappers';

// Re-exported so existing importers (sync-upcoming, tests) keep working.
export type { UpcomingRow } from './upcoming-mappers';
export { toDateOnly } from './upcoming-mappers';

const YAPILY_BASE_URL = 'https://api.yapily.com';

function authHeader(): string {
  // .trim() mirrors src/lib/yapily.ts getAuthHeader(). Vercel's env
  // store can preserve a trailing newline, which produced a malformed
  // Basic header and a 401 on 2026-04-28. This module had its own
  // untrimmed copy and would have hit the same bug independently.
  const uuid = process.env.YAPILY_APPLICATION_UUID?.trim();
  const secret = process.env.YAPILY_APPLICATION_SECRET?.trim();
  if (!uuid || !secret) {
    throw new Error('YAPILY_APPLICATION_UUID and YAPILY_APPLICATION_SECRET must be set');
  }
  return `Basic ${Buffer.from(`${uuid}:${secret}`).toString('base64')}`;
}

interface YapilyEnvelope<T> {
  meta?: unknown;
  data?: T;
  error?: { message?: string; tracingId?: string };
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
    let tracingId: string | undefined;
    try {
      const body = (await res.json()) as YapilyEnvelope<unknown>;
      tracingId = body?.error?.tracingId;
      if (body?.error?.message) msg += ` — ${body.error.message}`;
    } catch {
      // ignore parse error
    }
    if (!tracingId) {
      tracingId = res.headers.get('Tracing-Id') || res.headers.get('tracing-id') || undefined;
    }
    if (tracingId) msg += ` [tracingId=${tracingId}]`;
    const err = new Error(msg) as Error & {
      status?: number;
      tracingId?: string;
      errorClass?: YapilyErrorClass;
    };
    err.status = res.status;
    err.tracingId = tracingId;
    // Decorate with the same class the main client attaches, so callers
    // can branch on 'unsupported' (424/501) and permanently stop asking
    // this bank for this endpoint rather than retrying nightly.
    err.errorClass = classifyYapilyError(err);
    throw err;
  }

  const envelope = (await res.json()) as YapilyEnvelope<T>;
  return (envelope.data ?? ([] as unknown as T));
}


// ─── Endpoint wrappers ─────────────────────────────────────────────
//
// Each is fetch-then-map. All mapping quirks live in
// ./upcoming-mappers.ts so they can be unit-tested without a network.

export async function getScheduledPayments(
  accountId: string,
  consentToken: string,
): Promise<UpcomingRow[]> {
  const data = await yapilyGet<YapilyScheduledPayment[]>(
    `/accounts/${encodeURIComponent(accountId)}/scheduled-payments`,
    consentToken,
  );
  return mapScheduledPayments(data);
}

export async function getPeriodicPayments(
  accountId: string,
  consentToken: string,
): Promise<UpcomingRow[]> {
  const data = await yapilyGet<YapilyPeriodicPayment[]>(
    `/accounts/${encodeURIComponent(accountId)}/periodic-payments`,
    consentToken,
  );
  return mapPeriodicPayments(data);
}

export async function getDirectDebits(
  accountId: string,
  consentToken: string,
): Promise<UpcomingRow[]> {
  const data = await yapilyGet<YapilyDirectDebit[]>(
    `/accounts/${encodeURIComponent(accountId)}/direct-debits`,
    consentToken,
  );
  return mapDirectDebits(data);
}

export async function getPendingTransactions(
  accountId: string,
  consentToken: string,
): Promise<UpcomingRow[]> {
  // Not every bank respects the query param; some filter server-side,
  // others return all and require client-side filtering. Request all
  // and filter in the mapper so both behaviours work.
  const raw = await yapilyGet<YapilyTransaction[]>(
    `/accounts/${encodeURIComponent(accountId)}/transactions?bookingStatus=pending&limit=250`,
    consentToken,
  );
  return mapPendingTransactions(raw);
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
