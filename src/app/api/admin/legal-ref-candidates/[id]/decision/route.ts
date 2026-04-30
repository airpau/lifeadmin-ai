/**
 * POST /api/admin/legal-ref-candidates/:id/decision
 *
 * Founder review action for a discovered legal-reference candidate.
 *
 * Body:
 *   { action: 'approve' | 'reject' | 'duplicate', notes?: string, duplicate_of?: uuid }
 *
 * Behaviour:
 *   - approve   : insert a new row into legal_references (discovery_source
 *                 set to 'perplexity_discovery'), mark candidate approved.
 *                 Never overwrites an existing ref.
 *   - reject    : mark candidate rejected with optional notes.
 *   - duplicate : mark candidate duplicate, store reference to the
 *                 existing legal_references.id in notes/duplicate_of.
 *
 * Auth: founder admin session (CRON_SECRET path also accepted via
 * authorizeAdminOrCron, mainly for tooling).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron, ADMIN_EMAIL } from '@/lib/admin-auth';

export const runtime = 'nodejs';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface DecisionBody {
  action: 'approve' | 'reject' | 'duplicate';
  notes?: string;
  duplicate_of?: string;
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  const { id } = await ctx.params;
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'missing id' }, { status: 400 });
  }

  let body: DecisionBody;
  try {
    body = (await request.json()) as DecisionBody;
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  if (!body.action || !['approve', 'reject', 'duplicate'].includes(body.action)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 });
  }

  const admin = getAdmin();

  const { data: cand, error: candErr } = await admin
    .from('legal_ref_candidates')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (candErr || !cand) {
    return NextResponse.json({ error: 'candidate not found' }, { status: 404 });
  }
  if (cand.status !== 'pending') {
    return NextResponse.json({ error: `candidate already ${cand.status}` }, { status: 409 });
  }

  const reviewer = ADMIN_EMAIL;
  const reviewedAt = new Date().toISOString();

  if (body.action === 'approve') {
    // Insert into legal_references. Use a defensive payload — only
    // columns that we know are safe across the shared B2C/B2B schema.
    // Other columns (escalation_body, strength, etc.) default to null /
    // their column defaults. The founder can edit further once it lands.
    const { error: insErr } = await admin.from('legal_references').insert({
      law_name: cand.title,
      summary: cand.summary || cand.title,
      source_url: cand.source_url,
      source_type: cand.source_type || 'guidance',
      category: cand.category || 'general',
      verification_status: 'needs_review', // founder-approved but unverified
      discovery_source: 'perplexity_discovery',
      pending_review: false,
    });
    if (insErr) {
      return NextResponse.json({ error: `legal_references insert failed: ${insErr.message}` }, { status: 500 });
    }
    await admin
      .from('legal_ref_candidates')
      .update({
        status: 'approved',
        reviewed_at: reviewedAt,
        reviewed_by: reviewer,
        notes: body.notes ?? null,
      })
      .eq('id', id);
    return NextResponse.json({ ok: true, action: 'approve' });
  }

  if (body.action === 'reject') {
    await admin
      .from('legal_ref_candidates')
      .update({
        status: 'rejected',
        reviewed_at: reviewedAt,
        reviewed_by: reviewer,
        notes: body.notes ?? null,
      })
      .eq('id', id);
    return NextResponse.json({ ok: true, action: 'reject' });
  }

  // duplicate
  await admin
    .from('legal_ref_candidates')
    .update({
      status: 'duplicate',
      reviewed_at: reviewedAt,
      reviewed_by: reviewer,
      duplicate_of: body.duplicate_of ?? null,
      notes: body.notes ?? (body.duplicate_of ? `duplicate of ${body.duplicate_of}` : null),
    })
    .eq('id', id);
  return NextResponse.json({ ok: true, action: 'duplicate' });
}
