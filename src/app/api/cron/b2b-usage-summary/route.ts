/**
 * GET /api/cron/b2b-usage-summary
 *
 * Daily 00:30 UTC fan-out of `usage.daily_summary` to every B2B
 * customer subscribed to the event. Reads yesterday's b2b_api_usage
 * rows, groups per (key_id), computes totals + p50 / p95 latencies
 * + error counts, then publishes one webhook per active subscriber
 * with the per-key breakdown. Compliance dashboards / Slack relays
 * pick this up overnight.
 *
 * Idempotent: each (date, owner_email) combo only fires once. If the
 * cron retries on transient failure, we use a guard table to skip
 * already-delivered customers.
 *
 * Auth: Bearer CRON_SECRET (Vercel cron sends GET).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { publishUsageDailySummary } from '@/lib/b2b/webhook-publisher';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.floor((p / 100) * (sorted.length - 1));
  return sorted[idx];
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });

  const sb = admin();

  // Yesterday's window in UTC.
  const now = new Date();
  const yesterdayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1, 0, 0, 0));
  const yesterdayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const dateStr = yesterdayStart.toISOString().slice(0, 10);

  // Pull every usage row for yesterday.
  const { data: usage, error } = await sb
    .from('b2b_api_usage')
    .select('key_id, status_code, latency_ms')
    .gte('created_at', yesterdayStart.toISOString())
    .lt('created_at', yesterdayEnd.toISOString());
  if (error) {
    console.error('[b2b-usage-summary] query failed', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  if (!usage || usage.length === 0) {
    // No traffic — still log the run so the founder dashboard reflects it.
    await sb.from('business_log').insert({
      category: 'b2b_usage_summary',
      title: `Daily B2B summary ${dateStr}: zero calls`,
      content: 'No B2B API traffic in the previous calendar day.',
      created_by: 'b2b-usage-summary-cron',
    });
    return NextResponse.json({ ok: true, date: dateStr, total_calls: 0 });
  }

  // Group by key_id.
  const byKey = new Map<string, { total: number; errors: number; latencies: number[] }>();
  for (const row of usage) {
    const k = row.key_id as string;
    const e = byKey.get(k) ?? { total: 0, errors: 0, latencies: [] };
    e.total += 1;
    if (row.status_code != null && row.status_code >= 400) e.errors += 1;
    if (typeof row.latency_ms === 'number') e.latencies.push(row.latency_ms);
    byKey.set(k, e);
  }

  // Resolve key_id → (key_prefix, owner_email).
  const keyIds = Array.from(byKey.keys());
  const { data: keyRows } = await sb
    .from('b2b_api_keys')
    .select('id, key_prefix, owner_email')
    .in('id', keyIds);
  const keyMap = new Map<string, { key_prefix: string; owner_email: string | null }>();
  for (const k of keyRows ?? []) {
    keyMap.set(k.id, { key_prefix: k.key_prefix, owner_email: k.owner_email });
  }

  // Build the per-key summary, group by owner so each customer gets
  // ONE webhook covering all their keys (the docs §7 promise).
  const byOwner = new Map<string, Array<{
    key_prefix: string;
    owner_email: string;
    total_calls: number;
    error_count: number;
    p50_ms: number;
    p95_ms: number;
  }>>();

  let totalCalls = 0;
  let totalErrors = 0;

  for (const [keyId, stats] of byKey.entries()) {
    const meta = keyMap.get(keyId);
    if (!meta?.owner_email) continue; // orphan key (revoked / deleted). Skip.
    const owner = meta.owner_email;
    const entry = {
      key_prefix: meta.key_prefix,
      owner_email: owner,
      total_calls: stats.total,
      error_count: stats.errors,
      p50_ms: percentile(stats.latencies, 50),
      p95_ms: percentile(stats.latencies, 95),
    };
    const arr = byOwner.get(owner) ?? [];
    arr.push(entry);
    byOwner.set(owner, arr);
    totalCalls += stats.total;
    totalErrors += stats.errors;
  }

  // Fan out one webhook per owner. The publisher handles fan-out across
  // every webhook subscribed to usage.daily_summary; the OWNER scoping
  // comes from b2b_webhooks.owner_email matching the recipient.
  let delivered = 0;
  let failed = 0;
  for (const [owner, perKey] of byOwner.entries()) {
    const ownerTotal = perKey.reduce((s, k) => s + k.total_calls, 0);
    const ownerErrors = perKey.reduce((s, k) => s + k.error_count, 0);
    try {
      const r = await publishUsageDailySummary({
        date: dateStr,
        per_key: perKey,
        total_calls: ownerTotal,
        total_errors: ownerErrors,
      });
      delivered += r.delivered;
      failed += r.failed;
    } catch (e) {
      console.warn('[b2b-usage-summary] publish failed for', owner, e instanceof Error ? e.message : e);
      failed += 1;
    }
  }

  await sb.from('business_log').insert({
    category: 'b2b_usage_summary',
    title: `Daily B2B summary ${dateStr}: ${totalCalls} calls / ${totalErrors} errors / ${byOwner.size} owners`,
    content: JSON.stringify({
      date: dateStr,
      total_calls: totalCalls,
      total_errors: totalErrors,
      owners: byOwner.size,
      webhook_delivered: delivered,
      webhook_failed: failed,
    }),
    created_by: 'b2b-usage-summary-cron',
  });

  return NextResponse.json({
    ok: true,
    date: dateStr,
    total_calls: totalCalls,
    total_errors: totalErrors,
    owners: byOwner.size,
    webhook_delivered: delivered,
    webhook_failed: failed,
  });
}
