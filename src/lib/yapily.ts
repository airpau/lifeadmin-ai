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

// ── Error classification (Yapily build review, step 7) ──
//
// Migle's build review asks for "at least one simulated example per
// error class" and "coverage of all HTTP response codes". Before this
// existed, every non-2xx funnelled into one generic throw: excellent
// diagnostics (we captured tracingId from both body and header) but no
// differentiated BEHAVIOUR. In particular a 429 was treated the same as
// a 400 — no backoff, no Retry-After — which is exactly the pattern
// Yapily rate-limits applications for.
//
// The classes map to what the caller should DO, not to the raw code:
//
//   bad_request  400/422 — our request is malformed. Fix it; never retry.
//   auth         401     — credential problem (unless it's consent-shaped,
//                          which isYapilyConsentExpiryError separates out).
//   consent      403     — consent/permission. Resolve via GET /consents/{id}.
//   not_found    404     — resource gone. Usually idempotent success on DELETE.
//   conflict     409     — concurrent modification. Re-read, then retry once.
//   rate_limit   429     — back off, honour Retry-After, then retry.
//   unsupported  424/501 — this bank does not implement the endpoint.
//                          PERMANENT. Never retry; record and stop asking.
//   server       5xx     — transient on Yapily's side. Retry with backoff.
//   unknown      anything else.

export type YapilyErrorClass =
  | 'bad_request'
  | 'auth'
  | 'consent'
  | 'not_found'
  | 'conflict'
  | 'rate_limit'
  | 'unsupported'
  | 'server'
  | 'unknown';

/**
 * Statuses meaning "this institution does not implement this endpoint".
 *
 * 424 FAILED_DEPENDENCY is Yapily's documented code: "Returned by any
 * Financial Data and any Payments endpoint when the feature to be
 * accessed is not supported by the Institution."
 *
 * 501 NOT_IMPLEMENTED is what Migle Ivanauskaite (Yapily) flagged on the
 * 2026-08-20 pre-launch call as the code we were generating against
 * banks that don't expose direct-debits / periodic-payments /
 * scheduled-payments.
 *
 * Both are properties of the BANK, not of the request or of Yapily's
 * health, so they will never resolve by trying again. Treating them as
 * retryable (which `status >= 500` silently did to 501) meant three
 * calls per unsupported endpoint, per account, per run, forever — the
 * exact avoidable traffic Yapily asked us to stop generating.
 */
export const YAPILY_UNSUPPORTED_STATUSES: readonly number[] = [424, 501];

export function isUnsupportedFeatureStatus(status: number | undefined): boolean {
  return typeof status === 'number' && YAPILY_UNSUPPORTED_STATUSES.includes(status);
}

/** True when the thrown error means "this bank doesn't do that". */
export function isUnsupportedFeatureError(err: unknown): boolean {
  return isUnsupportedFeatureStatus((err as { status?: number } | null)?.status);
}

export function classifyYapilyError(err: unknown): YapilyErrorClass {
  const status = (err as { status?: number } | null)?.status;
  if (typeof status !== 'number') return 'unknown';
  if (status === 400 || status === 422) return 'bad_request';
  if (status === 401) return 'auth';
  if (status === 403) return 'consent';
  if (status === 404) return 'not_found';
  if (status === 409) return 'conflict';
  // Checked before the generic 5xx branch — 501 is in this set and
  // would otherwise be swallowed as a transient server error.
  if (isUnsupportedFeatureStatus(status)) return 'unsupported';
  if (status === 429) return 'rate_limit';
  if (status >= 500) return 'server';
  return 'unknown';
}

/** Error classes worth retrying. 4xx (other than 429) never is — the
 * request itself is the problem, so retrying just burns quota. 424/501
 * are excluded even though 501 is nominally 5xx: an unimplemented bank
 * endpoint is permanent, not transient. */
export function isRetryableYapilyStatus(status: number): boolean {
  if (isUnsupportedFeatureStatus(status)) return false;
  return status === 429 || status >= 500;
}

/** Max automatic retries for a retryable status.
 *
 * Three, giving 5s → 10s → 20s of backoff. Bounded by the sync crons'
 * maxDuration (raised to 300s when this changed) and by the fact that
 * the crons re-run on their own schedule anyway. */
const MAX_RETRIES = 3;

/** Base for exponential backoff.
 *
 * Raised from 500ms to 5s on 2026-08-21. Migle Ivanauskaite (Yapily),
 * verbatim: "Exponential backoff is applied between each poll of data
 * endpoints: starting at 5s, doubling each time (5s → 10s → 20s → 40s
 * → ...)."
 *
 * Sub-second retries against a rate-limited or struggling API are
 * counterproductive — they arrive before anything has had a chance to
 * recover, and count against the same 30 req/sec application-wide
 * ceiling that caused the problem. */
const RETRY_BASE_MS = 5_000;

/** Ceiling so a hostile Retry-After can't park a function until timeout.
 *  40s matches the top of Migle's stated ladder. */
const MAX_RETRY_DELAY_MS = 40_000;

/**
 * Minimum gap between consecutive data-endpoint calls made with the
 * SAME consent token.
 *
 * Migle: "Data endpoints are not polled multiple times for the same
 * consent without a delay between calls … Polling data endpoints
 * multiple times for the same consent without delay can cause race
 * conditions, unexpected errors, or premature consent expiry."
 *
 * Note the failure mode is not merely a 429. Hammering one consent can
 * expire it, which drops the user's bank connection and costs them a
 * full reconnect. Applied between accounts within a connection by both
 * sync paths.
 */
export const PER_CONSENT_CALL_DELAY_MS = 5_000;

/** Sleep helper shared by the retry loop and the per-consent spacing in
 *  the sync routes. */
export function yapilySleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Internal alias for the exported yapilySleep, kept so the retry loop
 *  below reads the way it always has. */
const sleep = yapilySleep;

/**
 * Parses Yapily's Retry-After header. Per RFC 7231 it is either a
 * delay in seconds or an HTTP-date; handle both, and clamp so a bad
 * value can't stall the function.
 */
function parseRetryAfter(header: string | null): number | null {
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(seconds * 1000, MAX_RETRY_DELAY_MS);
  }
  const asDate = Date.parse(header);
  if (!Number.isNaN(asDate)) {
    return Math.min(Math.max(asDate - Date.now(), 0), MAX_RETRY_DELAY_MS);
  }
  return null;
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

  let res: Response = await fetch(url, { ...options, headers });

  // ── Retry loop for 429 / 5xx (build review step 7) ──
  // Everything else falls straight through to the error handler below:
  // a 400 means our request is wrong, and retrying an identical wrong
  // request is pure waste.
  for (
    let attempt = 0;
    attempt < MAX_RETRIES && !res.ok && isRetryableYapilyStatus(res.status);
    attempt++
  ) {
    const retryAfterMs = parseRetryAfter(res.headers.get('Retry-After'));
    const backoffMs = retryAfterMs ?? RETRY_BASE_MS * Math.pow(2, attempt);
    console.warn(
      `[yapily] ${res.status} on ${path} — retry ${attempt + 1}/${MAX_RETRIES} in ${backoffMs}ms` +
        (retryAfterMs !== null ? ' (honouring Retry-After)' : ''),
    );
    await sleep(backoffMs);
    res = await fetch(url, { ...options, headers });
  }

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
    const err = new Error(errorMessage) as Error & {
      status?: number;
      tracingId?: string;
      errorClass?: YapilyErrorClass;
    };
    err.status = res.status;
    err.tracingId = tracingId;
    // Attach the class at throw-time so every catch site can branch on
    // it without re-deriving the mapping.
    err.errorClass = classifyYapilyError(err);
    throw err;
  }

  return res.json() as Promise<T>;
}

// ── Institutions ──

// Two-layer cache for the institution list.
//
// Migle Ivanauskaite (Yapily), 21 Aug 2026: "GET /institutions: cached
// for up to 7 days", "refreshed no more than once per week".
//
// L1 is this module-level variable — free, but scoped to one Vercel
// lambda instance, which is why a 1-hour L1 TTL used to mean "refetch
// on almost every cold start". L2 is a single row in Supabase
// (yapily_institutions_cache), shared by every instance and every cron,
// so the weekly refresh is genuinely weekly across the whole app.
//
// L2 also gives us a stale copy to fall back on. That matters more than
// the saved calls: on a fetch failure this used to return [], and the
// capability gate is fail-open, so a transient Yapily blip turned into
// calls against endpoints the bank doesn't implement — the precise
// traffic we were asked to stop generating.
const INSTITUTIONS_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const INSTITUTIONS_CACHE_ID = 'default';

let _institutionsCache: { value: YapilyInstitution[]; loadedAt: number } | null = null;

/** Service-role client, created lazily so importing this module in a
 *  context without Supabase env vars doesn't throw. */
function institutionsCacheClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  // Dynamic require keeps @supabase/supabase-js out of any bundle that
  // imports this module purely for its pure helpers (error classifiers,
  // the unit tests).
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js');
  return createClient(url, key, { auth: { persistSession: false } });
}

interface InstitutionsCacheRow {
  institutions: YapilyInstitution[];
  fetched_at: string;
  application_uuid: string | null;
}

async function readInstitutionsCache(): Promise<{ value: YapilyInstitution[]; ageMs: number } | null> {
  const supabase = institutionsCacheClient();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('yapily_institutions_cache')
      .select('institutions, fetched_at, application_uuid')
      .eq('id', INSTITUTIONS_CACHE_ID)
      .maybeSingle<InstitutionsCacheRow>();

    if (error || !data || !Array.isArray(data.institutions) || data.institutions.length === 0) {
      return null;
    }

    // Institution availability is per-application. If the credentials
    // have been rotated to a different app, another app's coverage is
    // not just stale — it is wrong, and would let the capability gate
    // approve endpoints this application cannot reach.
    const currentApp = process.env.YAPILY_APPLICATION_UUID?.trim() || null;
    if (data.application_uuid && currentApp && data.application_uuid !== currentApp) {
      console.warn(
        '[yapily.institutions] cached list belongs to a different application — ignoring and refetching',
      );
      return null;
    }

    const fetchedAt = Date.parse(data.fetched_at);
    return {
      value: data.institutions,
      ageMs: Number.isNaN(fetchedAt) ? Number.POSITIVE_INFINITY : Date.now() - fetchedAt,
    };
  } catch (err) {
    console.warn(
      '[yapily.institutions] durable cache read failed:',
      err instanceof Error ? err.message : err,
    );
    return null;
  }
}

async function writeInstitutionsCache(value: YapilyInstitution[]): Promise<void> {
  const supabase = institutionsCacheClient();
  if (!supabase) return;
  try {
    const now = new Date().toISOString();
    await supabase.from('yapily_institutions_cache').upsert(
      {
        id: INSTITUTIONS_CACHE_ID,
        application_uuid: process.env.YAPILY_APPLICATION_UUID?.trim() || null,
        institutions: value,
        institution_count: value.length,
        fetched_at: now,
        updated_at: now,
      },
      { onConflict: 'id' },
    );
  } catch (err) {
    // Non-fatal: we still have the list in memory for this instance.
    console.warn(
      '[yapily.institutions] durable cache write failed:',
      err instanceof Error ? err.message : err,
    );
  }
}

/**
 * All Yapily-supported institutions, filtered to the UK (country code
 * GB). Served from memory, then from the durable cache, and only then
 * from Yapily — at most once a week.
 *
 * Never throws on a Yapily failure if ANY cached copy exists, however
 * old. An institution list from last month is a far better basis for
 * capability decisions than an empty array.
 */
export async function getInstitutions(): Promise<YapilyInstitution[]> {
  // L1 — same lambda instance, already warm.
  if (_institutionsCache && Date.now() - _institutionsCache.loadedAt < INSTITUTIONS_TTL_MS) {
    return _institutionsCache.value;
  }

  // L2 — shared across instances.
  const durable = await readInstitutionsCache();
  if (durable && durable.ageMs < INSTITUTIONS_TTL_MS) {
    _institutionsCache = { value: durable.value, loadedAt: Date.now() - durable.ageMs };
    return durable.value;
  }

  try {
    const response = await yapilyRequest<YapilyApiResponse<YapilyInstitution[]>>(
      '/institutions'
    );
    const institutions = response.data || [];
    const uk = institutions.filter((inst) =>
      inst.countries?.some((c) => c.countryCode2 === 'GB')
    );

    // Guard against caching a successful-but-empty response. Yapily
    // returning [] would otherwise poison both layers for a week and
    // disable every capability check in the product.
    if (uk.length === 0) {
      console.error('[yapily.institutions] Yapily returned 0 UK institutions — not caching');
      if (durable) return durable.value;
      return [];
    }

    _institutionsCache = { value: uk, loadedAt: Date.now() };
    await writeInstitutionsCache(uk);
    return uk;
  } catch (err) {
    // Serve stale rather than empty. See the note above about
    // fail-open capability checks.
    if (durable) {
      const ageDays = Math.round(durable.ageMs / 86_400_000);
      console.warn(
        `[yapily.institutions] refresh failed, serving cached list ${ageDays}d old:`,
        err instanceof Error ? err.message : err,
      );
      _institutionsCache = { value: durable.value, loadedAt: Date.now() - durable.ageMs };
      return durable.value;
    }
    throw err;
  }
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
  /** Offset-based cursor, taken from `meta.pagination.next.offset`.
   * Used by `getAllTransactions` to continue past a page whose rows
   * all share one timestamp, where the `before` cursor cannot advance. */
  offset?: number;
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
  // Offset continuation. Only set when the caller is explicitly walking
  // Yapily's `next.offset` — the default cursor strategy stays
  // timestamp-based so existing call sites are unaffected.
  if (typeof opts.offset === 'number' && opts.offset > 0) {
    params.set('offset', String(opts.offset));
  }

  const queryString = params.toString();
  const path = `/accounts/${accountId}/transactions${queryString ? `?${queryString}` : ''}`;

  const response = await yapilyRequest<YapilyApiResponse<YapilyTransaction[]>>(path, {
    headers: { consent: consentToken },
  });

  const data = response.data || [];
  console.log(
    `[yapily.getTransactionsPage] account=${accountId} from=${opts.from ?? ''} before=${upperBound ?? ''} limit=${limit}` +
      (typeof opts.offset === 'number' ? ` offset=${opts.offset}` : '') +
      ` returned=${data.length}` +
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
  // Offset-continuation state. We stay on the timestamp cursor by
  // default and only switch to offset paging when the `before` cursor
  // provably cannot advance (a full page sharing one timestamp).
  let offset: number | undefined;
  let offsetMode = false;

  // `from` is compared numerically, not lexicographically. The old
  // string compare was only correct while every institution returned
  // Z-normalised timestamps; a single `+01:00` offset made it wrong.
  const fromMs = opts.from ? Date.parse(opts.from) : null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, meta } = await getTransactionsPage(accountId, consentToken, {
      from: opts.from,
      before,
      limit: pageLimit,
      offset,
    });

    if (data.length === 0) break;

    // Build review step 11: trust Yapily's own pagination metadata over
    // our inference. `self.limit` is the page size the API ACTUALLY
    // applied, which can be lower than the limit we asked for — the old
    // `data.length < pageLimit` stop condition silently defeated
    // pagination on any institution that clamps, reproducing the
    // 2026-05-15 outage this walk exists to prevent. `next` is Yapily's
    // authoritative "there is more" signal.
    const effectiveLimit = meta?.pagination?.self?.limit ?? pageLimit;
    const hasNext = meta?.pagination?.next != null;

    let earliest: string | null = null;
    let sameTimestampCount = 0;
    for (const tx of data) {
      const dt = tx.bookingDateTime || tx.date;
      if (!dt) continue;
      if (!earliest || dt < earliest) {
        earliest = dt;
        sameTimestampCount = 1;
      } else if (dt === earliest) {
        sameTimestampCount++;
      }
      const key = `${tx.id}|${dt}`;
      if (seen.has(key)) continue;
      seen.add(key);
      collected.push(tx);
    }

    if (!earliest) break;

    // Same-timestamp truncation guard. Many UK banks return date-only
    // precision (T00:00:00.000Z). If an entire page shares one
    // timestamp, advancing the exclusive `before` to it would skip any
    // rows at that timestamp which spilled onto the next page. We can't
    // page past it, so stop and say so loudly rather than losing rows
    // silently.
    if (sameTimestampCount >= data.length && data.length >= effectiveLimit) {
      // Build review step 11: the `before` cursor is exclusive, so a full
      // page sharing a single timestamp leaves us nowhere to advance to —
      // any rows at that timestamp which spilled onto the next page would
      // be lost. Yapily's `next.offset` is the escape hatch: continue by
      // offset within the same window instead of bailing. Dedup on
      // (id, date) already absorbs any overlap between the two strategies.
      const nextOffset = meta?.pagination?.next?.offset;
      if (typeof nextOffset === 'number' && (offset === undefined || nextOffset > offset)) {
        if (!offsetMode) {
          console.log(
            `[yapily.getAllTransactions] account=${accountId} full page shares one timestamp (${earliest}) — switching to offset pagination at offset=${nextOffset}`,
          );
        }
        offsetMode = true;
        offset = nextOffset;
        continue;
      }
      console.warn(
        `[yapily.getAllTransactions] account=${accountId} full page shares one timestamp (${earliest}) and Yapily returned no usable next.offset — stopping to avoid silent truncation; ${collected.length} collected`,
      );
      break;
    }

    // While walking by offset, keep following `next.offset` and leave the
    // timestamp cursor frozen — mixing the two would skip rows.
    if (offsetMode) {
      const nextOffset = meta?.pagination?.next?.offset;
      if (typeof nextOffset !== 'number' || (offset !== undefined && nextOffset <= offset)) break;
      if (fromMs !== null) {
        const earliestMs = Date.parse(earliest);
        if (!Number.isNaN(earliestMs) && earliestMs <= fromMs) break;
      }
      offset = nextOffset;
      continue;
    }

    // Yapily's `before` is EXCLUSIVE — passing the earliest tx
    // datetime we just received as the next page's `before` walks
    // strictly older without overlap. If `earliest` ever equals the
    // current cursor, Yapily would loop on the same boundary, so
    // bail to avoid a stuck cursor.
    if (earliest === before) break;
    // If we've already walked past `from`, stop — the next page
    // would be entirely older than the user's window.
    if (fromMs !== null) {
      const earliestMs = Date.parse(earliest);
      if (!Number.isNaN(earliestMs) && earliestMs <= fromMs) break;
    }
    // Stop only when Yapily says there is no next page AND the page came
    // back short of the server-applied limit. Either signal alone is
    // weaker: `next` is absent on some responses, and a short page can
    // still be followed by more rows when the limit was clamped.
    if (!hasNext && data.length < effectiveLimit) break;
    before = earliest;

    if (page === MAX_PAGES - 1) {
      console.warn(
        `[yapily.getAllTransactions] account=${accountId} hit the ${MAX_PAGES}-page cap with more data available — window may be truncated`,
      );
    }
  }

  return collected;
}

// ── Consent Renewal ──

/** Back-date applied to lastConfirmedAt so clock skew can't produce a
 * "future date" 400 from Yapily. 30s is comfortably above observed
 * Vercel↔Yapily drift and far below anything a regulator would call a
 * material misstatement of when the user confirmed. */
const EXTEND_CONSENT_CLOCK_SKEW_MS = 30_000;

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
  consentId: string,
  lastConfirmedAt?: Date | string,
): Promise<YapilyAuthResponse['data']> {
  // `lastConfirmedAt` is MANDATORY on ExtendConsentRequest. Sending an
  // empty body (what this did until 2026-08-21) returns
  // 400 BAD_REQUEST — so the 90-day renewal path was never actually
  // working. Verified against the OpenAPI spec at
  // docs.yapily.com/api-reference/consents/extend-consent (v12.16.0).
  //
  // Yapily rejects a future date ("lastConfirmedAt cannot be a future
  // date and time"), and clock skew between our Vercel function and
  // Yapily's servers is enough to trip that on an exact `new Date()`.
  // Back-date by CLOCK_SKEW_MS so a few seconds of drift can't turn a
  // successful reconfirmation into a 400 the user sees as "please
  // disconnect and reconnect your bank".
  const raw = lastConfirmedAt ? new Date(lastConfirmedAt) : new Date();
  if (Number.isNaN(raw.getTime())) {
    throw new Error(`reconfirmConsent: invalid lastConfirmedAt "${String(lastConfirmedAt)}"`);
  }
  const now = Date.now();
  const stamped = new Date(Math.min(raw.getTime(), now) - EXTEND_CONSENT_CLOCK_SKEW_MS);

  const response = await yapilyRequest<YapilyAuthResponse>(
    `/consents/${consentId}/extend`,
    {
      method: 'POST',
      body: JSON.stringify({ lastConfirmedAt: stamped.toISOString() }),
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
 * Single source of truth for whether the Hosted Pages flow is on.
 *
 * Default flipped to TRUE on 2026-08-21. Hosted Pages is now the
 * canonical consent journey: Yapily renders the bank picker, the
 * consent screen and any decoupled-auth / QR flows on their own domain.
 * Migle Ivanauskaite confirmed we can drop our own institution list
 * entirely by omitting `institutionId` from the request.
 *
 * The env var survives as a KILL SWITCH, not a feature flag: setting
 * YAPILY_HOSTED_PAGES_ENABLED=false in Vercel reverts to the legacy
 * /account-auth-requests path without a deploy. It is deliberately
 * "explicitly false disables" rather than "explicitly true enables", so
 * that a missing or misspelled env var fails towards the flow we
 * actually want rather than silently reverting the cutover — which is
 * how the hosted path sat as dead code from April to August.
 */
export function isHostedPagesEnabled(): boolean {
  return process.env.YAPILY_HOSTED_PAGES_ENABLED?.toLowerCase() !== 'false';
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

/**
 * Returns true ONLY when the error is a Yapily 401/403 whose message
 * EXPLICITLY contains a consent/token-expiry token — NOT a generic
 * auth or permission error.
 *
 * Previously this returned `true` for ANY 401, on the rationale that
 * Yapily only 401s for token-level issues. That assumption broke in
 * production: Yapily sandbox (and occasionally the live API for newly-
 * provisioned credentials) returns a plain 401 when an institution
 * scope is missing or the request signing is briefly out of sync. With
 * the old check, a single transient 401 was enough to flip a healthy
 * bank to 'expired' and the cron's WHERE clause then locked it out of
 * recovery permanently. We now require the SAME explicit message
 * tokens we already required for 403 — anything else is logged but
 * does not flip status.
 *
 * 403 codes Yapily uses but that should NOT flip status:
 *   - insufficient_rights        (permission/scope problem)
 *   - feature_not_supported      (institution doesn't expose endpoint)
 *
 * The check is message-substring-based because Yapily's `error.code`
 * field isn't always present on the response body — yapilyRequest folds
 * `error.message` into the thrown Error's `.message`, so we look there.
 */
export function isYapilyConsentExpiryError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as Error & { status?: number }).status;
  if (status !== 401 && status !== 403) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('consent_expired') ||
    msg.includes('expired_consent') ||
    msg.includes('consent has expired') ||
    msg.includes('consent expired') ||
    msg.includes('consent_invalid') ||
    msg.includes('invalid_consent') ||
    msg.includes('consent is invalid') ||
    msg.includes('consent_revoked') ||
    msg.includes('revoked_consent') ||
    msg.includes('consent has been revoked') ||
    msg.includes('token_expired') ||
    msg.includes('access_token_expired') ||
    msg.includes('access token has expired') ||
    msg.includes('token has expired')
  );
}

/**
 * Consecutive consent-expiry errors required before bank_connections.status
 * is flipped to 'expired'. A single transient error must not disconnect a
 * bank — only sustained failures across multiple cron runs do.
 */
export const CONSENT_FAILURE_THRESHOLD = 3;

// ── Authoritative consent-state lookup (build review, step 6) ──
//
// Yapily's build review step 6 is explicit: on a 403 from /accounts,
// verify via GET /consents/{consentId} rather than guessing.
//
// We used to guess — isYapilyConsentExpiryError above pattern-matches
// the error MESSAGE against 14 hard-coded substrings. That was a
// deliberate narrowing after a production incident (a transient 401 was
// flipping healthy banks to 'expired'), but it has a real failure mode:
// if Yapily ever rewords an error string, re-consent prompting silently
// stops and users quietly lose their bank feed with no signal.
//
// resolveConsentState asks Yapily directly and returns a DECISION, not
// a raw status, so both sync call sites branch identically. The
// message-matching path survives as the fallback for legacy rows that
// have no yapily_consent_id (they exist — see /api/bank/renew-consent).

export type ConsentVerdict =
  /** Consent is dead. Flip to 'expired' and prompt a fresh consent. */
  | { action: 'expired'; status: string }
  /** Bank wants re-authorisation but the consent can be extended first. */
  | { action: 'extendable'; status: string }
  /** Consent is fine — the 403 was a scope/permission problem, not expiry. */
  | { action: 'healthy'; status: string }
  /** No consentId, or the lookup itself failed. Caller should fall back. */
  | { action: 'unknown'; status: null };

/** Yapily consent statuses that mean "this consent will never work again". */
const TERMINAL_CONSENT_STATUSES = new Set([
  'EXPIRED',
  'REVOKED',
  'REJECTED',
  'FAILED',
  'INVALID',
]);

/** Statuses where POST /consents/{id}/extend is the correct next move. */
const EXTENDABLE_CONSENT_STATUSES = new Set([
  'AWAITING_RE_AUTHORIZATION',
  'AWAITING_RE_AUTHORISATION',
]);

/**
 * Asks Yapily what state a consent is actually in. Never throws —
 * a failed lookup returns { action: 'unknown' } so the caller can fall
 * back to the legacy message-matching heuristic rather than crashing a
 * sync run on a diagnostic call.
 */
export async function resolveConsentState(
  consentId: string | null | undefined,
): Promise<ConsentVerdict> {
  if (!consentId) return { action: 'unknown', status: null };
  try {
    const consent = await getConsent(consentId);
    const status = (consent?.status || '').toUpperCase();
    if (!status) return { action: 'unknown', status: null };
    if (TERMINAL_CONSENT_STATUSES.has(status)) return { action: 'expired', status };
    if (EXTENDABLE_CONSENT_STATUSES.has(status)) return { action: 'extendable', status };
    // AUTHORIZED and anything else Yapily considers live: the consent is
    // not the problem. The 403 was almost certainly insufficient_rights
    // or feature_not_supported, which must NOT disconnect the bank.
    return { action: 'healthy', status };
  } catch (err) {
    console.error(
      `[yapily.resolveConsentState] lookup failed for consent=${consentId}:`,
      err instanceof Error ? err.message : err,
    );
    return { action: 'unknown', status: null };
  }
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
    } catch {
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

// ── Shared sync-failure triage (build review, step 6) ──

export type ConsentFailureVerdict =
  /** Consent is dead. Caller should stop syncing this connection and
   *  count toward CONSENT_FAILURE_THRESHOLD. */
  | 'fatal'
  /** Consent was extendable and the extend succeeded — the next sync run
   *  will work. Do NOT count this as a consent failure. */
  | 'recovered'
  /** Not a consent problem (scope error, 5xx, rate limit, anything else).
   *  Log and carry on; the bank stays active. */
  | 'non_fatal';

/**
 * Single decision point used by BOTH sync routes (cron/bank-sync and
 * bank/sync-now) when a per-account Yapily call throws, so the two can
 * never drift apart.
 *
 * Order of preference:
 *   1. If it isn't a 403, it's not a consent problem. Done — and, just
 *      as importantly, no extra call is made.
 *   2. Ask Yapily directly via GET /consents/{id} — deterministic, and
 *      what the build review asks for.
 *   3. If the consent is extendable, extend it here and report
 *      'recovered' so a renewable consent self-heals instead of
 *      counting toward the disconnect threshold.
 *   4. Only if we have no consentId (legacy rows) or the lookup failed
 *      do we fall back to the old message-substring heuristic.
 */
export async function triageConsentFailure(
  err: unknown,
  consentId: string | null | undefined,
  logPrefix = '[yapily.triage]',
): Promise<ConsentFailureVerdict> {
  const status = (err as { status?: number } | null)?.status;

  // ── 403 ONLY ───────────────────────────────────────────────────────
  //
  // Narrowed from 401|403 on 2026-08-21. Migle Ivanauskaite (Yapily):
  // "Client attempts to retrieve data directly first (e.g. GET
  // /transactions); GET /consent is only called if a 403 error is
  // received."
  //
  // 403 means "this consent may no longer authorise the request" —
  // exactly the question GET /consents/{id} answers.
  //
  // 401 means our Basic auth credentials are wrong. That is an
  // application-level fault affecting EVERY user, and the consent
  // lookup would fail with the same 401 anyway — so the old behaviour
  // doubled our request count during precisely the incident where we
  // could least afford it. We hit this for real on 2026-04-28 when a
  // trailing newline in the Vercel env produced a malformed header.
  //
  // Handle it as what it is: loud, and not a consent problem.
  if (status === 401) {
    console.error(
      `${logPrefix} 401 from Yapily — this is an APPLICATION CREDENTIAL fault, not a user consent problem. ` +
      `Check YAPILY_APPLICATION_UUID / YAPILY_APPLICATION_SECRET in Vercel (a trailing newline caused this on 2026-04-28). ` +
      `Not calling GET /consents — it would fail the same way.`,
    );
    return 'non_fatal';
  }

  if (status !== 403) return 'non_fatal';

  const verdict = await resolveConsentState(consentId);

  if (verdict.action === 'expired') {
    console.error(`${logPrefix} consent=${consentId} status=${verdict.status} — treating as expired`);
    return 'fatal';
  }

  if (verdict.action === 'extendable') {
    try {
      await extendConsent(consentId!);
      console.log(`${logPrefix} consent=${consentId} was ${verdict.status} — extended successfully`);
      return 'recovered';
    } catch (extendErr) {
      console.error(
        `${logPrefix} consent=${consentId} status=${verdict.status} — extend failed:`,
        extendErr instanceof Error ? extendErr.message : extendErr,
      );
      return 'fatal';
    }
  }

  if (verdict.action === 'healthy') {
    console.warn(
      `${logPrefix} ${status} but consent=${consentId} is ${verdict.status} — scope/permission issue, not expiry`,
    );
    return 'non_fatal';
  }

  // action === 'unknown': no consentId (legacy row) or the lookup itself
  // failed. Fall back to the pre-build-review heuristic so behaviour
  // never gets WORSE than it was before this function existed.
  return isYapilyConsentExpiryError(err) ? 'fatal' : 'non_fatal';
}
