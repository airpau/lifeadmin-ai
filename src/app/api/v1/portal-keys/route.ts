/**
 * Portal-token-gated key management for B2B customers.
 *
 * GET  /api/v1/portal-keys?token=...&email=... — list keys
 * POST /api/v1/portal-keys                       — { action: 'revoke' | 'reissue', id, token, email }
 *
 * Token is single-use BUT we don't burn it on every read — that would
 * make the dashboard unusable. We burn the token only on a mutating
 * action (revoke / reissue). For reads we just verify it exists, isn't
 * expired, and matches the email. Tokens expire in 30 minutes either
 * way.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { generateKey } from '@/lib/b2b/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function verifyToken(supabase: any, token: string, email: string, burn: boolean): Promise<boolean> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { data } = await supabase
    .from('b2b_portal_tokens')
    .select('id, expires_at, used_at')
    .eq('token_hash', tokenHash)
    .eq('email', email)
    .maybeSingle();
  if (!data) return false;
  if (data.used_at) return false;
  if (new Date(data.expires_at) < new Date()) return false;
  if (burn) {
    await supabase
      .from('b2b_portal_tokens')
      .update({ used_at: new Date().toISOString() })
      .eq('id', data.id);
  }
  return true;
}

async function loadKeys(supabase: any, email: string) {
  const { data: keys } = await supabase
    .from('b2b_api_keys')
    .select('id, name, key_prefix, tier, monthly_limit, last_used_at, revoked_at, created_at')
    .eq('owner_email', email)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  // Compute monthly_used for each
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const ids = (keys ?? []).map((k: any) => k.id);
  const usageByKey = new Map<string, number>();
  if (ids.length > 0) {
    const { data: usage } = await supabase
      .from('b2b_api_usage')
      .select('key_id')
      .in('key_id', ids)
      .gte('created_at', monthStart.toISOString());
    for (const row of usage ?? []) {
      const k = (row as any).key_id as string;
      usageByKey.set(k, (usageByKey.get(k) ?? 0) + 1);
    }
  }
  return (keys ?? []).map((k: any) => ({ ...k, monthly_used: usageByKey.get(k.id) ?? 0 }));
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') ?? '';
  const email = (url.searchParams.get('email') ?? '').toLowerCase();
  if (!token || !email) return NextResponse.json({ error: 'Missing token or email' }, { status: 400 });

  const supabase = getAdmin();
  const ok = await verifyToken(supabase, token, email, false);
  if (!ok) return NextResponse.json({ error: 'Invalid or expired link. Request a new one.' }, { status: 401 });

  const keys = await loadKeys(supabase, email);
  return NextResponse.json({ keys });
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const token = String(body?.token || '');
  const email = String(body?.email || '').toLowerCase();
  const action = body?.action;
  const id = body?.id;
  if (!token || !email || !action || !id) {
    return NextResponse.json({ error: 'token, email, action, id required' }, { status: 400 });
  }

  const supabase = getAdmin();
  const ok = await verifyToken(supabase, token, email, true);
  if (!ok) return NextResponse.json({ error: 'Invalid or expired link. Request a new one.' }, { status: 401 });

  // Make sure the key actually belongs to this email.
  const { data: row } = await supabase
    .from('b2b_api_keys')
    .select('id, tier, monthly_limit, name, owner_email')
    .eq('id', id)
    .eq('owner_email', email)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'Key not found' }, { status: 404 });

  if (action === 'revoke') {
    await supabase
      .from('b2b_api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    return NextResponse.json({ ok: true });
  }

  if (action === 'reissue') {
    // Revoke old + insert new with same tier/limit/name + emit plaintext.
    await supabase
      .from('b2b_api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);

    const minted = generateKey();
    const { error } = await supabase.from('b2b_api_keys').insert({
      name: `${row.name} (re-issued)`,
      key_hash: minted.hash,
      key_prefix: minted.prefix,
      tier: row.tier,
      monthly_limit: row.monthly_limit,
      owner_email: email,
      notes: `Self-serve re-issue at ${new Date().toISOString()}`,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, plaintext: minted.plaintext });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
