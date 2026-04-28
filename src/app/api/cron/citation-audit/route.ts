/**
 * GET /api/cron/citation-audit
 *
 * Daily 04:00 UTC replay of the citation-guarantee against every
 * complaint_writer letter generated in the last 7 days. Catches:
 *
 *   - Regressions: a letter that used to pass now fails because a
 *     citation_guarantee rule was tightened, or a legal_references
 *     row was deleted, or the verification_status filter dropped a
 *     ref the rule expected.
 *
 *   - Drift: which scenarios trip the retry path most often (signals
 *     a weak prompt or a missing index entry).
 *
 *   - Forced-citation rate: how often does the engine need to FORCE
 *     citations in (i.e. retry STILL didn't pick them up). High
 *     forced-rate on a rule = the model bias against that statute is
 *     baked in; we should improve the prompt or split the rule.
 *
 * Output:
 *   - business_log row with the full audit (success/failure counts +
 *     per-rule breakdowns + sample failing scenarios)
 *   - Telegram founder ping if any letter from the last 7 days NOW
 *     fails the guarantee (regression alert)
 *
 * This is the BACKSTOP that catches anything the per-letter
 * post-validation missed. Users should never have to verify
 * citations themselves — this cron does the verification continuously.
 *
 * Auth: Bearer CRON_SECRET (Vercel cron sends GET).
 * Schedule: vercel.json — daily 04:00 UTC.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { checkCitations, type ScenarioContext } from '@/lib/agents/citation-guarantee';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface AuditResult {
  ok: boolean;
  generated_at: string;
  window_days: number;
  letters_audited: number;
  passed: number;
  failed: number;
  retried_in_realtime: number;
  forced_in_realtime: number;
  regressions: Array<{
    agent_run_id: string;
    user_id: string;
    company: string;
    triggered_rules: string[];
    missing_now: string[];
  }>;
  rule_breakdown: Array<{
    rule_id: string;
    triggered_count: number;
    pass_rate: number;
  }>;
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }
  const sb = admin();

  const sinceIso = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: runs, error } = await sb
    .from('agent_runs')
    .select('id, user_id, input_data, output_data, legal_references, created_at')
    .eq('agent_type', 'complaint_writer')
    .eq('status', 'completed')
    .gte('created_at', sinceIso)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) {
    console.error('[citation-audit] query failed', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!runs || runs.length === 0) {
    return NextResponse.json({ ok: true, letters_audited: 0 });
  }

  const ruleStats = new Map<string, { triggered: number; passed: number }>();
  const regressions: AuditResult['regressions'] = [];
  let passed = 0;
  let failed = 0;
  let retriedInRealtime = 0;
  let forcedInRealtime = 0;

  for (const run of runs) {
    const input = (run.input_data ?? {}) as Record<string, unknown>;
    const output = (run.output_data ?? {}) as Record<string, unknown>;
    const realtimeGuarantee = (output.citationGuarantee ?? null) as
      | {
          retried?: boolean;
          forced_after_retry?: string[];
        }
      | null;

    if (realtimeGuarantee?.retried) retriedInRealtime++;
    if (realtimeGuarantee?.forced_after_retry?.length) forcedInRealtime++;

    const scenario: ScenarioContext = {
      text: `${input.issueDescription ?? ''} ${input.companyName ?? ''} ${input.desiredOutcome ?? ''}`.toLowerCase(),
      letterType: typeof input.letterType === 'string' ? input.letterType : undefined,
    };
    const refs = Array.isArray(run.legal_references) ? (run.legal_references as string[]) : [];

    const replay = checkCitations(scenario, refs);

    // Rule-level stats — count every triggered rule, increment its
    // pass-count when this letter satisfied it.
    for (const ruleId of replay.triggeredRuleIds) {
      const stat = ruleStats.get(ruleId) ?? { triggered: 0, passed: 0 };
      stat.triggered += 1;
      // A rule passes for this letter if NONE of its requirements
      // appear in the missing list. Cheap approximation: rule passed
      // if checkCitations found ZERO missing across all triggered
      // rules. Per-rule attribution is lossy without re-running
      // per-rule, which is fine for the dashboard signal.
      if (replay.passed) stat.passed += 1;
      ruleStats.set(ruleId, stat);
    }

    if (replay.passed) {
      passed += 1;
    } else {
      failed += 1;
      regressions.push({
        agent_run_id: run.id,
        user_id: run.user_id,
        company: typeof input.companyName === 'string' ? input.companyName : '(unknown)',
        triggered_rules: replay.triggeredRuleIds,
        missing_now: replay.missing.map((m) => m.label),
      });
    }
  }

  const result: AuditResult = {
    ok: failed === 0,
    generated_at: new Date().toISOString(),
    window_days: 7,
    letters_audited: runs.length,
    passed,
    failed,
    retried_in_realtime: retriedInRealtime,
    forced_in_realtime: forcedInRealtime,
    regressions: regressions.slice(0, 25),
    rule_breakdown: Array.from(ruleStats.entries())
      .map(([rule_id, s]) => ({
        rule_id,
        triggered_count: s.triggered,
        pass_rate: s.triggered === 0 ? 1 : s.passed / s.triggered,
      }))
      .sort((a, b) => a.pass_rate - b.pass_rate || b.triggered_count - a.triggered_count),
  };

  // Persist to business_log for the founder dashboard.
  try {
    await sb.from('business_log').insert({
      category: 'citation_audit',
      title: result.ok
        ? `Citation audit OK — ${result.letters_audited} letters, all pass`
        : `Citation audit FAIL — ${result.failed}/${result.letters_audited} letters under-cite`,
      content: JSON.stringify(result, null, 2),
      created_by: 'citation-audit-cron',
    });
  } catch (e) {
    console.warn('[citation-audit] business_log write failed', e instanceof Error ? e.message : e);
  }

  // Telegram alert on regression (any failing letter at all).
  if (!result.ok) {
    try {
      const lines: string[] = [
        `🚨 *Citation audit alert* — ${result.failed} of ${result.letters_audited} letter${result.letters_audited === 1 ? '' : 's'} from the last 7 days under-cite`,
        '',
      ];
      for (const r of result.regressions.slice(0, 5)) {
        lines.push(
          `• *${r.company}* — missing: ${r.missing_now.join(', ')} (rules: ${r.triggered_rules.join(', ')})`,
        );
      }
      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
      if (token && chatId) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text: lines.join('\n'), parse_mode: 'Markdown' }),
        });
      }
    } catch (e) {
      console.warn('[citation-audit] Telegram failed', e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}
