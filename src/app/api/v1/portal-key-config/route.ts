/**
 * POST /api/v1/portal-key-config — per-key configuration changes.
 *
 * Body: { token, email, id, allowed_ips?: string[] | null, weekly_digest_opt_in?: boolean }
 *
 * IP allow-list is paid-tier only (growth + enterprise). Starter keys
 * cannot configure it — UI gates this, but enforce here too.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { audit, extractClientMeta } from '@/lib/b2b/audit';
import { authPortal, burnMagicLinkToken } from "@/lib/b2b/session";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function verifyToken(supabase: any, token: string, email: string): Promise<boolean> {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const { data } = await supabase.from('b2b_portal_tokens').select('id, expires_at, used_at').eq('token_hash', tokenHash).eq('email', email).maybeSingle();
  if (!data || data.used_at || new Date(data.expires_at) < new Date()) return false;
  await supabase.from('b2b_portal_tokens').update({ used_at: new Date().toISOString() }).eq('id', data.id);
  return true;
}

export async function POST(request: NextRequest) {
  let body: any;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const id = String(body?.id || '');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const auth = await authPortal(request, body, null);
  if (auth?.via === "magic") await burnMagicLinkToken(body);
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const email = auth.email;
  const supabase = getAdmin();

  // Resolve owner; member must be admin to mutate.
  const { resolveOwner } = await import('../portal-members/route');
  const { owner, role } = await resolveOwner(supabase as any, email);
  if (role !== 'admin') return NextResponse.json({ error: 'Admin role required.' }, { status: 403 });

  const { data: row } = await supabase
    .from('b2b_api_keys')
    .select('id, tier, owner_email')
    .eq('id', id)
    .eq('owner_email', owner)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'Key not found' }, { status: 404 });

  const patch: Record<string, any> = {};
  if (Array.isArray(body?.allowed_ips) || body?.allowed_ips === null) {
    if (row.tier === 'starter') {
      return NextResponse.json({ error: 'IP allow-listing is available on Growth and Enterprise tiers.' }, { status: 403 });
    }
    const ips: string[] = Array.isArray(body.allowed_ips) ? body.allowed_ips.map((s: string) => String(s).trim()).filter(Boolean) : [];
    patch.allowed_ips = ips.length === 0 ? null : ips;
  }
  if (typeof body?.weekly_digest_opt_in === 'boolean') {
    patch.weekly_digest_opt_in = body.weekly_digest_opt_in;
  }
  if (Object.keys(patch).length === 0) return NextResponse.json({ error: 'no changes' }, { status: 400 });

  const { error } = await supabase.from('b2b_api_keys').update(patch).eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const meta = extractClientMeta(request);
  audit({ email, action: 'plan_changed', key_id: id, ...meta, metadata: { op: 'key_config_updated', patch } });

  return NextResponse.json({ ok: true });
}
