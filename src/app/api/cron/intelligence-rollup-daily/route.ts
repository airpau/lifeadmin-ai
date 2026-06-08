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
  metadata: { variant?: string; experiment?: string } | null;
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
      .select('subject_kind, subject_id, outcome_kind, outcome, metadata')
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
      // Base rollup — always emitted at scope (subject_kind, subject_id).
      const key = `${ev.subject_kind}::${ev.subject_id}`;
      let agg = byScope.get(key);
      if (!agg) {
        agg = emptyAgg(ev.subject_kind, ev.subject_id, windowKind, windowStart);
        byScope.set(key, agg);
      }
      fold(agg, ev);

      // P5-6 — per-variant rollup. When metadata.variant is set, also
      // accumulate at scope (`${subject_kind}__variant`,
      // `${subject_id}::${variant}`). The dashboard reads this slice
      // independently — no impact on existing scopes.
      const variant = ev.metadata?.variant;
      if (variant) {
        const vKind = `${ev.subject_kind}__variant`;
        const vValue = `${ev.subject_id}::${variant}`;
        const vKey = `${vKind}::${vValue}`;
        let vAgg = byScope.get(vKey);
        if (!vAgg) {
          vAgg = emptyAgg(vKind, vValue, windowKind, windowStart);
          byScope.set(vKey, vAgg);
        }
        fold(vAgg, ev);
      }
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

      // P5-2 — also write a runtime override so the agent loops skip
      // this tool immediately. 14-day expiry; the next rollup re-flags
      // if the issue persists. Founder can clear early from the admin
      // dashboard (sets reactivated_at). Dedup: any existing active
      // row for this tool is left in place.
      const expiresAt = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data: existingOverride } = await sb
        .from('tool_registry_overrides')
        .select('id')
        .eq('tool_name', t.scope_value)
        .is('reactivated_at', null)
        .gt('expires_at', now.toISOString())
        .limit(1);
      if (!existingOverride || existingOverride.length === 0) {
        await sb.from('tool_registry_overrides').insert({
          tool_name: t.scope_value,
          expires_at: expiresAt,
          reason: 'auto_downrank_high_fail_rate',
          metadata: {
            emitted: t.emitted,
            precision_pct: t.precision_pct,
            fail_rate_pct:
              t.precision_pct == null ? null : 100 - Number(t.precision_pct),
            rule: 'emitted>20 AND fail_rate>30%',
            source: 'cron/intelligence-rollup-daily',
          },
        });
      }
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
  // Phase 3 — auto-tune detection thresholds.
  //
  // Spec (CLOSED_LOOP_ARCHITECTURE.md → Phase 3):
  //   "If 5 out of last 6 alerts of a kind for a merchant were
  //    dismissed, raise the threshold automatically + log the change."
  //
  // We scan the recent alert_template events grouped by (template,
  // merchant_normalised in metadata). Two templates feed this loop:
  //   - paybacker_alert_unusual_charge  → kind='unusual_charge', default 20
  //   - paybacker_alert_price_increase  → kind='price_increase',  default 5
  //
  // When ≥5 of the last 6 outcomes for a given (kind, merchant) were
  // dismissed/negative/no_response, multiply the threshold by 1.25 and
  // write one threshold_raised event. Existing override (if any) is the
  // new baseline. Idempotent: skip if a raise already exists in the
  // last 14 days for this (kind, merchant) — gives the user time to
  // engage with the new floor before we touch it again.
  // ─────────────────────────────────────────────────────────────────
  try {
    const TUNE_KINDS: Array<{
      kind: 'unusual_charge' | 'price_increase';
      template: string;
      defaultValue: number;
    }> = [
      { kind: 'unusual_charge', template: 'paybacker_alert_unusual_charge', defaultValue: 20 },
      { kind: 'price_increase', template: 'paybacker_alert_price_increase', defaultValue: 5 },
    ];

    let raised = 0;
    let skippedRecent = 0;
    let candidatesChecked = 0;

    for (const cfg of TUNE_KINDS) {
      // Pull recent events for this template that have a merchant in metadata.
      // Look back 90 days; we need at least 6 measured events per merchant.
      const lookback = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const { data: events } = await sb
        .from('intelligence_events')
        .select('id, subject_id, outcome_kind, metadata, emitted_at')
        .eq('subject_kind', 'alert_template')
        .eq('subject_id', cfg.template)
        .not('outcome_kind', 'is', null)
        .gte('emitted_at', lookback)
        .order('emitted_at', { ascending: false })
        .limit(2000);

      // Group last-6-per-merchant.
      const byMerchant = new Map<string, Array<{ outcome: string; ts: string }>>();
      for (const ev of (events ?? []) as Array<{
        outcome_kind: string;
        metadata: Record<string, unknown> | null;
        emitted_at: string;
      }>) {
        const merchant =
          (ev.metadata && (ev.metadata.merchant_normalised as string)) ??
          (ev.metadata && (ev.metadata.merchant as string)) ??
          null;
        if (!merchant) continue;
        const list = byMerchant.get(merchant) ?? [];
        if (list.length < 6) {
          list.push({ outcome: ev.outcome_kind, ts: ev.emitted_at });
          byMerchant.set(merchant, list);
        }
      }

      const since14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { getEffectiveThreshold, recordThresholdRaise } = await import(
        '@/lib/intelligence/detection-thresholds'
      );

      for (const [merchant, outcomes] of byMerchant.entries()) {
        candidatesChecked++;
        if (outcomes.length < 6) continue;
        const dismissals = outcomes.filter(
          (o) => o.outcome === 'dismissed' || o.outcome === 'negative' || o.outcome === 'no_response',
        ).length;
        if (dismissals < 5) continue;

        // 14-day dedup on raises.
        const { data: recent } = await sb
          .from('intelligence_events')
          .select('id')
          .eq('action_kind', 'threshold_raised')
          .eq('subject_kind', 'detection_threshold')
          .eq('subject_id', `${cfg.kind}:${merchant}`)
          .gte('emitted_at', since14)
          .limit(1);
        if (recent && recent.length > 0) {
          skippedRecent++;
          continue;
        }

        const currentValue = await getEffectiveThreshold(
          cfg.kind,
          merchant,
          cfg.defaultValue,
        );
        const newValue = Math.round(currentValue * 1.25 * 100) / 100;
        await recordThresholdRaise({
          kind: cfg.kind,
          merchantNormalised: merchant,
          oldValue: currentValue,
          newValue,
          reason: `5_of_last_6_dismissed`,
          metadata: {
            sample: outcomes.length,
            dismissals,
            window_days: 90,
          },
        });
        raised++;
      }
    }
    summary.thresholds_raised = raised;
    summary.thresholds_candidates = candidatesChecked;
    summary.thresholds_skipped_recent = skippedRecent;
  } catch (err) {
    console.warn('[intelligence-rollup] threshold auto-tune failed:', err);
    summary.thresholds_raised = -1;
  }

  // ─────────────────────────────────────────────────────────────────
  // P5-1 — two-way auto-tune (lower step).
  //
  // Symmetric with the raise step. If a (kind, merchant) had a raise
  // in the past AND no scan_finding_emitted / alert fires for that
  // merchant in the last 14 days AT the current threshold OR ABOVE,
  // the bumped-up threshold is now stale — lower it.
  //
  // Conservative rules:
  //   - Only act on (kind, merchant) pairs with at least one prior
  //     threshold_raised event.
  //   - "No fires" means: zero alert_template events scoped to that
  //     template+merchant in the last 14 days regardless of outcome.
  //   - Multiply current threshold by 0.8 (undo two raises at most via
  //     repeated runs over weeks).
  //   - Floor: never below the default (5 for price_increase, 20 for
  //     unusual_charge). Below-default would weaken the engine vs day-1.
  //   - 14-day dedup mirror of the raise step (don't ping-pong).
  // ─────────────────────────────────────────────────────────────────
  try {
    const LOWER_KINDS: Array<{
      kind: 'unusual_charge' | 'price_increase';
      template: string;
      defaultValue: number;
    }> = [
      { kind: 'unusual_charge', template: 'paybacker_alert_unusual_charge', defaultValue: 20 },
      { kind: 'price_increase', template: 'paybacker_alert_price_increase', defaultValue: 5 },
    ];

    let lowered = 0;
    let lowerSkippedRecent = 0;
    let lowerCandidates = 0;

    const since14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { getEffectiveThreshold, recordThresholdRaise } = await import(
      '@/lib/intelligence/detection-thresholds'
    );

    for (const cfg of LOWER_KINDS) {
      // All (kind, merchant) pairs that have ANY raise event ever.
      // Limit 500 — we don't expect more than a few dozen in production.
      const { data: raisedRefs } = await sb
        .from('intelligence_events')
        .select('subject_id')
        .eq('action_kind', 'threshold_raised')
        .eq('subject_kind', 'detection_threshold')
        .like('subject_id', `${cfg.kind}:%`)
        .limit(500);
      const seen = new Set<string>();
      const merchants: string[] = [];
      for (const r of (raisedRefs ?? []) as Array<{ subject_id: string }>) {
        const m = r.subject_id?.startsWith(`${cfg.kind}:`)
          ? r.subject_id.slice(cfg.kind.length + 1)
          : null;
        if (!m || seen.has(m)) continue;
        seen.add(m);
        merchants.push(m);
      }

      for (const merchant of merchants) {
        lowerCandidates++;

        // 14-day dedup on the LAST tune action for this pair (raise OR
        // lower). Don't ping-pong.
        const { data: recentTune } = await sb
          .from('intelligence_events')
          .select('id')
          .in('action_kind', ['threshold_raised', 'threshold_reset'])
          .eq('subject_kind', 'detection_threshold')
          .eq('subject_id', `${cfg.kind}:${merchant}`)
          .gte('emitted_at', since14)
          .limit(1);
        if (recentTune && recentTune.length > 0) {
          lowerSkippedRecent++;
          continue;
        }

        // Look for ANY alert fires for this template scoped to the
        // merchant in the last 14 days (via metadata.merchant_normalised).
        const { data: recentFires } = await sb
          .from('intelligence_events')
          .select('id')
          .eq('subject_kind', 'alert_template')
          .eq('subject_id', cfg.template)
          .gte('emitted_at', since14)
          .filter('metadata->>merchant_normalised', 'eq', merchant)
          .limit(1);
        if (recentFires && recentFires.length > 0) continue;

        // No fires in 14 days → safe to lower.
        const currentValue = await getEffectiveThreshold(
          cfg.kind,
          merchant,
          cfg.defaultValue,
        );
        if (currentValue <= cfg.defaultValue) continue; // already at floor
        const newValue = Math.max(
          cfg.defaultValue,
          Math.round(currentValue * 0.8 * 100) / 100,
        );
        if (newValue >= currentValue) continue;

        await recordThresholdRaise({
          kind: cfg.kind,
          merchantNormalised: merchant,
          oldValue: currentValue,
          newValue,
          reason: 'auto_lower_no_fires_14d',
          metadata: {
            window_days: 14,
            direction: 'lower',
            floored_at_default: newValue === cfg.defaultValue,
          },
        });
        lowered++;
      }
    }
    summary.thresholds_lowered = lowered;
    summary.thresholds_lower_candidates = lowerCandidates;
    summary.thresholds_lower_skipped_recent = lowerSkippedRecent;
  } catch (err) {
    console.warn('[intelligence-rollup] threshold lower step failed:', err);
    summary.thresholds_lowered = -1;
  }

  // ─────────────────────────────────────────────────────────────────
  // P5-3 — exploration tier review.
  //
  // When consultLedger fires the exploration tier (5% of would-be
  // suppressed sends), the resulting event carries metadata.exploration=true.
  // Compare the engagement rate on those exploration sends vs the measured
  // baseline precision for the same scope. If exploration engagement is
  // materially HIGHER than the baseline, the suppression policy was wrong
  // and we surface that to the founder via the digest.
  //
  // Flag rule: ≥10 exploration sends in the last 30 days AND exploration
  // engagement rate ≥ baseline precision + 15 percentage points. Below
  // 10 samples the comparison is meaningless.
  // ─────────────────────────────────────────────────────────────────
  try {
    const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: explorationEvents } = await sb
      .from('intelligence_events')
      .select('subject_kind, subject_id, outcome_kind, metadata')
      .gte('emitted_at', since30)
      .filter('metadata->>exploration', 'eq', 'true')
      .limit(5000);

    // Group: per (subject_kind, subject_id), count emitted + acted_on.
    interface ExplAgg {
      kind: string;
      value: string;
      emitted: number;
      acted_on: number;
      baseline_precision: number | null;
    }
    const byScope = new Map<string, ExplAgg>();
    for (const ev of (explorationEvents ?? []) as Array<{
      subject_kind: string | null;
      subject_id: string | null;
      outcome_kind: string | null;
    }>) {
      if (!ev.subject_kind || !ev.subject_id) continue;
      const k = `${ev.subject_kind}::${ev.subject_id}`;
      const agg = byScope.get(k) ?? {
        kind: ev.subject_kind,
        value: ev.subject_id,
        emitted: 0,
        acted_on: 0,
        baseline_precision: null,
      };
      agg.emitted += 1;
      if (
        ev.outcome_kind === 'action_taken' ||
        ev.outcome_kind === 'won' ||
        ev.outcome_kind === 'switched' ||
        ev.outcome_kind === 'cancelled' ||
        ev.outcome_kind === 'escalated' ||
        ev.outcome_kind === 'positive' ||
        ev.outcome_kind === 'tool_success'
      ) {
        agg.acted_on += 1;
      }
      byScope.set(k, agg);
    }

    // Join baseline precision from intelligence_stats.
    let suppressedAndWrong = 0;
    let flagged = 0;
    const flagDetails: Array<{
      scope: string;
      explorationRate: number;
      baseline: number;
      sample: number;
    }> = [];
    for (const agg of byScope.values()) {
      if (agg.emitted < 10) continue;
      const { data: stats } = await sb
        .from('intelligence_stats')
        .select('precision_pct')
        .eq('scope_kind', agg.kind)
        .eq('scope_value', agg.value)
        .eq('window_kind', 'all_time')
        .maybeSingle();
      const baseline =
        stats?.precision_pct == null ? null : Number(stats.precision_pct);
      agg.baseline_precision = baseline;
      const explorationRate = Math.round((agg.acted_on / agg.emitted) * 10_000) / 100;
      if (baseline != null && explorationRate >= baseline + 15) {
        suppressedAndWrong++;
        // Dedup: only flag once per 14 days.
        const since14 = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const { data: existingFlag } = await sb
          .from('intelligence_events')
          .select('id')
          .eq('action_kind', 'suppression_false_negative_flagged')
          .eq('subject_kind', agg.kind)
          .eq('subject_id', agg.value)
          .gte('emitted_at', since14)
          .limit(1);
        if (!existingFlag || existingFlag.length === 0) {
          await sb.from('intelligence_events').insert({
            user_id: null,
            actor: 'system',
            action_kind: 'suppression_false_negative_flagged',
            subject_kind: agg.kind,
            subject_id: agg.value,
            predicted: {
              exploration_emitted: agg.emitted,
              exploration_acted_on: agg.acted_on,
              exploration_rate_pct: explorationRate,
              baseline_precision_pct: baseline,
              gap_pct: Math.round((explorationRate - baseline) * 100) / 100,
              rule: 'exploration>=10 AND exploration_rate>=baseline+15pp',
            },
            metadata: {
              source: 'cron/intelligence-rollup-daily',
              founder_review_required: true,
            },
          });
          flagged++;
          flagDetails.push({
            scope: `${agg.kind}:${agg.value}`,
            explorationRate,
            baseline,
            sample: agg.emitted,
          });
        }
      }
    }
    summary.exploration_scopes_compared = byScope.size;
    summary.exploration_false_negatives_total = suppressedAndWrong;
    summary.exploration_false_negatives_flagged = flagged;
  } catch (err) {
    console.warn('[intelligence-rollup] exploration review step failed:', err);
    summary.exploration_false_negatives_flagged = -1;
  }

  // ─────────────────────────────────────────────────────────────────
  // Phase 2 sprint 2 — weekly founder digest of low-rated chat
  // prompt templates. Runs only on Mondays so the founder gets one
  // weekly mail, not seven. Surfaces the bottom-5 prompt_template
  // scopes with thumb rate < 50% AND emitted ≥ 10 — these are the
  // patterns Sonnet is producing that users actively dislike.
  //
  // Phase 3 — also includes: threshold raises in last 7d AND churn
  // reason distribution from last 30d (churn_recorded events).
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

      // Phase 3 — threshold auto-tune raises in last 7d.
      const since7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data: thresholdRaises } = await sb
        .from('intelligence_events')
        .select('subject_id, predicted, emitted_at')
        .eq('action_kind', 'threshold_raised')
        .eq('subject_kind', 'detection_threshold')
        .gte('emitted_at', since7)
        .order('emitted_at', { ascending: false })
        .limit(20);

      // Phase 3 — churn reason distribution in last 30d.
      const since30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: churnEvents } = await sb
        .from('intelligence_events')
        .select('outcome')
        .eq('action_kind', 'churn_recorded')
        .gte('emitted_at', since30);
      const churnDist = new Map<string, number>();
      for (const c of (churnEvents ?? []) as Array<{ outcome: { reason?: string } | null }>) {
        const reason = c.outcome?.reason ?? 'unknown';
        churnDist.set(reason, (churnDist.get(reason) ?? 0) + 1);
      }
      const churnTotal = Array.from(churnDist.values()).reduce((s, n) => s + n, 0);

      const FOUNDER_EMAIL =
        process.env.FOUNDER_EMAIL ?? 'aireypaul@googlemail.com';
      if (
        process.env.RESEND_API_KEY &&
        ((badPrompts?.length ?? 0) > 0 ||
          (failingTools.data?.length ?? 0) > 0 ||
          (thresholdRaises?.length ?? 0) > 0 ||
          churnTotal > 0)
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
          (thresholdRaises?.length ?? 0) > 0
            ? `<h3>Detection thresholds auto-raised (last 7d)</h3><ul>${thresholdRaises!
                .map((r) => {
                  const p = (r.predicted ?? {}) as Record<string, unknown>;
                  return `<li><code>${r.subject_id}</code>: ${p.old_value} → ${p.new_value} (reason: ${p.reason})</li>`;
                })
                .join('')}</ul>`
            : '',
          churnTotal > 0
            ? `<h3>Churn reasons (last 30d, n=${churnTotal})</h3><ul>${Array.from(
                churnDist.entries(),
              )
                .sort((a, b) => b[1] - a[1])
                .map(
                  ([reason, count]) =>
                    `<li><b>${reason}</b> — ${count} (${Math.round((count / churnTotal) * 100)}%)</li>`,
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



