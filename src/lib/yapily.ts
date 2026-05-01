import type {
  YapilyInstitution,
  YapilyAccount,
  YapilyTransaction,
  YapilyApiResponse,
  YapilyAuthResponse,
  YapilyErrorResponse,
} from '@/types/yapily';

const YAPILY_BASE_URL = 'https://api.yapily.com';

// ──────────────────────────────────────────────────────────────────────
//  Structured error class (P0-2)
// ──────────────────────────────────────────────────────────────────────

/**
 * YapilyError surfaces the upstream HTTP status so callers can branch
 * on it (403 → re-consent, 429 → backoff, 5xx → retry, etc.) instead
 * of string-matching on `.message`. The Yapily API returns its own
 * error code/message inside `error.{code,message}` — both are kept
 * here for logging.
 */
export class YapilyError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly raw?: unknown;

  constructor(message: string, status: number, code?: string, raw?: unknown) {
    super(message);
    this.name = 'YapilyError';
    this.status = status;
    this.code = code;
    this.raw = raw;
  }
}

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
    let message = `Yapily API error: ${res.status} ${res.statusText}`;
    let code: string | undefined;
    let raw: unknown;
    try {
      const errorBody = (await res.json()) as YapilyErrorResponse;
      raw = errorBody;
      if (errorBody.error?.message) {
        message = `Yapily API error: ${errorBody.error.message} (${res.status})`;
      }
      // Yapily error bodies sometimes carry a `code`; preserve it for
      // structured handling (e.g. CONSENT_EXPIRED, INVALID_CONSENT_TOKEN).
      const maybeCode = (errorBody as unknown as { error?: { code?: string } }).error?.code;
      if (typeof maybeCode === 'string') code = maybeCode;
    } catch {
      // Body not parseable — keep default message
    }
    throw new YapilyError(message, res.status, code, raw);
  }

  return res.json() as Promise<T>;
}

// ── Institutions ──

/**
 * Fetches all Yapily-supported institutions, filtered to UK only (country code GB).
 */
export async function getInstitutions(): Promise<YapilyInstitution[]> {
  const response = await yapilyRequest<YapilyApiResponse<YapilyInstitution[]>>(
    '/institutions'
  );

  const institutions = response.data || [];

  // Filter to UK institutions only
  return institutions.filter((inst) =>
    inst.countries?.some((c) => c.countryCode2 === 'GB')
  );
}

/**
 * Fetches a single institution by id (used by the capability gate before
 * invoking single-use endpoints — scheduled-payments / periodic-payments
 * / direct-debits — so we only call them when the institution advertises
 * support).
 */
export async function getInstitution(institutionId: string): Promise<YapilyInstitution | null> {
  try {
    const response = await yapilyRequest<YapilyApiResponse<YapilyInstitution>>(
      `/institutions/${encodeURIComponent(institutionId)}`
    );
    return response.data || null;
  } catch (err) {
    if (err instanceof YapilyError && err.status === 404) return null;
    throw err;
  }
}

// ──────────────────────────────────────────────────────────────────────
//  Hosted-Pages consent flow (P0-1) — Migle's expected build review path
//  Reference: https://docs.yapily.com/tools-and-services/hosted-pages/payment-tutorial-hosted-data
// ──────────────────────────────────────────────────────────────────────

export interface HostedConsentRequest {
  /** Yapily-issued ID for the hosted consent request (used by polling) */
  hostedConsentId: string;
  /** Hosted consent page URL the user is redirected to */
  redirectUrl: string;
  /** Application user UUID echoed back */
  applicationUserId: string;
  /** Status — typically "AWAITING_USER_ACTION" on creation */
  status: string;
}

/**
 * POST /hosted/consent-requests — creates a hosted consent request and
 * returns the URL we must redirect the user to. Replaces the direct
 * /account-auth-requests flow for the consumer connect path.
 */
export async function createHostedConsentRequest(
  institutionId: string,
  callbackUrl: string,
  userUuid: string,
  featureScope?: readonly string[]
): Promise<HostedConsentRequest> {
  const body: Record<string, unknown> = {
    applicationUserId: userUuid,
    institutionId,
    callback: callbackUrl,
  };
  if (featureScope && featureScope.length) {
    body.featureScope = Array.from(featureScope);
  }

  const response = await yapilyRequest<YapilyApiResponse<HostedConsentRequest>>(
    '/hosted/consent-requests',
    {
      method: 'POST',
      body: JSON.stringify(body),
    }
  );

  const data = response.data;
  if (!data?.redirectUrl || !data?.hostedConsentId) {
    throw new YapilyError(
      'Yapily hosted consent response missing redirectUrl/hostedConsentId',
      500,
      'MALFORMED_RESPONSE',
      response
    );
  }
  return data;
}

/**
 * GET /hosted/consent-requests/{hostedConsentId} — polled by the fallback
 * cron when no redirect callback arrives within 3 minutes (T4).
 *
 * Status is one of: AWAITING_USER_ACTION (intermediate), AUTHORIZED,
 * REJECTED, REVOKED, FAILED, EXPIRED (terminal).
 */
export async function getHostedConsentRequest(
  hostedConsentId: string
): Promise<{ status: string; consentId?: string; consentToken?: string; raw: unknown }> {
  const response = await yapilyRequest<YapilyApiResponse<{
    status: string;
    consent?: { id?: string; consentToken?: string };
  }>>(
    `/hosted/consent-requests/${encodeURIComponent(hostedConsentId)}`
  );
  const data = response.data;
  return {
    status: data?.status || 'UNKNOWN',
    consentId: data?.consent?.id,
    consentToken: data?.consent?.consentToken,
    raw: response,
  };
}

// ── Account Authorisation (legacy direct flow — kept for back-compat) ──

/**
 * Creates a direct account authorisation request. Retained for any
 * server-side callers that don't go through the user-facing hosted flow.
 *
 * For consumer connect flows use createHostedConsentRequest instead.
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
 *
 * Throws YapilyError on non-2xx — callers should branch on `.status`:
 *   403 → consent expired/invalid → flip connection.status to 'expired'
 *         and surface ConsentRenewalBanner (T6).
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

export interface TransactionPaginationOpts {
  /** Inclusive lower bound, ISO-8601 (e.g. last_synced_at - 5min) */
  from?: string;
  /** Exclusive upper bound, ISO-8601 — Yapily's cursor for prior pages */
  before?: string;
  /** Inclusive upper bound, ISO-8601 (rarely used — `before` is preferred) */
  to?: string;
}

/**
 * Fetches transactions for a specific account.
 *
 * Pagination per Migle's T11: callers walk pages by passing `before` set
 * to the earliest transaction date returned on the previous page, until
 * the response is empty.
 *
 * The 5-minute historical-data window is a Yapily soft constraint: rows
 * may be re-stated up to 5 min after they appear. Incremental syncs
 * should set `from = max(last_synced_at - 5min, account_opened_at)` to
 * tolerate that without missing late-arriving rows.
 */
export async function getTransactions(
  accountId: string,
  consentToken: string,
  optsOrFrom?: TransactionPaginationOpts | string,
  legacyTo?: string
): Promise<YapilyTransaction[]> {
  // Backwards-compat shim: the previous signature was
  // (accountId, consentToken, from, to). Accept either shape.
  let opts: TransactionPaginationOpts = {};
  if (typeof optsOrFrom === 'string' || typeof legacyTo === 'string') {
    opts = { from: typeof optsOrFrom === 'string' ? optsOrFrom : undefined, to: legacyTo };
  } else if (optsOrFrom) {
    opts = optsOrFrom;
  }

  const params = new URLSearchParams();
  if (opts.from) params.set('from', opts.from);
  if (opts.before) params.set('before', opts.before);
  if (opts.to) params.set('to', opts.to);

  const queryString = params.toString();
  const path = `/accounts/${accountId}/transactions${queryString ? `?${queryString}` : ''}`;

  const response = await yapilyRequest<
    YapilyApiResponse<YapilyTransaction[]>
  >(path, {
    headers: {
      consent: consentToken,
    },
  });

  return response.data || [];
}

// ── Consent Renewal ──

/**
 * Reconfirms (extends) an existing consent for the UK 90-day renewal cycle.
 * Uses PUT /account-auth-requests/{consentId}. Preserves the consent-id
 * and consent-token — no new connection row should be created on our
 * side after a successful reconfirm.
 */
export async function reconfirmConsent(
  consentId: string
): Promise<YapilyAuthResponse['data']> {
  const response = await yapilyRequest<YapilyAuthResponse>(
    `/account-auth-requests/${consentId}`,
    {
      method: 'PUT',
    }
  );

  return response.data;
}

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
    `/account-auth-requests/${consentId}`,
  );
  return response.data;
}

/**
 * DELETE /account-auth-requests/{id} — revokes the consent on Yapily's
 * side. Used by /api/bank/disconnect when the user clicks Disconnect (T8).
 *
 * Returns true on success. Treats 404 as "already gone" and resolves
 * (idempotent) so a duplicate disconnect doesn't error.
 */
export async function deleteAccountAuthorisation(consentId: string): Promise<boolean> {
  try {
    await yapilyRequest<YapilyApiResponse<unknown>>(
      `/account-auth-requests/${encodeURIComponent(consentId)}`,
      { method: 'DELETE' }
    );
    return true;
  } catch (err) {
    if (err instanceof YapilyError && err.status === 404) return true;
    throw err;
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
