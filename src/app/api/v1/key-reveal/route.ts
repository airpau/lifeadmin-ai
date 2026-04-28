/**
 * GET /api/v1/key-reveal?token=...&email=... — single-use plaintext reveal.
 *
 * On first GET: returns plaintext, clears the payload, marks token used.
 * On subsequent GET: returns 410 Gone with a "request a new key" message.
 *
 * Used by the email-link delivery flow that replaces direct plaintext-in-email.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const email = (url.searchParams.get('email') ?? '').toLowerCase();
  if (!token || !email) {
    return NextResponse.json({ error: 'Missing token or email' }, { status: 400 });
  }

  const supabase = getAdmin();
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { data } = await supabase
    .from('b2b_portal_tokens')
    .select('id, expires_at, used_at, payload, purpose, email')
    .eq('token_hash', tokenHash)
    .eq('email', email)
    .maybeSingle();

  if (!data || data.purpose !== 'reveal_key') {
    return NextResponse.json({ error: 'Link invalid.' }, { status: 404 });
  }
  if (data.used_at || !data.payload) {
    return NextResponse.json(
      { error: 'This link has already been used. For a new key, sign in to the portal and click Re-issue.' },
      { status: 410 },
    );
  }
  if (new Date(data.expires_at) < new Date()) {
    return NextResponse.json({ error: 'Link expired. Sign in to the portal and click Re-issue.' }, { status: 410 });
  }

  // Burn it: clear payload + mark used in a single update.
  await supabase
    .from('b2b_portal_tokens')
    .update({ used_at: new Date().toISOString(), payload: null })
    .eq('id', data.id);

  return NextResponse.json({ ok: true, plaintext: data.payload });
}
