import type {
  YapilyInstitution,
  YapilyAccount,
  YapilyTransaction,
  YapilyApiResponse,
  YapilyAuthResponse,
  YapilyErrorResponse,
} from '@/types/yapily';

const YAPILY_BASE_URL = 'https://api.yapily.com';

// ── Auth Helper ──

function getAuthHeader(): string {
  const uuid = process.env.YAPILY_APPLICATION_UUID;
  const secret = process.env.YAPILY_APPLICATION_SECRET;

  if (!uuid || !secret) {
    throw new Error(
      'YAPILY_APPLICATION_UUID and YAPILY_APPLICATION_SECRET must be set'
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
    let errorMessage = `Yapily API error: ${res.status} ${res.statusText}`;
    try {
      const errorBody = (await res.json()) as YapilyErrorResponse;
      if (errorBody.error?.message) {
        errorMessage = `Yapily API error: ${errorBody.error.message} (${res.status})`;
      }
    } catch {
      // Body not parseable — use default message
    }
    throw new Error(errorMessage);
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
 * Fetches transactions for a specific account.
 * Optionally filter by date range (ISO 8601 format).
 */
export async function getTransactions(
  accountId: string,
  consentToken: string,
  from?: string,
  to?: string
): Promise<YapilyTransaction[]> {
  const params = new URLSearchParams();
  if (from) params.set('from', from);
  if (to) params.set('to', to);

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
