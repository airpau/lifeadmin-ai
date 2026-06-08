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
 * Phase 1 scopes (additive — same code path):
 *   - subject_kind = 'legal_ref'           (per legal_references UUID)
 *
 * Phase 2 scopes (additive — outcome_kind extensions only):
 *   - subject_kind = 'prompt_template'    (chat reply thumb rate)
 *   - subject_kind = 'tool'                (tool-call success rate)
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
    // Phase 2 — chat reply thumbs feedback. precision_pct on
    // prompt_template scope = thumb-up rate.
    case 'positive':
      agg.acted_on += 1;
      break;
    case 'negative':
      agg.dismissed += 1;
      break;
    // Phase 2 — tool-call telemetry. precision_pct on tool scope =
    // tool success rate. The auto-downrank cron reads (100 - precision)
    // to find consistently failing tools.
    case 'tool_success':
      agg.acted_on += 1;
      break;
    case 'tool_failed':
      agg.dismissed += 1;
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

  // ─────────────────────────────────────────────────────────────────
  // Phase 2 sprint 2 — auto-downrank failing tools.
  //
  // Spec (CLOSED_LOOP_ARCHITECTURE.md → Phase 2):
  //   "if a tool call fails > 30% of the time AND has > 20 invocations,
  //    automatically downrank it in the tool registry (with founder
  //    notification)"
  //
  // Conservative implementation:
  //   - Query all-time stats at scope_kind='tool'.
  //   - Filter: emitted > 20 AND fail rate > 30% (precision_pct < 70%).
  //   - Write one `tool_downrank_flagged` intelligence_events row per
  //     candidate (idempotent — only writes if no flag exists for the
  //     same tool in the last 7 days, so the founder isn't paged daily).
  //   - Founder reviews via the admin dashboard; actual runtime
  //     downranking is deferred to sprint 3 once we have ≥20 tools with
  //     enough signal to be sure the threshold isn't catching noise.
  //
  // The flag IS the auto-downrank — runtime suppression at the tool-
  // selection layer would risk the agent silently regressing if a
  // legitimately useful tool tripped the floor on a low-sample week.
  // Founder-in-loop is the right policy until we trust the signal.
  // ─────────────────────────────────────────────────────────────────
  try {
    const { data: toolStats } = await sb
      .from('intelligence_stats')
      .select('scope_value, emitted, acted_on, dismissed, precision_pct')
      .eq('scope_kind', 'tool')
      .eq('window_kind', 'all_time')
      .gt('emitted', 20);

    const failingTools = (toolStats ?? []).filter((r) => {
      const prec = r.precision_pct == null ? null : Number(r.precision_pct);
      return prec != null && prec < 70; // fail rate > 30%
    });

    let flagged = 0;
    let skippedRecent = 0;
    const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

    for (const t of failingTools) {
      // Dedup: skip if flagged in the last 7 days.
      const { data: recent } = await sb
        .from('intelligence_events')
        .select('id')
        .eq('action_kind', 'tool_downrank_flagged')
        .eq('subject_kind', 'tool')
        .eq('subject_id', t.scope_value)
        .gte('emitted_at', since)
        .limit(1);
      if (recent && recent.length > 0) {
        skippedRecent++;
        continue;
      }
      await sb.from('intelligence_events').insert({
        user_id: null,
        actor: 'system',
        action_kind: 'tool_downrank_flagged',
        subject_kind: 'tool',
        subject_id: t.scope_value,
        predicted: {
          emitted: t.emitted,
          acted_on: t.acted_on,
          dismissed: t.dismissed,
          precision_pct: t.precision_pct,
          fail_rate_pct:
            t.precision_pct == null ? null : 100 - Number(t.precision_pct),
          rule: 'emitted>20 AND fail_rate>30%',
        },
        metadata: {
          source: 'cron/intelligence-rollup-daily',
          founder_review_required: true,
        },
      });
      flagged++;
    }
    summary.tools_failing_flagged = flagged;
    summary.tools_failing_skipped_recent = skippedRecent;
    summary.tools_failing_candidates = failingTools.length;
  } catch (err) {
    console.warn('[intelligence-rollup] auto-downrank step failed:', err);
    summary.tools_failing_flagged = -1;
  }

  // ─────────────────────────────────────────────────────────────────
  // Phase 2 sprint 2 — weekly founder digest of low-rated chat
  // prompt templates. Runs only on Mondays so the founder gets one
  // weekly mail, not seven. Surfaces the bottom-5 prompt_template
  // scopes with thumb rate < 50% AND emitted ≥ 10 — these are the
  // patterns Sonnet is producing that users actively dislike.
  // ─────────────────────────────────────────────────────────────────
  try {
    if (now.getUTCDay() === 1) {
      // Monday
      const { data: badPrompts } = await sb
        .from('intelligence_stats')
        .select('scope_value, emitted, acted_on, dismissed, precision_pct')
        .eq('scope_kind', 'prompt_template')
        .eq('window_kind', 'all_time')
        .gte('emitted', 10)
        .lt('precision_pct', 50)
        .order('precision_pct', { ascending: true })
        .limit(5);

      const failingTools = await sb
        .from('intelligence_stats')
        .select('scope_value, emitted, precision_pct')
        .eq('scope_kind', 'tool')
        .eq('window_kind', 'all_time')
        .gt('emitted', 20)
        .lt('precision_pct', 70)
        .order('precision_pct', { ascending: true })
        .limit(10);

      const FOUNDER_EMAIL =
        process.env.FOUNDER_EMAIL ?? 'aireypaul@googlemail.com';
      if (
        process.env.RESEND_API_KEY &&
        ((badPrompts?.length ?? 0) > 0 ||
          (failingTools.data?.length ?? 0) > 0)
      ) {
        const rows = [
          (badPrompts?.length ?? 0) > 0
            ? `<h3>Low-rated chat prompts (this week)</h3><ul>${badPrompts!
                .map(
                  (r) =>
                    `<li><code>${r.scope_value}</code> — ${r.precision_pct}% positive (${r.emitted} replies)</li>`,
                )
                .join('')}</ul>`
            : '',
          (failingTools.data?.length ?? 0) > 0
            ? `<h3>Failing tools (auto-downrank flagged)</h3><ul>${failingTools.data!
                .map(
                  (r) =>
                    `<li><code>${r.scope_value}</code> — ${r.precision_pct}% success (${r.emitted} calls)</li>`,
                )
                .join('')}</ul>`
            : '',
          `<p>Review at <a href="https://paybacker.co.uk/dashboard/admin/intelligence">/dashboard/admin/intelligence</a>.</p>`,
        ]
          .filter(Boolean)
          .join('');

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Paybacker Intelligence <noreply@paybacker.co.uk>',
            to: FOUNDER_EMAIL,
            subject: 'Weekly intelligence digest — Pocket Agent quality',
            html: rows,
          }),
        });
        summary.weekly_digest_sent = 1;
      } else {
        summary.weekly_digest_sent = 0;
      }
    }
  } catch (err) {
    console.warn('[intelligence-rollup] weekly digest step failed:', err);
    summary.weekly_digest_sent = -1;
  }

  return NextResponse.json({ ok: true, summary });
}

