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
  const { data, error } = await admin
    .from('provider_cancellation_info')
    .select('id, provider, display_name, category, method, email, phone, url, tips, data_source, confidence, auto_cancel_support, last_verified_at, updated_at')
    .order('last_verified_at', { ascending: true, nullsFirst: true })
    .order('provider', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Quick freshness buckets for the UI header.
  const now = Date.now();
  const rows = data ?? [];
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

  return NextResponse.json({ rows, stats });
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
