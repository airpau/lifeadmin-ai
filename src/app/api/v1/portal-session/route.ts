/**
 * POST /api/v1/portal-session — exchange a magic-link token for a
 * long-lived session cookie. Burns the magic-link token in the process.
 *
 * Body: { token, email }
 *
 * After this, the customer's portal cookie is good for 30 days; they
 * don't need another magic link unless they sign out or the session
 * expires. Members invited to an account each get their own session.
 *
 * DELETE — sign out (revoke the current session + clear cookie).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { createSession, setSessionCookie, clearSessionCookie, readSessionCookie, revokeSession } from '@/lib/b2b/session';
import { audit, extractClientMeta } from '@/lib/b2b/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const token = String(body?.token || '');
  const email = String(body?.email || '').toLowerCase();
  if (!token || !email) return NextResponse.json({ error: 'token + email required' }, { status: 400 });

  const supabase = getAdmin();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { data } = await supabase
    .from('b2b_portal_tokens')
    .select('id, expires_at, used_at, purpose')
    .eq('token_hash', tokenHash)
    .eq('email', email)
    .maybeSingle();
  if (!data || data.used_at || data.purpose !== 'signin' || new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link expired or invalid. Request a new one.' }, { status: 401 });
  }

  // Burn the magic-link token — single use.
  await supabase.from('b2b_portal_tokens').update({ used_at: new Date().toISOString() }).eq('id', data.id);

  const meta = extractClientMeta(request);
  const sessionToken = await createSession(email, meta.ip_address, meta.user_agent);
  audit({ email, action: 'portal_signin', ...meta, metadata: { via: 'magic_link_to_session' } });

  const res = NextResponse.json({ ok: true });
  setSessionCookie(res, sessionToken);
  return res;
}

export async function DELETE(request: NextRequest) {
  const cookie = readSessionCookie(request);
  await revokeSession(cookie);
  const res = NextResponse.json({ ok: true });
  clearSessionCookie(res);
  return res;
}
