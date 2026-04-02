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
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const to = tomorrow.toISOString().split('T')[0];

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
 */
export async function fetchTransactions(
  accessToken: string,
  accountId: string,
  fromDate: Date
): Promise<TrueLayerTransaction[]> {
  const from = fromDate.toISOString().split('T')[0];
  // TrueLayer 'to' is exclusive — add +1 day to include today's transactions
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const to = tomorrow.toISOString().split('T')[0];

  const url = `${TRUELAYER_API_URL}/data/v1/accounts/${accountId}/transactions?from=${from}&to=${to}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to fetch transactions for account ${accountId}: ${res.status}`);
  }

  const data = await res.json();
  return data.results || [];
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
