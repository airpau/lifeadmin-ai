/**
 * GET /api/cron/intelligence-rollup-daily
 *
 * Daily 02:15 UTC. Rolls intelligence_events into intelligence_stats so the
 * intelligence layer SDK (`consultLedger`) has a precomputed precision/recall
 * baseline per scope without scanning the raw ledger on every consult.
 *
 * Phase 0 scopes:
 *   - subject_kind = 'alert_template'     (per WhatsApp template name)
 *
 * Windows rolled:
 *   - day      (yesterday in UTC)
 *   - week     (this Monday → today)
 *   - all_time (every event ever)
 *
 * The rollup is idempotent — re-runs overwrite the existing row for that
 * (scope_kind, scope_value, window_kind, window_start). Stats older than
 * 90 days for window_kind = 'day' are pruned at the end of each run.
 *
 * Auth: Bearer ${CRON_SECRET}.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface AggRow {
  scope_kind: string;
  scope_value: string;
  window_kind: 'day' | 'week' | 'month' | 'all_time';
  window_start: string;
  emitted: number;
  acted_on: number;
  dismissed: number;
  ignored: number;
  won: number;
  lost: number;
  auto_suppressed: number;
  recovered_gbp: number;
}

function emptyAgg(
  scope_kind: string,
  scope_value: string,
  window_kind: AggRow['window_kind'],
  window_start: string,
): AggRow {
  return {
    scope_kind,
    scope_value,
    window_kind,
    window_start,
    emitted: 0,
    acted_on: 0,
    dismissed: 0,
    ignored: 0,
    won: 0,
    lost: 0,
    auto_suppressed: 0,
    recovered_gbp: 0,
  };
}

interface EventRow {
  subject_kind: string | null;
  subject_id: string | null;
  outcome_kind: string | null;
  outcome: { recovered_gbp?: number } | null;
}

function fold(agg: AggRow, ev: EventRow): void {
  agg.emitted += 1;
  switch (ev.outcome_kind) {
    case 'action_taken':
    case 'won':
    case 'switched':
    case 'cancelled':
    case 'escalated':
      agg.acted_on += 1;
      if (ev.outcome_kind === 'won') agg.won += 1;
      break;
    case 'dismissed':
      agg.dismissed += 1;
      break;
    case 'ignored':
    case 'no_response':
      agg.ignored += 1;
      break;
    case 'lost':
      agg.lost += 1;
      break;
    case 'auto_suppressed':
      agg.auto_suppressed += 1;
      break;
    default:
      // null outcome → still unmeasured; counts as emitted but not actioned
      break;
  }
  if (ev.outcome && typeof ev.outcome.recovered_gbp === 'number') {
    agg.recovered_gbp += ev.outcome.recovered_gbp;
  }
}

async function rollupWindow(
  sb: ReturnType<typeof getAdmin>,
  windowKind: AggRow['window_kind'],
  windowStart: string,
  since: string,
  until: string,
  summary: Record<string, number>,
): Promise<void> {
  // Stream events page-by-page. Volume should be low in Phase 0 (≤ 5k/day)
  // but the code is paged so it stays correct as the loop expands.
  const PAGE = 1000;
  let offset = 0;
  const byScope = new Map<string, AggRow>();

  while (true) {
    const { data: events, error } = await sb
      .from('intelligence_events')
      .select('subject_kind, subject_id, outcome_kind, outcome')
      .gte('emitted_at', since)
      .lt('emitted_at', until)
      .not('subject_kind', 'is', null)
      .not('subject_id', 'is', null)
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.error('[intelligence-rollup] events query failed:', error.message);
      return;
    }
    if (!events || events.length === 0) break;
    for (const ev of events as EventRow[]) {
      if (!ev.subject_kind || !ev.subject_id) continue;
      const key = `${ev.subject_kind}::${ev.subject_id}`;
      let agg = byScope.get(key);
      if (!agg) {
        agg = emptyAgg(ev.subject_kind, ev.subject_id, windowKind, windowStart);
        byScope.set(key, agg);
      }
      fold(agg, ev);
    }
    if (events.length < PAGE) break;
    offset += PAGE;
  }

  // Compute precision and upsert.
  const rows = Array.from(byScope.values()).map((r) => ({
    ...r,
    precision_pct: r.emitted === 0 ? null : Math.round((r.acted_on / r.emitted) * 10_000) / 100,
    computed_at: new Date().toISOString(),
  }));
  if (rows.length === 0) {
    summary[`${windowKind}_scopes`] = 0;
    return;
  }
  // Chunk upserts to keep the request body sane.
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200);
    const { error } = await sb
      .from('intelligence_stats')
      .upsert(chunk, {
        onConflict: 'scope_kind,scope_value,window_kind,window_start',
      });
    if (error) {
      console.error(`[intelligence-rollup] ${windowKind} upsert failed:`, error.message);
      return;
    }
  }
  summary[`${windowKind}_scopes`] = rows.length;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization') ?? '';
  if (auth !== `Bearer ${process.env.CRON_SECRET ?? ''}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getAdmin();
  const now = new Date();
  const summary: Record<string, number> = {};

  // ── Day window (yesterday UTC)
  const yesterday = new Date(now);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  yesterday.setUTCHours(0, 0, 0, 0);
  const yesterdayEnd = new Date(yesterday);
  yesterdayEnd.setUTCDate(yesterdayEnd.getUTCDate() + 1);
  await rollupWindow(
    sb,
    'day',
    yesterday.toISOString().slice(0, 10),
    yesterday.toISOString(),
    yesterdayEnd.toISOString(),
    summary,
  );

  // ── Week window (Monday → today)
  const weekStart = new Date(now);
  weekStart.setUTCHours(0, 0, 0, 0);
  const dow = weekStart.getUTCDay();
  // ISO week: Monday is start of week. dow: Sun=0, Mon=1, … Sat=6.
  const daysToMonday = ((dow + 6) % 7);
  weekStart.setUTCDate(weekStart.getUTCDate() - daysToMonday);
  await rollupWindow(
    sb,
    'week',
    weekStart.toISOString().slice(0, 10),
    weekStart.toISOString(),
    now.toISOString(),
    summary,
  );

  // ── All-time window (sentinel window_start = '1970-01-01')
  await rollupWindow(
    sb,
    'all_time',
    '1970-01-01',
    '1970-01-01T00:00:00Z',
    now.toISOString(),
    summary,
  );

  // ── Prune day stats older than 90 days
  const pruneCutoff = new Date(now);
  pruneCutoff.setUTCDate(pruneCutoff.getUTCDate() - 90);
  const { count: pruned } = await sb
    .from('intelligence_stats')
    .delete({ count: 'exact' })
    .eq('window_kind', 'day')
    .lt('window_start', pruneCutoff.toISOString().slice(0, 10));
  summary.pruned_daily_rows = pruned ?? 0;

  return NextResponse.json({ ok: true, summary });
}
