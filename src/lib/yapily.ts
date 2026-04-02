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
 */
export async function createAccountAuthorisation(
  institutionId: string,
  callbackUrl: string,
  userUuid: string
): Promise<YapilyAuthResponse['data']> {
  const response = await yapilyRequest<YapilyAuthResponse>(
    '/account-auth-requests',
    {
      method: 'POST',
      body: JSON.stringify({
        applicationUserId: userUuid,
        institutionId,
        callback: callbackUrl,
      }),
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
 * Uses PUT /account-auth-requests/{consentId}.
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
