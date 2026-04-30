/**
 * Portal password endpoints.
 *
 * POST   { action: 'sign_in', email, password }            — public sign-in
 * POST   { action: 'set',     password }                   — auth required
 * POST   { action: 'reset_request', email }                — emails magic link
 * GET    ?email=                                            — peek must_set_password
 *
 * On successful sign-in we issue the same 30-day session cookie used by the
 * magic-link flow.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { hashPassword, verifyPassword, passwordPolicyError, emailHasPortalAccess } from '@/lib/b2b/password';
import { createSession, setSessionCookie, authPortal, burnMagicLinkToken } from '@/lib/b2b/session';
import { audit, extractClientMeta } from '@/lib/b2b/audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

/**
 * Auth-required peek at the signed-in user's password state. Returns
 * {has_password, must_set_password} for the authenticated email only —
 * we never surface this for arbitrary emails to avoid an enumeration
 * oracle.
 */
export async function GET(request: NextRequest) {
  const auth = await authPortal(request, null, null);
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const supabase = getAdmin();
  const { data } = await supabase.from('b2b_credentials').select('password_hash, must_set_password').eq('email', auth.email).maybeSingle();
  return NextResponse.json({
    has_password: !!data?.password_hash,
    must_set_password: data ? data.must_set_password : true,
  });
}

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const action = String(body?.action || '');
  const meta = extractClientMeta(request);

  if (action === 'sign_in') {
    const email = String(body?.email || '').toLowerCase();
    const password = String(body?.password || '');
    if (!email || !password) return NextResponse.json({ error: 'email + password required' }, { status: 400 });

    const supabase = getAdmin();
    const { data: row } = await supabase
      .from('b2b_credentials')
      .select('email, password_hash, must_set_password')
      .eq('email', email)
      .maybeSingle();

    // Generic error to avoid email enumeration.
    if (!row?.password_hash) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }
    const ok = await verifyPassword(password, row.password_hash);
    if (!ok) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const sessionToken = await createSession(email, meta.ip_address, meta.user_agent);
    await supabase.from('b2b_credentials').update({
      last_sign_in_method: 'password',
      last_sign_in_at: new Date().toISOString(),
    }).eq('email', email);
    audit({ email, action: 'portal_signin', ...meta, metadata: { via: 'password' } });

    const res = NextResponse.json({ ok: true });
    setSessionCookie(res, sessionToken);
    return res;
  }

  if (action === 'set') {
    const auth = await authPortal(request, body, null);
    if (auth?.via === 'magic') await burnMagicLinkToken(body);
    if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
    const email = auth.email;
    const password = String(body?.password || '');
    const policy = passwordPolicyError(password);
    if (policy) return NextResponse.json({ error: policy }, { status: 400 });

    const supabase = getAdmin();
    const hash = await hashPassword(password);
    await supabase.from('b2b_credentials').upsert({
      email,
      password_hash: hash,
      must_set_password: false,
      password_set_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'email' });
    audit({ email, action: 'plan_changed', ...meta, metadata: { op: 'password_set' } });
    return NextResponse.json({ ok: true });
  }

  if (action === 'reset_request') {
    const email = String(body?.email || '').toLowerCase();
    // Reuse the magic-link login flow; portal-login already enforces
    // that the email has portal access and is enumeration-safe.
    if (!email) return NextResponse.json({ error: 'email required' }, { status: 400 });
    const has = await emailHasPortalAccess(email);
    if (has) {
      audit({ email, action: 'login_link_requested', ...meta, metadata: { via: 'password_reset' } });
      // Delegate to portal-login endpoint internally.
      try {
        await fetch(new URL('/api/v1/portal-login', request.url).toString(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
      } catch {}
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
