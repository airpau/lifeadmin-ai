/**
 * GET /api/admin/legal-refs/audit?ref_id=...&limit=100
 *
 * Founder-gated. Returns the verification audit trail for a single
 * legal_references row (most-recent-first). Powers the admin "Audit
 * trail" drawer.
 *
 * GET /api/admin/legal-refs/audit?usages_for=<ref_id>&limit=50
 * — same gate, returns rows from legal_ref_usages for the same ref.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

function getAdminEmails(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'aireypaul@googlemail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function getAdmin() {
  return createAdminClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
  );
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const allow = getAdminEmails();
    if (!user?.email || !allow.includes(user.email.toLowerCase())) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const refId = url.searchParams.get('ref_id');
  const usagesFor = url.searchParams.get('usages_for');
  const blockEffectFor = url.searchParams.get('block_effect');
  const limit = Math.min(Number(url.searchParams.get('limit') || '100'), 500);

  const admin = getAdmin();

  // Aggregate "block effect" counts across many ref_ids.
  if (blockEffectFor) {
    const ids = blockEffectFor.split(',').filter(Boolean);
    if (ids.length === 0) return NextResponse.json({ counts: {} });
    const { data } = await admin
      .from('legal_ref_usages')
      .select('ref_id, product')
      .in('ref_id', ids);
    const counts: Record<string, { b2c: number; b2b: number; total: number }> = {};
    for (const id of ids) counts[id] = { b2c: 0, b2b: 0, total: 0 };
    for (const row of (data as Array<{ ref_id: string; product: string }>) || []) {
      const c = counts[row.ref_id];
      if (!c) continue;
      if (row.product === 'b2c-complaint') c.b2c += 1;
      else if (row.product === 'b2b-dispute') c.b2b += 1;
      c.total += 1;
    }
    return NextResponse.json({ counts });
  }

  if (usagesFor) {
    const { data } = await admin
      .from('legal_ref_usages')
      .select('id, ref_id, used_at, product, artefact_id, artefact_kind, user_id, api_key_id, cited_text')
      .eq('ref_id', usagesFor)
      .order('used_at', { ascending: false })
      .limit(limit);
    return NextResponse.json({ usages: data || [] });
  }

  if (refId) {
    const { data } = await admin
      .from('legal_ref_verifications')
      .select('id, ref_id, verified_at, verifier, triggered_by, before_status, after_status, before_url, after_url, changes, cost_gbp, notes')
      .eq('ref_id', refId)
      .order('verified_at', { ascending: false })
      .limit(limit);
    return NextResponse.json({ verifications: data || [] });
  }

  return NextResponse.json({ error: 'ref_id, usages_for, or block_effect required' }, { status: 400 });
}
