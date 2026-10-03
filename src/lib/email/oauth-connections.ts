/**
 * Per-mailbox OAuth helpers for the Gmail and Outlook scan paths.
 *
 * Why this exists:
 *  - /api/gmail/scan used to read the single `gmail_tokens` row, so only
 *    the most recently connected Gmail was ever scanned, and after a
 *    refresh it wrote that one access token into EVERY Google row the
 *    user had, so every other Gmail connection then held the wrong
 *    account's token.
 *  - /api/outlook/scan used .single(), so a second Outlook account made
 *    the user look "not connected".
 *
 * The rules here:
 *  - each email_connections row is refreshed on its own and the new
 *    token is written back ONLY to that row (by id)
 *  - tokens are decrypted on read and encrypted on write
 *    (src/lib/email/token-crypto.ts)
 *  - a permanent refresh failure (revoked / expired grant) marks the row
 *    `needs_reauth` (same pattern as src/lib/dispute-sync/fetchers.ts);
 *    a transient failure or an unreadable encrypted token does not
 *  - `gmail_tokens` is kept for legacy readers only. It is updated when,
 *    and only when, the connection being refreshed is the same mailbox
 *    that row already describes. It is never used to choose what to scan.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { refreshAccessToken as refreshGmailToken } from '@/lib/gmail';
import { refreshMicrosoftToken } from '@/lib/outlook';
import { decryptToken, encryptToken, isTokenUnreadable } from '@/lib/email/token-crypto';
import { isPermanentRefreshFailure } from '@/lib/email/oauth-refresh-error';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export type OAuthScanProvider = 'google' | 'outlook';

export interface OAuthConnectionRow {
  id: string;
  user_id: string;
  email_address: string;
  provider_type: string;
  auth_method: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expiry: string | null;
  status: string;
  last_scanned_at: string | null;
  last_full_scanned_at: string | null;
  emails_scanned: number | null;
}

export const OAUTH_CONNECTION_COLUMNS =
  'id, user_id, email_address, provider_type, auth_method, access_token, refresh_token, token_expiry, status, last_scanned_at, last_full_scanned_at, emails_scanned';

/**
 * Every active, non-archived OAuth connection of one provider for a user,
 * oldest first. Archived rows (over-cap after a plan downgrade) are
 * skipped so a downgraded user is not scanned beyond their plan.
 */
export async function listActiveOAuthConnections(
  admin: Admin,
  userId: string,
  provider: OAuthScanProvider,
): Promise<{ rows: OAuthConnectionRow[]; error: string | null }> {
  const { data, error } = await admin
    .from('email_connections')
    .select(OAUTH_CONNECTION_COLUMNS)
    .eq('user_id', userId)
    .eq('provider_type', provider)
    .eq('auth_method', 'oauth')
    .eq('status', 'active')
    .is('archived_at', null)
    .order('created_at', { ascending: true });
  return { rows: (data as OAuthConnectionRow[] | null) ?? [], error: error?.message ?? null };
}

/** True if the user has any Google OAuth row at all, in any status. */
export async function hasAnyGoogleConnectionRow(admin: Admin, userId: string): Promise<boolean> {
  const { count } = await admin
    .from('email_connections')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('provider_type', 'google');
  return (count ?? 0) > 0;
}

/** True if the user has a connection of this provider waiting on a reconnect. */
export async function hasConnectionsNeedingReauth(
  admin: Admin,
  userId: string,
  provider: OAuthScanProvider,
): Promise<boolean> {
  const { count } = await admin
    .from('email_connections')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('provider_type', provider)
    .in('status', ['needs_reauth', 'expired']);
  return (count ?? 0) > 0;
}

/**
 * Merge opportunities from several mailboxes. Drops repeats of the same
 * message id and of the same title (the persistence code downstream
 * already dedupes against the database by title, so two inboxes that
 * both received "Netflix price increase" must not insert it twice).
 */
export function mergeOpportunities<T extends { title?: string | null; emailId?: string | null }>(lists: T[][]): T[] {
  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const out: T[] = [];
  for (const list of lists) {
    for (const o of list) {
      const id = o.emailId || '';
      const title = (o.title || '').trim().toLowerCase();
      if (id && seenIds.has(id)) continue;
      if (title && seenTitles.has(title)) continue;
      if (id) seenIds.add(id);
      if (title) seenTitles.add(title);
      out.push(o);
    }
  }
  return out;
}

export type ScanTokenResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: 'needs_reauth' | 'unavailable'; message: string };

export async function markConnectionNeedsReauth(admin: Admin, connectionId: string, message: string): Promise<void> {
  try {
    await admin
      .from('email_connections')
      .update({
        status: 'needs_reauth',
        last_error: message.slice(0, 500),
        last_error_at: new Date().toISOString(),
      })
      .eq('id', connectionId);
  } catch {
    // Bookkeeping must never mask the real failure.
  }
}

async function noteTransientError(admin: Admin, connectionId: string, message: string): Promise<void> {
  try {
    await admin
      .from('email_connections')
      .update({ last_error: message.slice(0, 500), last_error_at: new Date().toISOString() })
      .eq('id', connectionId);
  } catch {
    // ignore
  }
}

/**
 * Write a refreshed token into the legacy `gmail_tokens` row, but only
 * if that row already describes this mailbox. Never repoints the row at
 * a different account.
 */
export async function syncLegacyGmailTokens(
  admin: Admin,
  userId: string,
  email: string,
  fields: { accessToken: string; tokenExpiry: string; refreshToken?: string | null },
): Promise<void> {
  try {
    await admin
      .from('gmail_tokens')
      .update({
        access_token: encryptToken(fields.accessToken),
        token_expiry: fields.tokenExpiry,
        ...(fields.refreshToken ? { refresh_token: encryptToken(fields.refreshToken) } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
      .eq('email', email);
  } catch {
    // Legacy mirror only; never fail a scan over it.
  }
}

/**
 * Decide whether a newly connected Gmail address should become the
 * legacy `gmail_tokens` row. True when there is no row yet, when the row
 * is already this address (a reconnect), or when the row points at a
 * mailbox that no longer has an active Google connection. Otherwise the
 * existing primary is kept so connecting a second Gmail does not silently
 * change what legacy readers see.
 */
export async function shouldWriteLegacyGmailTokens(admin: Admin, userId: string, email: string): Promise<boolean> {
  const { data: existing } = await admin
    .from('gmail_tokens')
    .select('email')
    .eq('user_id', userId)
    .maybeSingle();
  if (!existing?.email) return true;
  if (String(existing.email).toLowerCase() === email.toLowerCase()) return true;
  const { count } = await admin
    .from('email_connections')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('provider_type', 'google')
    .eq('status', 'active')
    .eq('email_address', existing.email);
  return (count ?? 0) === 0;
}

/**
 * Get a usable access token for one connection, refreshing it and
 * persisting the result to that row only.
 *
 * alwaysRefresh (default true for scans): refresh whenever a refresh
 * token exists, as the scan routes always have. This also repairs rows
 * whose stored access token was overwritten with another mailbox's token
 * by the old bulk update.
 */
export async function getScanAccessToken(
  admin: Admin,
  conn: OAuthConnectionRow,
  opts: { alwaysRefresh?: boolean } = {},
): Promise<ScanTokenResult> {
  const alwaysRefresh = opts.alwaysRefresh ?? true;
  const provider: OAuthScanProvider = conn.provider_type === 'outlook' ? 'outlook' : 'google';
  const label = provider === 'google' ? 'Gmail' : 'Microsoft';

  if (isTokenUnreadable(conn.refresh_token) || (!conn.refresh_token && isTokenUnreadable(conn.access_token))) {
    const message = 'Stored token could not be decrypted (EMAIL_ENCRYPTION_KEY missing or changed).';
    console.error(`[oauth-connections] ${conn.id}: ${message}`);
    return { ok: false, reason: 'unavailable', message };
  }

  const refreshToken = decryptToken(conn.refresh_token);
  const accessToken = decryptToken(conn.access_token);
  const expiresAt = conn.token_expiry ? new Date(conn.token_expiry).getTime() : 0;
  const stillValid = !!accessToken && expiresAt - Date.now() > 60_000;

  if (!refreshToken) {
    if (stillValid) return { ok: true, accessToken: accessToken! };
    const message = `No refresh token on file. Please reconnect your ${label} account.`;
    await markConnectionNeedsReauth(admin, conn.id, message);
    return { ok: false, reason: 'needs_reauth', message };
  }

  if (!alwaysRefresh && stillValid) return { ok: true, accessToken: accessToken! };

  try {
    let newAccess: string;
    let expiresIn: number;
    let rotatedRefresh: string | undefined;
    if (provider === 'google') {
      const r = await refreshGmailToken(refreshToken);
      newAccess = r.access_token;
      expiresIn = r.expires_in || 3600;
    } else {
      const r = await refreshMicrosoftToken(refreshToken);
      newAccess = r.access_token;
      expiresIn = r.expires_in || 3600;
      rotatedRefresh = r.refresh_token;
    }
    const tokenExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

    const { error: updErr } = await admin
      .from('email_connections')
      .update({
        access_token: encryptToken(newAccess),
        token_expiry: tokenExpiry,
        ...(rotatedRefresh ? { refresh_token: encryptToken(rotatedRefresh) } : {}),
        status: 'active',
        last_error: null,
        last_error_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', conn.id);
    if (updErr) console.error(`[oauth-connections] token persist failed for ${conn.id}:`, updErr.message);

    if (provider === 'google') {
      await syncLegacyGmailTokens(admin, conn.user_id, conn.email_address, { accessToken: newAccess, tokenExpiry });
    }
    return { ok: true, accessToken: newAccess };
  } catch (err) {
    const message = err instanceof Error ? err.message : `${label} token refresh failed`;
    if (isPermanentRefreshFailure(err)) {
      await markConnectionNeedsReauth(admin, conn.id, message);
      return { ok: false, reason: 'needs_reauth', message };
    }
    await noteTransientError(admin, conn.id, message);
    return { ok: false, reason: 'unavailable', message };
  }
}
