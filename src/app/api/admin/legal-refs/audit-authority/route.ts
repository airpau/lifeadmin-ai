/**
 * POST /api/admin/legal-refs/audit-authority
 *
 * Founder-gated retroactive sweep. Reads every row in legal_references,
 * runs checkUkLegalAuthority on its source_url, and:
 *   - returns counts by category (authority / secondary / rejected /
 *     unrecognised)
 *   - inserts one legal_ref_corrections row per rejected/unrecognised
 *     ref with proposer='authority-audit' so the existing review queue
 *     handles them. proposed_source_url is NULL — the founder must
 *     research the correct primary source.
 *
 * Citation fields on legal_references are NOT mutated. This is purely
 * a triage step that surfaces bad sources via the existing pending
 * corrections queue.
 *
 * GET on the same path returns the counts WITHOUT inserting anything,
 * so the founder can preview the sweep before running it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';
import { checkUkLegalAuthority } from '@/lib/legal-refs-authority';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

function getAdminEmails(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'aireypaul@googlemail.com')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

function getAdmin() {
  return createAdminClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  );
}

interface RefRow {
  id: string;
  law_name: string;
  source_url: string;
  verification_status: string | null;
}

async function authorise(): Promise<{ ok: boolean; userEmail?: string }> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const allow = getAdminEmails();
    if (!user?.email || !allow.includes(user.email.toLowerCase())) {
      return { ok: false };
    }
    return { ok: true, userEmail: user.email };
  } catch {
    return { ok: false };
  }
}

async function classify() {
  const admin = getAdmin();
  const { data: refs, error } = await admin
    .from('legal_references')
    .select('id, law_name, source_url, verification_status');
  if (error || !refs) {
    return { error: error?.message || 'failed to read legal_references' };
  }

  const buckets = {
    authority: [] as RefRow[],
    secondary: [] as RefRow[],
    rejected: [] as RefRow[],
    unrecognised: [] as RefRow[],
  };

  for (const r of refs as RefRow[]) {
    if (!r.source_url) {
      buckets.unrecognised.push(r);
      continue;
    }
    const check = checkUkLegalAuthority(r.source_url);
    buckets[check.reason].push(r);
  }

  return {
    counts: {
      authority: buckets.authority.length,
      secondary: buckets.secondary.length,
      rejected: buckets.rejected.length,
      unrecognised: buckets.unrecognised.length,
      total: refs.length,
    },
    buckets,
  };
}

export async function GET() {
  const auth = await authorise();
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const result = await classify();
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({
    ok: true,
    counts: result.counts,
    sample_rejected: result.buckets.rejected.slice(0, 10).map((r) => ({
      id: r.id,
      law_name: r.law_name,
      source_url: r.source_url,
    })),
    sample_unrecognised: result.buckets.unrecognised.slice(0, 10).map((r) => ({
      id: r.id,
      law_name: r.law_name,
      source_url: r.source_url,
    })),
  });
}

export async function POST() {
  const auth = await authorise();
  if (!auth.ok) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await classify();
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const admin = getAdmin();
  const flagged = [...result.buckets.rejected, ...result.buckets.unrecognised];

  let inserted = 0;
  let skippedExisting = 0;
  const errors: string[] = [];

  for (const r of flagged) {
    // Avoid double-queueing: skip if there's already a pending
    // authority-audit correction for this ref.
    const { data: existing } = await admin
      .from('legal_ref_corrections')
      .select('id')
      .eq('ref_id', r.id)
      .eq('proposer', 'authority-audit')
      .eq('status', 'pending')
      .limit(1);
    if (existing && existing.length > 0) {
      skippedExisting++;
      continue;
    }

    const hostnameCheck = r.source_url ? checkUkLegalAuthority(r.source_url) : null;
    const hostname = hostnameCheck?.hostname ?? 'unknown';
    const note =
      `Source domain ${hostname} is not on the UK legal authority allowlist. ` +
      `Replace with primary source before relying on this citation.`;

    const { error: insErr } = await admin.from('legal_ref_corrections').insert({
      ref_id: r.id,
      proposer: 'authority-audit',
      before_law_name: r.law_name,
      before_source_url: r.source_url,
      before_status: r.verification_status,
      proposed_law_name: r.law_name,
      proposed_source_url: null,
      proposed_status: null,
      reasoning: note,
      raw_response: { authority_check: hostnameCheck } as object,
      confidence: 'high',
      cost_gbp: 0,
      status: 'pending',
    });
    if (insErr) {
      errors.push(`${r.id}: ${insErr.message}`);
    } else {
      inserted++;
    }
  }

  return NextResponse.json({
    ok: true,
    counts: result.counts,
    flagged: flagged.length,
    inserted,
    skipped_existing: skippedExisting,
    errors,
  });
}
