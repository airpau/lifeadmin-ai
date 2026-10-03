/**
 * Server side of accountant share links: resolve a presented token to
 * its owner, with rate limiting and expiry/revocation checks.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getEffectiveTier } from '@/lib/plan-limits';
import { documentEntitlements } from '@/lib/documents/plan';
import { looksLikeShareToken, shareLinkStatus, shareTokenMatches, shareTokenPrefix } from '@/lib/documents/share-token';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = SupabaseClient<any, any, any>;

export interface ResolvedShareLink {
  linkId: string;
  userId: string;
  label: string | null;
  expiresAt: string;
}

export type ShareResolveResult =
  | { ok: true; link: ResolvedShareLink }
  | { ok: false; reason: 'invalid' | 'expired' | 'revoked' | 'plan' };

/**
 * Look up a share token. The prefix narrows the lookup and the hash is
 * compared in constant time. The owner must still be on a plan with the
 * accountant register (a downgrade switches every link off at once).
 */
export async function resolveShareToken(admin: Admin, token: string | null | undefined): Promise<ShareResolveResult> {
  if (!looksLikeShareToken(token)) return { ok: false, reason: 'invalid' };
  const prefix = shareTokenPrefix(token);
  const { data: rows } = await admin
    .from('document_share_links')
    .select('id, user_id, token_hash, label, expires_at, revoked_at')
    .eq('token_prefix', prefix)
    .limit(5);
  const row = (rows ?? []).find((r) => shareTokenMatches(token, r.token_hash as string));
  if (!row) return { ok: false, reason: 'invalid' };
  const status = shareLinkStatus({ expires_at: row.expires_at as string, revoked_at: row.revoked_at as string | null });
  if (status !== 'active') return { ok: false, reason: status };

  const ent = documentEntitlements(await getEffectiveTier(row.user_id as string));
  if (!ent.accountantRegister) return { ok: false, reason: 'plan' };

  return { ok: true, link: { linkId: row.id as string, userId: row.user_id as string, label: (row.label as string | null) ?? null, expiresAt: row.expires_at as string } };
}

/** Best-effort usage counter for the owner's "last opened" display. */
export async function touchShareLink(admin: Admin, linkId: string): Promise<void> {
  try {
    const { data } = await admin.from('document_share_links').select('use_count').eq('id', linkId).maybeSingle();
    await admin
      .from('document_share_links')
      .update({ last_used_at: new Date().toISOString(), use_count: ((data?.use_count as number | null) ?? 0) + 1 })
      .eq('id', linkId);
  } catch {
    // audit only
  }
}

/** Client IP from Vercel's forwarding headers, for rate limiting. */
export function clientIp(headers: Headers): string | null {
  const fwd = headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0].trim() || null;
  return headers.get('x-real-ip');
}
