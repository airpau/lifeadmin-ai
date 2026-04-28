/**
 * GET  /api/admin/b2b-keys — list issued keys (no plaintext, ever)
 * POST /api/admin/b2b-keys — mint a new key, plaintext returned ONCE
 * PATCH /api/admin/b2b-keys — revoke a key
 *
 * Founder-only via NEXT_PUBLIC_ADMIN_EMAILS. The plaintext from a
 * mint is shown once and then exists nowhere — no logs, no DB. If
 * the customer loses it they get a new one and we revoke the old.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';
import { generateKey } from '@/lib/b2b/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TIER_LIMITS: Record<string, number> = {
  starter: 1000,
  growth: 10_000,
  enterprise: 100_000,
};

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAdmin(): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'aireypaul@googlemail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!adminEmails.includes(user.email.toLowerCase())) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const supabase = getAdmin();
  const { data: keys, error } = await supabase
    .from('b2b_api_keys')
    .select('id, name, key_prefix, tier, monthly_limit, owner_email, waitlist_id, last_used_at, revoked_at, notes, created_at')
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Pull this-month usage counts for every key in one round trip.
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data: usage } = await supabase
    .from('b2b_api_usage')
    .select('key_id')
    .gte('created_at', monthStart.toISOString());
  const usageByKey = new Map<string, number>();
  for (const row of usage ?? []) {
    const k = (row as any).key_id as string;
    usageByKey.set(k, (usageByKey.get(k) ?? 0) + 1);
  }
  const enriched = (keys ?? []).map((k) => ({
    ...k,
    monthly_used: usageByKey.get(k.id) ?? 0,
  }));

  return NextResponse.json({ keys: enriched });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { name, tier, owner_email, waitlist_id, notes } = body ?? {};
  if (!name || typeof name !== 'string' || name.trim().length < 2) {
    return NextResponse.json({ error: '`name` is required' }, { status: 400 });
  }
  const t = tier ?? 'starter';
  if (!TIER_LIMITS[t]) {
    return NextResponse.json({ error: `\`tier\` must be one of ${Object.keys(TIER_LIMITS).join(', ')}` }, { status: 400 });
  }

  const minted = generateKey();
  const supabase = getAdmin();
  const { data, error } = await supabase
    .from('b2b_api_keys')
    .insert({
      name: name.trim(),
      key_hash: minted.hash,
      key_prefix: minted.prefix,
      tier: t,
      monthly_limit: TIER_LIMITS[t],
      owner_email: owner_email ?? null,
      waitlist_id: waitlist_id ?? null,
      notes: notes ?? null,
    })
    .select('id, name, key_prefix, tier, monthly_limit, created_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({
    ok: true,
    key: data,
    plaintext: minted.plaintext, // ⚠ shown ONCE — never persisted
    warning: 'Save this token now. You will not be able to retrieve it again.',
  });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, action } = body ?? {};
  if (!id || action !== 'revoke') {
    return NextResponse.json({ error: '`id` and `action: "revoke"` required' }, { status: 400 });
  }

  const supabase = getAdmin();
  const { error } = await supabase
    .from('b2b_api_keys')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
