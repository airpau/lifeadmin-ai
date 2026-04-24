/**
 * GET  /api/admin/cancel-info         → list all provider_cancellation_info rows
 * PATCH /api/admin/cancel-info?id=... → update one row (admin-only manual correction)
 *
 * Backs the admin coverage page. Lets the founder see what the
 * seeder + Perplexity refresh cron have populated, spot-check
 * freshness, and correct anything the cron got wrong. When a row is
 * manually updated we stamp data_source='admin' and bump confidence
 * to 'high' so the refresh cron deprioritises it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const EDITABLE_FIELDS = [
  'display_name', 'category', 'method', 'email', 'phone', 'url', 'tips', 'auto_cancel_support',
] as const;

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });

  const admin = getAdmin();
  const [infoRes, subsRes] = await Promise.all([
    admin
      .from('provider_cancellation_info')
      .select('id, provider, display_name, category, method, email, phone, url, tips, data_source, confidence, auto_cancel_support, last_verified_at, updated_at, aliases')
      .order('last_verified_at', { ascending: true, nullsFirst: true })
      .order('provider', { ascending: true }),
    admin
      .from('subscriptions')
      .select('provider_name, user_id')
      .eq('status', 'active')
      .is('dismissed_at', null),
  ]);

  if (infoRes.error) return NextResponse.json({ error: infoRes.error.message }, { status: 500 });

  const rows = infoRes.data ?? [];

  // Quick freshness buckets for the UI header.
  const now = Date.now();
  const stats = {
    total: rows.length,
    verified_30d: rows.filter((r) => r.last_verified_at && (now - new Date(r.last_verified_at).getTime()) < 30 * 86_400_000).length,
    unverified: rows.filter((r) => !r.last_verified_at).length,
    by_confidence: {
      high: rows.filter((r) => r.confidence === 'high').length,
      medium: rows.filter((r) => r.confidence === 'medium').length,
      low: rows.filter((r) => r.confidence === 'low').length,
    },
    by_source: {
      seed: rows.filter((r) => r.data_source === 'seed').length,
      perplexity: rows.filter((r) => r.data_source === 'perplexity').length,
      ai: rows.filter((r) => r.data_source === 'ai').length,
      admin: rows.filter((r) => r.data_source === 'admin').length,
    },
  };

  // Providers seen on a user's subscriptions but not yet covered by any
  // row in provider_cancellation_info (neither canonical nor alias
  // match). Mirrors the fuzzy-match logic the discovery leg of the
  // Perplexity cron uses, so this is a preview of what Monday's run
  // will consider. Ranked by user count descending so the highest-
  // impact gaps float to the top.
  const normalise = (s: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const hasCoverage = (name: string): boolean => {
    const search = normalise(name);
    if (!search) return true;
    const first = search.split(/\s+/)[0];
    for (const r of rows) {
      if (search.includes(r.provider) || r.provider.includes(first)) return true;
      for (const a of r.aliases ?? []) {
        const alias = (a ?? '').toLowerCase();
        if (!alias) continue;
        if (search.includes(alias) || alias.includes(first)) return true;
      }
    }
    return false;
  };

  const userCountByName = new Map<string, Set<string>>();
  for (const s of subsRes.data ?? []) {
    const name = (s.provider_name as string | null)?.trim();
    if (!name || name.length < 3) continue;
    const set = userCountByName.get(name) ?? new Set<string>();
    set.add(s.user_id as string);
    userCountByName.set(name, set);
  }

  const uncovered = Array.from(userCountByName.entries())
    .filter(([name]) => !hasCoverage(name))
    .map(([name, users]) => ({ provider_name: name, user_count: users.size }))
    .sort((a, b) => b.user_count - a.user_count)
    .slice(0, 50);

  return NextResponse.json({ rows, stats, uncovered });
}

export async function PATCH(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  for (const field of EDITABLE_FIELDS) {
    if (field in body) patch[field] = body[field];
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No editable fields in body' }, { status: 400 });
  }

  // Admin edits are ground truth — mark data_source + confidence so
  // the refresh cron deprioritises them and doesn't overwrite with
  // Perplexity's guess on the next run.
  patch.data_source = 'admin';
  patch.confidence = 'high';
  patch.last_verified_at = new Date().toISOString();

  const admin = getAdmin();
  const { data, error } = await admin
    .from('provider_cancellation_info')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, row: data });
}
