import type {
  YapilyInstitution,
  YapilyAccount,
  YapilyTransaction,
  YapilyApiResponse,
  YapilyAuthResponse,
  YapilyErrorResponse,
  YapilyHostedConsentRequest,
  YapilyHostedConsentResponse,
} from '@/types/yapily';

const YAPILY_BASE_URL = 'https://api.yapily.com';

// ── Auth Helper ──

function getAuthHeader(): string {
  // Trim defensively. Vercel's env-store can preserve trailing
  // whitespace / newlines that the dashboard's "paste value" UI
  // sometimes adds, and we hit a "Basic <base64-of-uuid:>" 401 on
  // 2026-04-28 because an env-add via piped echo wrote an empty
  // string. Trimming makes both classes of bug fail loudly here
  // rather than silently producing a malformed Authorization header.
  const uuid = process.env.YAPILY_APPLICATION_UUID?.trim();
  const secret = process.env.YAPILY_APPLICATION_SECRET?.trim();

  if (!uuid || !secret) {
    throw new Error(
      'YAPILY_APPLICATION_UUID and YAPILY_APPLICATION_SECRET must be set (and non-empty after trim)'
    );
  }

  const credentials = Buffer.from(`${uuid}:${secret}`).toString('base64');
  return `Basic ${credentials}`;
}

// ── Generic Request Helper ──

async function yapilyRequest<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${YAPILY_BASE_URL}${path}`;
  const headers: Record<string, string> = {
    Authorization: getAuthHeader(),
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> | undefined),
  };

  const res = await fetch(url, {
    ...options,
    headers,
  });

  if (!res.ok) {
    // Tracing-Id capture (Vitally Support requirement). Yapily surfaces
    // it in two places — pluck both so however ops finds the failure
    // (Sentry, Telegram, Vercel logs) the ID is right there in the
    // message and there's no chasing a separate header lookup.
    let errorMessage = `Yapily API error: ${res.status} ${res.statusText}`;
    let tracingId: string | undefined;
    try {
      const errorBody = (await res.json()) as YapilyErrorResponse;
      tracingId = errorBody.error?.tracingId;
      if (errorBody.error?.message) {
        errorMessage = `Yapily API error: ${errorBody.error.message} (${res.status})`;
      }
    } catch {
      // Body not parseable — use default message
    }
    if (!tracingId) {
      // Some auth + 5xx paths short-circuit before the JSON body —
      // fall back to the response header Yapily includes on every
      // request.
      tracingId = res.headers.get('Tracing-Id') || res.headers.get('tracing-id') || undefined;
    }
    if (tracingId) errorMessage += ` [tracingId=${tracingId}]`;
    const err = new Error(errorMessage) as Error & { status?: number; tracingId?: string };
    err.status = res.status;
    err.tracingId = tracingId;
    throw err;
  }

  return res.json() as Promise<T>;
}

// ── Institutions ──

// Module-level cache of the full Yapily institution list. Sized small
// enough to live in any Vercel function instance and refreshed at most
// once per hour. Per-instance caching is fine for this surface — the
// data is stable, the worst case is a few extra API calls when a fresh
// instance boots, and Yapily's recommendation is "refresh once a week"
// (we go more aggressive for safety).
const FEATURE_CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let _institutionsCache: { value: YapilyInstitution[]; loadedAt: number } | null = null;

/**
 * Fetches all Yapily-supported institutions, filtered to UK only
 * (country code GB). Cached for 1 hour at the module level.
 */
export async function getInstitutions(): Promise<YapilyInstitution[]> {
  if (_institutionsCache && Date.now() - _institutionsCache.loadedAt < FEATURE_CACHE_TTL_MS) {
    return _institutionsCache.value;
  }
  const response = await yapilyRequest<YapilyApiResponse<YapilyInstitution[]>>(
    '/institutions'
  );

  const institutions = response.data || [];

  // Filter to UK institutions only
  const uk = institutions.filter((inst) =>
    inst.countries?.some((c) => c.countryCode2 === 'GB')
  );
  _institutionsCache = { value: uk, loadedAt: Date.now() };
  return uk;
}

/**
 * Returns the Yapily feature flags exposed by a given institution.
 * Backed by the same cache as getInstitutions(). On a cache miss or
 * an unknown institution returns an empty array — callers should
 * treat absence as "feature unsupported".
 *
 * Source of feature names: Yapily institution metadata. Examples:
 *   ACCOUNT_DIRECT_DEBITS, ACCOUNT_PERIODIC_PAYMENTS,
 *   ACCOUNT_SCHEDULED_PAYMENTS, ACCOUNT_TRANSACTIONS,
 *   INITIATE_DOMESTIC_SINGLE_PAYMENT, etc.
 */
export async function getInstitutionFeatures(institutionId: string): Promise<string[]> {
  if (!institutionId) return [];
  try {
    const all = await getInstitutions();
    const match = all.find((i) => i.id === institutionId);
    return match?.features ?? [];
  } catch (err) {
    console.error('[yapily.getInstitutionFeatures] failed', err);
    return [];
  }
}

/**
 * Returns true if `institutionId` exposes `feature`. Defaults to false
 * on any lookup failure — Migle's spec says ~70% of UK banks support
 * the upcoming-payments endpoints, so the safe default is to skip the
 * call when in doubt rather than burn an API quota on a 404.
 */
export async function supportsFeature(
  institutionId: string,
  feature: string,
): Promise<boolean> {
  const features = await getInstitutionFeatures(institutionId);
  return features.includes(feature);
}

// ── Account Authorisation ──

/**
 * Creates an account authorisation request.
 * Returns the authorisation URL the user must be redirected to.
 *
 * Optional `featureScope` lists the Yapily feature scopes we want
 * included in the consent — used by the Upcoming Payments feature
 * to request ACCOUNT_SCHEDULED_PAYMENTS / ACCOUNT_PERIODIC_PAYMENTS /
 * ACCOUNT_DIRECT_DEBITS alongside the default account + transactions.
 * Omitted for existing bank links so their consent shape doesn't
 * change on rerun.
 */
export async function createAccountAuthorisation(
  institutionId: string,
  callbackUrl: string,
  userUuid: string,
  featureScope?: readonly string[]
): Promise<YapilyAuthResponse['data']> {
  const body: Record<string, unknown> = {
    applicationUserId: userUuid,
    institutionId,
    callback: callbackUrl,
  };
  if (featureScope && featureScope.length) {
    body.featureScope = Array.from(featureScope);
  }
  const response = await yapilyRequest<YapilyAuthResponse>(
    '/account-auth-requests',
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );

  if (!response.data?.authorisationUrl) {
    throw new Error('Yapily did not return an authorisation URL');
  }

  return response.data;
}

// ── Accounts ──

/**
 * Fetches all accounts for a given consent token.
 * The consent token is passed in the `consent` header as required by Yapily.
 */
export async function getAccounts(
  consentToken: string
): Promise<YapilyAccount[]> {
  const response = await yapilyRequest<YapilyApiResponse<YapilyAccount[]>>(
    '/accounts',
    {
      headers: {
        consent: consentToken,
      },
    }
  );

  return response.data || [];
}

// ── Transactions ──

/**
 * Fetches a single page of transactions for an account.
 *
 * Yapily's transactions endpoint pagination params, from the API
 * docs as of 2026-05-16:
 *   from   — earliest transaction date (ISO 8601, inclusive)
 *   before — latest transaction date (ISO 8601, exclusive). This is
 *            the canonical upper-bound name — the `to` alias the
 *            wrapper used to send was silently ignored, which became
 *            the proximate cause of the 2026-05-15 "0 transactions"
 *            outage: as soon as Paul's HSBC Business statement
 *            crossed Yapily's default page size in the 89-day
 *            window, the most recent transactions (including the
 *            May 15 ~£2,200 British Gas debit) fell off the first
 *            page and were never paged through.
 *   limit  — page size; Yapily caps at 1000 per page for /transactions.
 *
 * Pagination cursor: when more rows exist, callers walk the result
 * by passing the EARLIEST `bookingDateTime` (or `date`) seen in the
 * previous page as the next call's `before`. `getAllTransactions`
 * below implements that walk.
 *
 * This function is intentionally kept as the single-page primitive
 * so the debug endpoint can introspect one page at a time. Sync
 * routes call `getAllTransactions`.
 */
export interface GetTransactionsOptions {
  from?: string;
  /** Yapily's canonical upper-bound + pagination cursor. */
  before?: string;
  /** Legacy alias for `before` — kept for older call sites; Yapily
   * silently ignores it, so we mirror it onto `before` when no
   * explicit `before` is supplied. */
  to?: string;
  /** Page size. Defaults to 1000 (Yapily's documented max). */
  limit?: number;
}

export interface GetTransactionsPageResult {
  data: YapilyTransaction[];
  meta?: YapilyApiResponse<YapilyTransaction[]>['meta'];
}

export async function getTransactions(
  accountId: string,
  consentToken: string,
  fromOrOpts?: string | GetTransactionsOptions,
  to?: string,
): Promise<YapilyTransaction[]> {
  const opts: GetTransactionsOptions =
    typeof fromOrOpts === 'object' && fromOrOpts !== null
      ? fromOrOpts
      : { from: fromOrOpts as string | undefined, to };

  const page = await getTransactionsPage(accountId, consentToken, opts);
  return page.data;
}

/**
 * Single-page fetch that ALSO returns Yapily's pagination metadata
 * so callers can decide whether to walk to the next page. Used by
 * `getAllTransactions` and the debug endpoint.
 */
export async function getTransactionsPage(
  accountId: string,
  consentToken: string,
  opts: GetTransactionsOptions = {},
): Promise<GetTransactionsPageResult> {
  const params = new URLSearchParams();
  if (opts.from) params.set('from', opts.from);
  // Send `before` as the upper bound. Mirror the legacy `to` alias
  // onto `before` when the caller didn't supply one — Yapily ignores
  // `to`, so without this every pre-2026-05-16 call site would
  // request unbounded windows.
  const upperBound = opts.before ?? opts.to;
  if (upperBound) params.set('before', upperBound);
  const limit = opts.limit ?? 1000;
  params.set('limit', String(limit));

  const queryString = params.toString();
  const path = `/accounts/${accountId}/transactions${queryString ? `?${queryString}` : ''}`;

  const response = await yapilyRequest<YapilyApiResponse<YapilyTransaction[]>>(path, {
    headers: { consent: consentToken },
  });

  const data = response.data || [];
  console.log(
    `[yapily.getTransactionsPage] account=${accountId} from=${opts.from ?? ''} before=${upperBound ?? ''} limit=${limit} returned=${data.length}` +
      (response.meta?.pagination
        ? ` pagination=${JSON.stringify(response.meta.pagination)}`
        : ''),
  );
  return { data, meta: response.meta };
}

/**
 * Paginated transaction fetch — walks Yapily's `before` cursor from
 * the latest page backwards until either (a) the page comes back
 * empty, (b) the earliest tx in the page is at/below `from`, or
 * (c) we hit the safety cap.
 *
 * Returns the full deduped set, ordered as Yapily returned it
 * (newest-first per page; combined order preserved). De-duplication
 * is done on the (transaction_id, date) pair because Yapily can
 * include a row at exactly the cursor on the next page.
 *
 * Cap: 50 pages × 1000 = 50k transactions per account per sync.
 * That covers 12 months of even very high-volume merchant
 * accounts; the cron only ever asks for 90 days so this is purely
 * a runaway-loop safety belt.
 */
export async function getAllTransactions(
  accountId: string,
  consentToken: string,
  opts: GetTransactionsOptions = {},
): Promise<YapilyTransaction[]> {
  const MAX_PAGES = 50;
  const pageLimit = opts.limit ?? 1000;

  const seen = new Set<string>();
  const collected: YapilyTransaction[] = [];
  let before: string | undefined = opts.before ?? opts.to;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data } = await getTransactionsPage(accountId, consentToken, {
      from: opts.from,
      before,
      limit: pageLimit,
    });

    if (data.length === 0) break;

    let earliest: string | null = null;
    for (const tx of data) {
      const dt = tx.bookingDateTime || tx.date;
      if (!dt) continue;
      if (!earliest || dt < earliest) earliest = dt;
      const key = `${tx.id}|${dt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(tx);
    }

    if (!earliest) break;
    // Yapily's `before` is EXCLUSIVE — passing the earliest tx
    // datetime we just received as the next page's `before` walks
    // strictly older without overlap. If `earliest` ever equals the
    // current cursor, Yapily would loop on the same boundary, so
    // bail to avoid a stuck cursor.
    if (earliest === before) break;
    // If we've already walked past `from`, stop — the next page
    // would be entirely older than the user's window.
    if (opts.from && earliest <= opts.from) break;
    if (data.length < pageLimit) break;
    before = earliest;
  }

  return collected;
}

// ── Consent Renewal ──

/**
 * Reconfirms (extends) an existing consent for the UK 90-day renewal cycle.
 * Uses POST /consents/{consentId}/extend per Migle (6 May 2026) — the
 * /account-auth-requests/{consentId} path with PUT was the legacy one and
 * isn't part of the current API surface. Preserves the consentId and
 * consentToken; no new connection row should be created on our side after
 * a successful extend.
 *
 * Aliased as extendConsent below — same operation, more accurate name —
 * so call sites can pick whichever reads clearer in context.
 */
export async function reconfirmConsent(
  consentId: string
): Promise<YapilyAuthResponse['data']> {
  const response = await yapilyRequest<YapilyAuthResponse>(
    `/consents/${consentId}/extend`,
    {
      method: 'POST',
    }
  );

  return response.data;
}

/**
 * Alias of reconfirmConsent — POST /consents/{consentId}/extend. Use
 * this name in 403-retry flows where "extend" reads more naturally
 * than "reconfirm" (the API call is identical).
 */
export const extendConsent = reconfirmConsent;

/**
 * Returns the metadata for an account-auth-request (consent), including
 * its current status. Used during reconnect flows to decide whether to
 * call reconfirmConsent (status AWAITING_RE_AUTHORIZATION) or to start
 * a fresh authorisation (status REVOKED / EXPIRED / failed).
 */
export async function getConsent(
  consentId: string
): Promise<YapilyAuthResponse['data']> {
  const response = await yapilyRequest<YapilyAuthResponse>(
    `/consents/${consentId}`,
  );
  return response.data;
}

// ── Hosted Pages (Beta) ──
//
// Migle's onboarding plan (29 Apr 2026) requires the Hosted Pages flow
// for build sign-off. Tutorial:
//   https://docs.yapily.com/tools-and-services/hosted-pages/payment-tutorial-hosted-data
//
// Flow:
//   1. POST /hosted/consent-requests → { hostedUrl, consentRequestId }
//   2. Redirect user to hostedUrl (top-level, no iframe)
//   3. User completes journey → Yapily redirects to redirectUrl with
//      consentRequestId in query
//   4. GET /hosted/consent-requests/{consentRequestId} → consentToken + status
//   5. Use consentToken on /accounts and /transactions as before
//
// Both helpers below are guarded behind YAPILY_HOSTED_PAGES_ENABLED at
// the call-site (src/app/api/auth/yapily/route.ts) — keeping the helpers
// importable even when the flag is off so unit tests can exercise them.

export interface CreateHostedConsentRequestInput {
  /**
   * The user's stable application id. We pass profile.id so Yapily can
   * group multiple consents under the same end-user.
   */
  applicationUserId: string;
  /**
   * Where Yapily should send the user after the consent journey
   * completes. Must include any state-bearing query params we care
   * about — Yapily appends consentRequestId on top.
   */
  redirectUrl: string;
  /**
   * Two-letter country code for institutions allowed in this consent
   * (Vitally checklist C1: must be set correctly per market).
   */
  institutionCountryCode: string;
  /**
   * Pre-select a specific institution so Yapily skips its own
   * bank-picker UI. We render our own institution list, so we always
   * pass this when the user has chosen.
   */
  institutionId?: string;
  /**
   * Two-letter language code for the hosted UI (default 'EN').
   */
  language?: string;
  /**
   * Two-letter location code for the hosted UI (default 'GB').
   */
  location?: string;
  /**
   * Yapily AccountRequest scopes — passed via the `accountRequest`
   * field per the OpenAPI spec (mirrored back as `accountRequestDetails`
   * on the response). Use to request ACCOUNT_SCHEDULED_PAYMENTS /
   * ACCOUNT_PERIODIC_PAYMENTS / ACCOUNT_DIRECT_DEBITS etc. Omitted by
   * default — Yapily applies sensible AIS defaults.
   */
  featureScope?: readonly string[];
  /**
   * Earliest transaction date to make available on this consent.
   * Optional; useful for retrieving older history on banks that
   * support it.
   */
  transactionFrom?: string;
  /**
   * Latest transaction date to make available on this consent.
   * Optional.
   */
  transactionTo?: string;
}

/**
 * Creates a hosted consent request. Returns the hostedUrl (short-lived,
 * ~10min) the user must be redirected to plus the consentRequestId
 * we'll use to look up status after the user completes the flow.
 *
 * NOTE on the response shape: per the Yapily OpenAPI 12.3.4, the POST
 * response carries `consentRequestId` + `hostedUrl` but does NOT carry
 * `consentId` or `consentToken` — those are only populated on the GET
 * once the user has completed the bank-side journey. Don't try to
 * persist them from this call.
 */
export async function createHostedConsentRequest(
  input: CreateHostedConsentRequestInput,
): Promise<YapilyHostedConsentRequest> {
  const body: Record<string, unknown> = {
    redirectUrl: input.redirectUrl,
    institutionIdentifiers: {
      institutionCountryCode: input.institutionCountryCode,
      ...(input.institutionId ? { institutionId: input.institutionId } : {}),
    },
    applicationUserId: input.applicationUserId,
    userSettings: {
      language: input.language ?? 'EN',
      location: input.location ?? 'GB',
    },
  };

  // accountRequest (request side) ↔ accountRequestDetails (response
  // side). Only emit it when at least one nested field is set so the
  // serialised body stays minimal.
  const accountRequest: Record<string, unknown> = {};
  if (input.featureScope && input.featureScope.length) {
    accountRequest.featureScope = Array.from(input.featureScope);
  }
  if (input.transactionFrom) accountRequest.transactionFrom = input.transactionFrom;
  if (input.transactionTo) accountRequest.transactionTo = input.transactionTo;
  if (Object.keys(accountRequest).length) body.accountRequest = accountRequest;

  const response = await yapilyRequest<YapilyHostedConsentResponse>(
    '/hosted/consent-requests',
    {
      method: 'POST',
      body: JSON.stringify(body),
    },
  );

  if (!response.data?.hostedUrl) {
    throw new Error('Yapily did not return a hostedUrl for the consent request');
  }
  if (!response.data.consentRequestId) {
    throw new Error('Yapily did not return a consentRequestId');
  }
  return response.data;
}

/**
 * Reads the current state of a hosted consent request. After Yapily
 * redirects back to our app we call this to confirm status before
 * proceeding (recommended by the tutorial). Also used by the
 * abandonment poller for users who don't return to the callback URL.
 */
export async function getHostedConsentRequest(
  consentRequestId: string,
): Promise<YapilyHostedConsentRequest> {
  const response = await yapilyRequest<YapilyHostedConsentResponse>(
    `/hosted/consent-requests/${consentRequestId}`,
  );
  return response.data;
}

/**
 * Single source of truth for whether the Hosted Pages flow is on. Read
 * once per request — the flag is meant to be flipped via env, not
 * mid-process. Defaults to false so existing /account-auth-requests
 * code stays the canonical path until we cut over.
 */
export function isHostedPagesEnabled(): boolean {
  return process.env.YAPILY_HOSTED_PAGES_ENABLED?.toLowerCase() === 'true';
}

// ── Consent Deletion ──

/**
 * Revokes a consent on Yapily's side. Required by Migle for the
 * compliance build review — the user-facing disconnect button must
 * actually call Yapily, not just flip a local flag.
 *
 * Idempotent on Yapily's side: a 404 means the consent is already
 * gone, which is what we wanted anyway. Callers should treat 404 as
 * success and only surface other failures.
 */
export async function deleteConsent(consentId: string): Promise<void> {
  const url = `${YAPILY_BASE_URL}/consents/${consentId}`;

  const res = await fetch(url, {
    method: 'DELETE',
    headers: {
      Authorization: getAuthHeader(),
      'Content-Type': 'application/json',
    },
  });

  // 404 = already revoked → success.
  if (res.status === 404) return;

  if (!res.ok) {
    let errorMessage = `Yapily delete-consent error: ${res.status} ${res.statusText}`;
    let tracingId: string | undefined;
    try {
      const errorBody = (await res.json()) as YapilyErrorResponse;
      tracingId = errorBody.error?.tracingId;
      if (errorBody.error?.message) {
        errorMessage = `Yapily delete-consent error: ${errorBody.error.message} (${res.status})`;
      }
    } catch {
      // body not parseable — keep default message
    }
    if (!tracingId) {
      tracingId = res.headers.get('Tracing-Id') || res.headers.get('tracing-id') || undefined;
    }
    if (tracingId) errorMessage += ` [tracingId=${tracingId}]`;
    throw new Error(errorMessage);
  }
}

// ── Account-identity helpers ──

/**
 * Build a stable display name from a Yapily account. Prefers the
 * account-holder name (e.g. "PREMIER REWARD BLACK"), falls back to
 * nickname, then to the account type, then to a generic label.
 *
 * Splitting this out so the callback and the initial-sync — both of
 * which need a human-readable label per account — produce identical
 * strings; if these drift the user sees the same account named two
 * different things across the UI.
 */
export function buildYapilyAccountDisplayName(account: import('@/types/yapily').YapilyAccount): string {
  return (
    account.accountNames?.[0]?.name ||
    account.nickname ||
    account.accountType ||
    account.type ||
    'Account'
  );
}

// ── 403 extend-first wrapper ──
//
// Migle (6 May 2026): when /accounts (or any consent-protected GET)
// returns 403, the right behaviour is to call POST
// /consents/{consentId}/extend FIRST, retry the original call once,
// and only if THAT also 403s should the caller trigger a full
// re-consent via POST /hosted/consent-requests. This wrapper
// encapsulates that pattern — wrap any consent-protected call you
// want self-healing.
//
// Throws ConsentExpiredError when extend → retry still 403s, so the
// caller can flip the bank_connection to expired and surface the
// reconfirm-consent UI.

export class ConsentExpiredError extends Error {
  consentId: string;
  originalStatus: number;
  constructor(consentId: string, originalStatus: number) {
    super(`Consent ${consentId} expired beyond extend (got ${originalStatus} twice)`);
    this.name = 'ConsentExpiredError';
    this.consentId = consentId;
    this.originalStatus = originalStatus;
  }
}

function isYapily403(err: unknown): err is Error & { status?: number } {
  return err instanceof Error && (err as Error & { status?: number }).status === 403;
}

export async function withConsentRetry<T>(
  consentId: string,
  fn: () => Promise<T>,
): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (!isYapily403(err)) throw err;
    // First 403 → try extend.
    try {
      await extendConsent(consentId);
    } catch (extendErr) {
      // If extend itself fails, surface the original 403 — extend is
      // best-effort.
      throw new ConsentExpiredError(consentId, 403);
    }
    // Extend succeeded; retry once.
    try {
      return await fn();
    } catch (retryErr) {
      if (isYapily403(retryErr)) {
        throw new ConsentExpiredError(consentId, 403);
      }
      throw retryErr;
    }
  }
}
