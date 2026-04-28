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
    .select('id, name, key_prefix, tier, monthly_limit, last_used_at, revoked_at, created_at, allowed_ips, weekly_digest_opt_in')
    .eq('owner_email', email)
    .is('revoked_at', null)
    .order('created_at', { ascending: false });

  // Owner-wide monthly usage — sum across every key (active + revoked)
  // because the rate limit in /lib/b2b/auth.ts is enforced per-owner,
  // not per-key. Each active key card shows the SAME owner total so
  // there's no confusion about "I made 3 calls but it shows 1".
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const { data: allOwnerKeys } = await supabase
    .from('b2b_api_keys')
    .select('id')
    .eq('owner_email', email);
  const allKeyIds = (allOwnerKeys ?? []).map((k: any) => k.id as string);
  let ownerMonthlyUsed = 0;
  if (allKeyIds.length > 0) {
    const { count } = await supabase
      .from('b2b_api_usage')
      .select('id', { count: 'exact', head: true })
      .in('key_id', allKeyIds)
      .gte('created_at', monthStart.toISOString());
    ownerMonthlyUsed = count ?? 0;
  }
  return (keys ?? []).map((k: any) => ({ ...k, monthly_used: ownerMonthlyUsed }));
}

async function loadAudit(supabase: any, email: string, limit = 25) {
  const { data } = await supabase
    .from('b2b_audit_log')
    .select('id, action, actor, key_id, ip_address, user_agent, metadata, created_at')
    .eq('email', email)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

async function loadRecentUsage(supabase: any, keyIds: string[], limit = 50) {
  if (keyIds.length === 0) return [];
  const { data } = await supabase
    .from('b2b_api_usage')
    .select('key_id, endpoint, status_code, latency_ms, scenario_kind, error_code, created_at')
    .in('key_id', keyIds)
    .order('created_at', { ascending: false })
    .limit(limit);
  return data ?? [];
}

async function loadUsageDaily(supabase: any, keyIds: string[]) {
  if (keyIds.length === 0) return [];
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const { data } = await supabase
    .from('b2b_api_usage')
    .select('created_at, status_code')
    .in('key_id', keyIds)
    .gte('created_at', since);
  // Group by day in JS — simpler than custom RPC, fine at 100k/mo cap.
  const byDay = new Map<string, { ok: number; err: number }>();
  for (const r of (data ?? []) as Array<{ created_at: string; status_code: number }>) {
    const day = r.created_at.slice(0, 10);
    const cur = byDay.get(day) ?? { ok: 0, err: 0 };
    if (r.status_code >= 400) cur.err++;
    else cur.ok++;
    byDay.set(day, cur);
  }
  return Array.from(byDay.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([day, v]) => ({ day, ...v }));
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const auth = await authPortal(request, null, { token: url.searchParams.get('token'), email: url.searchParams.get('email') });
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const email = auth.email;
  const supabase = getAdmin();

  // Log a portal_signin event the first time a token is read in a session.
  // We don't dedupe across reads — each load is one event. The portal UI
  // pulls audit on every page render, so over-counting is bounded by user
  // interaction, not refresh-spamming.
  const meta = extractClientMeta(request);
  audit({ email, action: 'portal_signin', ...meta });

  // Resolve which owner_email account this signed-in email should see.
  // Members see their owner's account; owners see their own.
  const { resolveOwner } = await import('../portal-members/route');
  const { owner, role } = await resolveOwner(supabase as any, email);

  const keys = await loadKeys(supabase, owner);
  const allKeys = await loadAllKeys(supabase, owner);
  const recentUsage = await loadRecentUsage(supabase, allKeys.map((k: any) => k.id));
  const usageDaily = await loadUsageDaily(supabase, allKeys.map((k: any) => k.id));
  const auditLog = await loadAudit(supabase, email);

  // Calls this month on now-revoked keys — surfaces in the UI so a
  // user who just re-issued doesn't think their old usage vanished.
  const monthStart = new Date(); monthStart.setUTCDate(1); monthStart.setUTCHours(0, 0, 0, 0);
  const revokedKeyIds: string[] = (allKeys as any[]).filter((k: any) => k.revoked_at).map((k: any) => k.id);
  let revokedKeyUsageThisMonth = 0;
  if (revokedKeyIds.length > 0) {
    const { count } = await supabase
      .from('b2b_api_usage')
      .select('id', { count: 'exact', head: true })
      .in('key_id', revokedKeyIds)
      .gte('created_at', monthStart.toISOString());
    revokedKeyUsageThisMonth = count ?? 0;
  }

  return NextResponse.json({
    keys,            // active keys with monthly usage
    all_keys: allKeys, // including revoked, for history
    recent_usage: recentUsage,
    usage_daily: usageDaily,
    audit_log: auditLog,
    revoked_key_usage_this_month: revokedKeyUsageThisMonth,
  });
}

async function loadAllKeys(supabase: any, email: string) {
  const { data } = await supabase
    .from('b2b_api_keys')
    .select('id, name, key_prefix, tier, monthly_limit, last_used_at, revoked_at, created_at')
    .eq('owner_email', email)
    .order('created_at', { ascending: false });
  return data ?? [];
}

export async function POST(request: NextRequest) {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const action = body?.action;
  const id = body?.id;
  if (!action || !id) {
    return NextResponse.json({ error: 'action + id required' }, { status: 400 });
  }
  const auth = await authPortal(request, body, null);
  if (auth?.via === "magic") await burnMagicLinkToken(body);
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const email = auth.email;
  const supabase = getAdmin();

  // Mutations must respect the member→owner mapping so admins on a
  // teammate-invited account can revoke / reissue keys they can see.
  const { resolveOwner } = await import('../portal-members/route');
  const { owner, role } = await resolveOwner(supabase as any, email);
  if (role !== 'admin') {
    return NextResponse.json({ error: 'Admin role required to mutate keys.' }, { status: 403 });
  }
  const { data: row } = await supabase
    .from('b2b_api_keys')
    .select('id, tier, monthly_limit, name, owner_email')
    .eq('id', id)
    .eq('owner_email', owner)
    .maybeSingle();
  if (!row) return NextResponse.json({ error: 'Key not found' }, { status: 404 });

  const meta = extractClientMeta(request);

  if (action === 'revoke') {
    await supabase
      .from('b2b_api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    audit({ email, action: 'key_revoked', key_id: id, ...meta, metadata: { name: row.name } });
    return NextResponse.json({ ok: true });
  }

  if (action === 'reissue') {
    // Revoke old + insert new with same tier/limit/name + emit plaintext.
    await supabase
      .from('b2b_api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id);
    audit({ email, action: 'key_revoked', key_id: id, ...meta, metadata: { name: row.name, reason: 'reissue_revoke' } });

    const minted = generateKey();
    const { data: inserted, error } = await supabase.from('b2b_api_keys').insert({
      name: `${row.name} (re-issued)`,
      key_hash: minted.hash,
      key_prefix: minted.prefix,
      tier: row.tier,
      monthly_limit: row.monthly_limit,
      owner_email: owner,
      notes: `Self-serve re-issue at ${new Date().toISOString()} by ${email}`,
    }).select('id').single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    audit({ email, action: 'key_reissued', key_id: inserted?.id ?? null, ...meta, metadata: { tier: row.tier, prefix: minted.prefix } });
    return NextResponse.json({ ok: true, plaintext: minted.plaintext });
  }

  return NextResponse.json({ error: 'unknown action' }, { status: 400 });
}
