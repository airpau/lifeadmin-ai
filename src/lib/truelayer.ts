import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { encrypt, decrypt } from '@/lib/encrypt';

const TRUELAYER_AUTH_URL = process.env.TRUELAYER_AUTH_URL || 'https://auth.truelayer.com';
const TRUELAYER_API_URL = process.env.TRUELAYER_API_URL || 'https://api.truelayer.com';

export interface BankConnection {
  id: string;
  user_id: string;
  provider: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
  account_ids: string[] | null;
  bank_name: string | null;
  status: string;
  last_synced_at: string | null;
}

export interface TrueLayerAccount {
  account_id: string;
  account_type: string;
  display_name: string;
  currency: string;
  account_number: {
    iban?: string;
    number?: string;
    sort_code?: string;
  };
  provider?: {
    display_name?: string;
    provider_id?: string;
    logo_uri?: string;
  };
  description?: string;
}

export interface TrueLayerTransaction {
  transaction_id: string;
  normalised_provider_transaction_id?: string;
  timestamp: string;
  description: string;
  transaction_type: string;
  transaction_category: string;
  amount: number;
  currency: string;
  merchant_name?: string;
  meta?: Record<string, unknown>;
}

export interface BalanceInfo {
  current: number;
  available: number;
}

/**
 * Returns a valid access token, refreshing if expired.
 */
export async function getAccessToken(connection: BankConnection): Promise<string> {
  if (!connection.access_token) {
    throw new Error('No access token for connection');
  }

  // Check if token is expired (with 60s buffer)
  if (connection.token_expires_at) {
    const expiresAt = new Date(connection.token_expires_at).getTime();
    const now = Date.now() + 60_000;
    if (now >= expiresAt) {
      const refreshed = await refreshToken(connection);
      return refreshed;
    }
  }

  return decrypt(connection.access_token);
}

/**
 * Exchanges a refresh token for a new access token and updates the DB.
 */
export async function refreshToken(connection: BankConnection): Promise<string> {
  if (!connection.refresh_token) {
    throw new Error('No refresh token available');
  }

  const res = await fetch(`${TRUELAYER_AUTH_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.TRUELAYER_CLIENT_ID!,
      client_secret: process.env.TRUELAYER_CLIENT_SECRET!,
      refresh_token: decrypt(connection.refresh_token),
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const data = await res.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  // Encrypt tokens before storing in DB
  const supabase = await createClient();
  await supabase
    .from('bank_connections')
    .update({
      access_token: encrypt(data.access_token),
      refresh_token: data.refresh_token ? encrypt(data.refresh_token) : encrypt(decrypt(connection.refresh_token)),
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);

  return data.access_token;
}

/**
 * Fetches all current/savings accounts for a connection.
 */
export async function fetchAccounts(accessToken: string): Promise<TrueLayerAccount[]> {
  const res = await fetch(`${TRUELAYER_API_URL}/data/v1/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch accounts: ${res.status}`);
  }

  const data = await res.json();
  return data.results || [];
}

/**
 * Fetches all card accounts (debit/credit cards) for a connection.
 * Cards sometimes have faster transaction updates than current accounts.
 */
export async function fetchCards(accessToken: string): Promise<TrueLayerAccount[]> {
  try {
    const res = await fetch(`${TRUELAYER_API_URL}/data/v1/cards`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      console.log(`Cards endpoint not available: ${res.status}`);
      return [];
    }
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

/**
 * Fetches transactions for a card account.
 */
export async function fetchCardTransactions(
  accessToken: string,
  cardId: string,
  fromDate: Date
): Promise<TrueLayerTransaction[]> {
  const from = fromDate.toISOString().split('T')[0];
  // See fetchTransactions — 'to' in the future is now rejected by TrueLayer.
  const to = new Date().toISOString().split('T')[0];

  try {
    const url = `${TRUELAYER_API_URL}/data/v1/cards/${cardId}/transactions?from=${from}&to=${to}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

/**
 * Fetches pending card transactions (today's unsettled).
 */
export async function fetchCardPendingTransactions(
  accessToken: string,
  cardId: string
): Promise<TrueLayerTransaction[]> {
  try {
    const url = `${TRUELAYER_API_URL}/data/v1/cards/${cardId}/transactions/pending`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return data.results || [];
  } catch {
    return [];
  }
}

/**
 * Fetches transactions for a specific account from a given date.
 * Follows TrueLayer's next_link pagination to retrieve all pages.
 * TrueLayer may cap each page at ~500 results; without following next_link
 * users with many transactions see ~70% of their history (Ryan UAT bug).
 */
export async function fetchTransactions(
  accessToken: string,
  accountId: string,
  fromDate: Date
): Promise<TrueLayerTransaction[]> {
  const from = fromDate.toISOString().split('T')[0];
  // TrueLayer treats 'to=YYYY-MM-DD' as end-of-day (23:59:59Z) and rejects
  // any value whose end-of-day would be in the future. Using tomorrow here
  // worked historically but started returning 400 invalid_date_range around
  // 15 Apr 2026. Pass today's date — end-of-today covers all same-day
  // settled transactions; pending ones are picked up via the /pending endpoint.
  const to = new Date().toISOString().split('T')[0];

  const allTransactions: TrueLayerTransaction[] = [];
  let url: string | null =
    `${TRUELAYER_API_URL}/data/v1/accounts/${accountId}/transactions?from=${from}&to=${to}`;

  // Safety cap: 20 pages × 500 = 10,000 transactions max per account
  const MAX_PAGES = 20;
  let pages = 0;

  while (url && pages < MAX_PAGES) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Failed to fetch transactions for account ${accountId}: ${res.status} ${body.slice(0, 300)}`
      );
    }

    const data: { results?: TrueLayerTransaction[]; next_link?: string } = await res.json();
    const page = data.results || [];
    allTransactions.push(...page);

    // Follow next_link if TrueLayer has more pages
    url = data.next_link || null;
    pages++;

    // If we got a partial page, we've hit the end regardless of next_link
    if (page.length === 0) break;
  }

  if (pages >= MAX_PAGES) {
    console.warn(`[truelayer] fetchTransactions hit page cap (${MAX_PAGES}) for account ${accountId} — some older transactions may be missing`);
  }

  return allTransactions;
}

/**
 * Fetches pending (unsettled) transactions for a specific account.
 * These are today's transactions that haven't been settled yet by the bank.
 */
export async function fetchPendingTransactions(
  accessToken: string,
  accountId: string
): Promise<TrueLayerTransaction[]> {
  const url = `${TRUELAYER_API_URL}/data/v1/accounts/${accountId}/transactions/pending`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      // Pending endpoint may not be supported by all banks — non-fatal
      console.log(`Pending transactions not available for account ${accountId}: ${res.status}`);
      return [];
    }

    const data = await res.json();
    return data.results || [];
  } catch (err) {
    console.log(`Pending transactions fetch failed (non-fatal):`, err);
    return [];
  }
}

/**
 * Fetches current and available balance for a specific account.
 * Returns { current, available } or null on failure.
 */
export async function fetchBalances(
  accessToken: string,
  accountId: string
): Promise<BalanceInfo | null> {
  const url = `${TRUELAYER_API_URL}/data/v1/accounts/${accountId}/balance`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      console.log(`Balance not available for account ${accountId}: ${res.status}`);
      return null;
    }

    const data = await res.json();
    const results = data.results || [];

    if (results.length === 0) {
      return null;
    }

    // Get the first balance entry (usually the primary balance)
    const balance = results[0];
    return {
      current: parseFloat(String(balance.current)) || 0,
      available: parseFloat(String(balance.available)) || 0,
    };
  } catch (err) {
    console.log(`Balance fetch failed (non-fatal):`, err);
    return null;
  }
}

/**
 * Refreshes a TrueLayer access token using a provided Supabase client.
 * Use this in cron contexts where createClient() from next/headers is unavailable.
 */
export async function refreshTokenWithClient(
  connection: BankConnection,
  supabase: SupabaseClient
): Promise<string> {
  if (!connection.refresh_token) {
    throw new Error('No refresh token available');
  }

  const res = await fetch(`${TRUELAYER_AUTH_URL}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: process.env.TRUELAYER_CLIENT_ID!,
      client_secret: process.env.TRUELAYER_CLIENT_SECRET!,
      refresh_token: decrypt(connection.refresh_token),
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status}`);
  }

  const data = await res.json();
  const expiresAt = new Date(Date.now() + data.expires_in * 1000).toISOString();

  await supabase
    .from('bank_connections')
    .update({
      access_token: encrypt(data.access_token),
      refresh_token: data.refresh_token
        ? encrypt(data.refresh_token)
        : encrypt(decrypt(connection.refresh_token)),
      token_expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq('id', connection.id);

  return data.access_token;
}

/**
 * Returns a valid TrueLayer access token, refreshing if expired.
 * Use this in cron contexts where createClient() from next/headers is unavailable.
 */
export async function getAccessTokenWithClient(
  connection: BankConnection,
  supabase: SupabaseClient
): Promise<string> {
  if (!connection.access_token) {
    throw new Error('No access token for connection');
  }

  if (connection.token_expires_at) {
    const expiresAt = new Date(connection.token_expires_at).getTime();
    const now = Date.now() + 60_000; // 60s buffer
    if (now >= expiresAt) {
      return refreshTokenWithClient(connection, supabase);
    }
  }

  return decrypt(connection.access_token);
}
