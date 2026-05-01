/**
 * Nightly cron — compute aggregate dispute outcome stats.
 *
 * Scopes computed:
 *   - overall
 *   - merchant (by merchant_normalised)
 *   - industry (by merchant_industry)
 *   - dispute_type
 *   - legal_ref (joined via legal_ref_usages.artefact_id = disputes.id)
 *   - merchant_x_legal_ref (the engine-feedback heatmap)
 *
 * Snapshots are appended (not upserted) so we keep history for the
 * trend chart on the admin dashboard.
 *
 * Auth: founder cookie OR Bearer CRON_SECRET (Vercel cron).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';

interface DisputeRow {
  id: string;
  outcome: string | null;
  recovered_amount_gbp: number | null;
  resolution_time_days: number | null;
  merchant_normalised: string | null;
  merchant_industry: string | null;
  dispute_type: string | null;
}

interface Bucket {
  total: number;
  won: number;
  partial: number;
  lost: number;
  pending: number;
  recoveredSum: number;
  recoveredCount: number;
  daysSum: number;
  daysCount: number;
}

const newBucket = (): Bucket => ({
  total: 0, won: 0, partial: 0, lost: 0, pending: 0,
  recoveredSum: 0, recoveredCount: 0, daysSum: 0, daysCount: 0,
});

function add(bucket: Bucket, d: DisputeRow): void {
  bucket.total += 1;
  if (d.outcome === 'won') bucket.won += 1;
  else if (d.outcome === 'partial') bucket.partial += 1;
  else if (d.outcome === 'lost') bucket.lost += 1;
  else bucket.pending += 1;
  if (typeof d.recovered_amount_gbp === 'number') {
    bucket.recoveredSum += d.recovered_amount_gbp;
    bucket.recoveredCount += 1;
  }
  if (typeof d.resolution_time_days === 'number') {
    bucket.daysSum += d.resolution_time_days;
    bucket.daysCount += 1;
  }
}

function bucketToRow(scopeKind: string, scopeKey: string, b: Bucket) {
  const decided = b.won + b.partial + b.lost;
  const winRate = decided > 0 ? (b.won + 0.5 * b.partial) / decided : null;
  return {
    scope_kind: scopeKind,
    scope_key: scopeKey,
    total_count: b.total,
    won_count: b.won,
    partial_count: b.partial,
    lost_count: b.lost,
    pending_count: b.pending,
    avg_resolution_days: b.daysCount > 0 ? Number((b.daysSum / b.daysCount).toFixed(2)) : null,
    avg_recovered_gbp: b.recoveredCount > 0 ? Number((b.recoveredSum / b.recoveredCount).toFixed(2)) : null,
    total_recovered_gbp: Number(b.recoveredSum.toFixed(2)),
    win_rate: winRate != null ? Number(winRate.toFixed(3)) : null,
  };
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? 'unauthorized' }, { status: auth.status });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );

  // Fetch all disputes with the new tagging columns. Cap at 50k for safety.
  const { data: disputes, error } = await sb
    .from('disputes')
    .select('id, outcome, recovered_amount_gbp, resolution_time_days, merchant_normalised, merchant_industry, dispute_type')
    .limit(50000);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (disputes ?? []) as DisputeRow[];

  // Pull legal-ref usages for the legal_ref + merchant_x_legal_ref scopes.
  // artefact_kind='dispute_letter' rows link a legal_references id to a dispute id (via artefact_id).
  const { data: usages } = await sb
    .from('legal_ref_usages')
    .select('ref_id, artefact_id, artefact_kind')
    .eq('artefact_kind', 'dispute_letter')
    .limit(100000);

  const refLabelById = new Map<string, string>();
  if (usages && usages.length > 0) {
    const refIds = Array.from(new Set(usages.map((u) => u.ref_id).filter(Boolean)));
    if (refIds.length > 0) {
      const { data: refs } = await sb
        .from('legal_references')
        .select('id, law_name, section')
        .in('id', refIds);
      for (const r of refs ?? []) {
        const label = `${r.law_name ?? ''}${r.section ? ' ' + r.section : ''}`.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 100);
        if (label) refLabelById.set(r.id as string, label);
      }
    }
  }

  // Build buckets
  const overall = newBucket();
  const byMerchant = new Map<string, Bucket>();
  const byIndustry = new Map<string, Bucket>();
  const byType = new Map<string, Bucket>();
  const byRef = new Map<string, Bucket>();
  const byMerchantRef = new Map<string, Bucket>();

  // Index disputes by id for quick lookup when iterating usages
  const disputeById = new Map<string, DisputeRow>();
  for (const d of rows) {
    disputeById.set(d.id, d);
    add(overall, d);
    if (d.merchant_normalised) {
      const b = byMerchant.get(d.merchant_normalised) ?? newBucket();
      add(b, d); byMerchant.set(d.merchant_normalised, b);
    }
    if (d.merchant_industry) {
      const b = byIndustry.get(d.merchant_industry) ?? newBucket();
      add(b, d); byIndustry.set(d.merchant_industry, b);
    }
    if (d.dispute_type) {
      const b = byType.get(d.dispute_type) ?? newBucket();
      add(b, d); byType.set(d.dispute_type, b);
    }
  }

  // legal_ref + merchant_x_legal_ref: one usage row = one (dispute, ref) edge
  for (const u of usages ?? []) {
    const d = disputeById.get(u.artefact_id as string);
    if (!d) continue;
    const refLabel = refLabelById.get(u.ref_id as string);
    if (!refLabel) continue;
    const b = byRef.get(refLabel) ?? newBucket();
    add(b, d); byRef.set(refLabel, b);
    if (d.merchant_normalised) {
      const key = `${d.merchant_normalised}::${refLabel}`;
      const mb = byMerchantRef.get(key) ?? newBucket();
      add(mb, d); byMerchantRef.set(key, mb);
    }
  }

  // Stage rows for insert. Cap at 1000 per the spec.
  const out: Array<ReturnType<typeof bucketToRow>> = [];
  out.push(bucketToRow('overall', 'overall', overall));
  for (const [k, b] of byMerchant) out.push(bucketToRow('merchant', k, b));
  for (const [k, b] of byIndustry) out.push(bucketToRow('industry', k, b));
  for (const [k, b] of byType) out.push(bucketToRow('dispute_type', k, b));
  for (const [k, b] of byRef) out.push(bucketToRow('legal_ref', k, b));
  for (const [k, b] of byMerchantRef) out.push(bucketToRow('merchant_x_legal_ref', k, b));

  const capped = out.slice(0, 1000);
  if (capped.length > 0) {
    const { error: insErr } = await sb.from('dispute_intelligence_stats').insert(capped);
    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  return NextResponse.json({
    ok: true,
    inserted: capped.length,
    truncated: out.length > 1000,
    disputes_evaluated: rows.length,
    usages_evaluated: usages?.length ?? 0,
  });
}
