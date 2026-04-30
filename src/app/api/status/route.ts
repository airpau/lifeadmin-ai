/**
 * GET /api/status — public API health.
 *
 * Aggregates b2b_api_usage over the last 24h to produce p50/p95
 * latency, total calls, error rate, and uptime. Cached for 60s.
 *
 * Public, no auth — designed to be linkable from outreach DMs / a
 * trust page. Returns no per-customer data.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function pctile(arr: number[], p: number): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)));
  return sorted[idx];
}

export async function GET() {
  const supabase = getAdmin();
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data } = await supabase
    .from('b2b_api_usage')
    .select('status_code, latency_ms, created_at')
    .gte('created_at', since)
    .limit(50_000);

  const rows = (data ?? []) as Array<{ status_code: number; latency_ms: number | null; created_at: string }>;
  const total = rows.length;
  const errors = rows.filter((r) => r.status_code >= 500).length;
  const errorRate = total > 0 ? (errors / total) * 100 : 0;
  const latencies = rows.map((r) => r.latency_ms ?? 0).filter((n) => n > 0);
  const p50 = pctile(latencies, 0.5);
  const p95 = pctile(latencies, 0.95);

  // Status is error-rate driven. Latency is reported as a separate
  // metric — /v1/disputes is LLM-bound and 15–25s on p95 is the engine's
  // normal envelope, not a degradation signal. We only flag degraded /
  // outage when we're seeing actual server failures.
  const status: 'operational' | 'degraded' | 'outage' =
    errorRate >= 5 ? 'outage'
    : errorRate >= 1 ? 'degraded'
    : 'operational';

  // Uptime over the full last-24h window, not just hours that had
  // traffic. Iterate every hourly bucket from now-24h to now; an hour
  // is "up" if it had a 2xx response OR zero traffic, "down" only if
  // every observation was a 5xx server error.
  const hourBuckets = new Map<string, { ok: number; err: number }>();
  for (const r of rows) {
    const hour = r.created_at.slice(0, 13); // YYYY-MM-DDTHH
    const cur = hourBuckets.get(hour) ?? { ok: 0, err: 0 };
    if (r.status_code >= 500) cur.err++;
    else if (r.status_code < 400) cur.ok++;
    hourBuckets.set(hour, cur);
  }
  // Iterate the full 24 hourly buckets aligned to the start of `since`
  // (which is now-24h truncated to the hour). Without alignment we'd
  // miss the oldest partial-hour bucket — a 5xx burst in the first
  // 60 minutes could be invisible to uptime math.
  const totalHours = 24;
  const sinceHourStart = new Date(Date.now() - totalHours * 3600_000);
  sinceHourStart.setUTCMinutes(0, 0, 0);
  let upHours = 0;
  for (let i = 0; i <= totalHours; i++) {
    const t = new Date(sinceHourStart.getTime() + i * 3600_000).toISOString().slice(0, 13);
    const b = hourBuckets.get(t);
    if (!b) upHours++;
    else if (b.ok > 0 || b.err === 0) upHours++;
  }
  // We sample 25 buckets (start + 24 forward) but only count 24 hours of uptime.
  const uptimePct = Math.min(100, (upHours / (totalHours + 1)) * 100);

  return NextResponse.json({
    status,
    last_24h: {
      total_calls: total,
      error_rate_pct: Number(errorRate.toFixed(2)),
      p50_latency_ms: p50,
      p95_latency_ms: p95,
      uptime_pct: Number(uptimePct.toFixed(2)),
    },
    updated_at: new Date().toISOString(),
  }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } });
}
