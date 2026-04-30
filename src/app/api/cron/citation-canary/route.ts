/**
 * GET /api/cron/citation-canary
 *
 * PROACTIVE canary — runs every morning BEFORE users start drafting
 * letters. Catches structural breaks in the citation system before a
 * single real user is affected.
 *
 * Architecture (Paul's design, 28 April 2026):
 *
 *   "the AI scan determine[s] what reference to use based on the laws
 *    that are in the system and have another job that ensures they
 *    are up to date for that day"
 *
 * Hand-coded test scenarios are brittle — they only test what we
 * happened to think of. This cron is data-driven:
 *
 *   1. Pulls EVERY active legal_references row (current / updated /
 *      needs_review) — the system's current source of truth.
 *
 *   2. Groups by category. For each category that has any refs, asks
 *      Claude (Haiku — cheap) to generate 2 realistic UK consumer
 *      scenarios that SHOULD cite a named subset of those refs.
 *
 *   3. Runs each generated scenario through the FULL complaint
 *      engine (the same path real users hit). Reads back the
 *      legalReferences array from the engine's output.
 *
 *   4. Verifies the engine cited every reference Claude flagged as
 *      "must include for this scenario". Token-fuzzy match.
 *
 *   5. Any scenario where the engine missed the expected references
 *      → Telegram founder + business_log + return 500.
 *
 * What this catches that hand-coded tests don't:
 *   - A new ref added overnight that the retrieval pipeline ignores
 *   - A ref deleted from legal_references that the engine still tries
 *     to ground in (now silently citation-blind)
 *   - A category-mapping drift where 'finance' refs stop reaching
 *     'complaint' scenarios
 *   - Verification_status drift (a ref flipped to 'superseded'
 *     overnight that the rule-library still references)
 *   - Prompt-induced bias against citing certain rules (model
 *     skipping Auto-Compensation in favour of CRA)
 *
 * Schedule: vercel.json — daily 03:00 UTC (1h before
 * verify-legal-refs at 04:00, so we can sanity-check yesterday's
 * state before today's verifier runs).
 *
 * Cost: ~30s of Claude Haiku per run. Negligible.
 *
 * Auth: Bearer CRON_SECRET (Vercel cron sends GET).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { generateComplaintLetter } from '@/lib/agents/complaints-agent';

export const runtime = 'nodejs';
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

// Categories we test daily. Skip 'general' (covered by every other
// category's overflow refs) and very-low-volume categories (gym /
// nhs / dvla — covered by their own rules already).
const TEST_CATEGORIES = ['finance', 'broadband', 'energy', 'travel', 'rail', 'insurance', 'parking', 'debt'];

interface ScenarioCase {
  scenario_text: string;
  desired_outcome: string;
  amount_gbp?: number;
  must_cite_law_names: string[];
  why: string;
}

interface CanaryResult {
  ok: boolean;
  generated_at: string;
  categories_tested: number;
  scenarios_run: number;
  passed: number;
  failed: number;
  failures: Array<{
    category: string;
    scenario: string;
    expected: string[];
    actual: string[];
    missing: string[];
  }>;
}

/**
 * Ask Claude to generate realistic test scenarios from the live refs
 * for a category. The model must produce scenarios that CITE specific
 * named refs from the input — keeps the test data-driven.
 */
async function generateCanaryScenarios(
  category: string,
  refs: Array<{ law_name: string; section: string | null; summary: string }>,
): Promise<ScenarioCase[]> {
  const refsBlock = refs
    .map((r, i) => `[${i + 1}] ${r.law_name}${r.section ? `, ${r.section}` : ''} — ${r.summary?.slice(0, 200) ?? ''}`)
    .join('\n');

  const prompt = `You are designing realistic test scenarios for a UK consumer-law complaint engine.

Category: ${category}

Live UK consumer-law references in our system for this category (numbered):
${refsBlock}

Generate exactly 2 realistic complaint scenarios from a UK consumer in this category. For each:
- Write a 2-3 sentence \`scenario_text\` as if a customer described their problem in their own words.
- A plain-English \`desired_outcome\`.
- A \`must_cite_law_names\` array — exact \`law_name\` strings (NOT [n] indexes) that any competent UK consumer-rights letter for this scenario should cite. Pick the 1-3 most directly applicable refs from the list above.
- \`why\` — one sentence explaining why these refs are mandatory.
- Optional \`amount_gbp\` if the scenario implies a money figure.

Return JSON only:
[
  { "scenario_text": "…", "desired_outcome": "…", "amount_gbp": 1234, "must_cite_law_names": ["…"], "why": "…" },
  ...
]`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });
  const content = message.content[0];
  if (content.type !== 'text') return [];
  const match = content.text.match(/\[[\s\S]*\]/);
  if (!match) return [];
  try {
    const parsed = JSON.parse(match[0]) as ScenarioCase[];
    return parsed.filter(
      (c) =>
        typeof c.scenario_text === 'string' &&
        typeof c.desired_outcome === 'string' &&
        Array.isArray(c.must_cite_law_names) &&
        c.must_cite_law_names.length > 0,
    );
  } catch {
    return [];
  }
}

function citationFuzzyMatch(needle: string, haystack: string[]): boolean {
  const n = needle.toLowerCase();
  // Strip year suffix and section tail for a tolerant match — the
  // model's exact wording often differs from the engine's exact
  // wording. "Consumer Rights Act 2015" matches "Consumer Rights Act
  // 2015 s.62" matches "CRA 2015 part 2".
  const tokens = n
    .replace(/,\s*\d{4}/, '')
    .split(/\s+/)
    .filter((t) => t.length >= 4);
  return haystack.some((h) => {
    const hLower = h.toLowerCase();
    return tokens.some((t) => hLower.includes(t));
  });
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }
  const sb = admin();

  const { data: allRefs } = await sb
    .from('legal_references')
    .select('category, law_name, section, summary, verification_status')
    .in('verification_status', ['current', 'updated', 'needs_review']);

  if (!allRefs || allRefs.length === 0) {
    return NextResponse.json({ ok: false, error: 'No refs in legal_references' }, { status: 500 });
  }

  // Group by category
  const byCategory = new Map<string, typeof allRefs>();
  for (const r of allRefs) {
    const c = (r.category as string) ?? 'general';
    if (!byCategory.has(c)) byCategory.set(c, []);
    byCategory.get(c)!.push(r);
  }

  const failures: CanaryResult['failures'] = [];
  let scenariosRun = 0;
  let passed = 0;
  let failed = 0;
  let categoriesTested = 0;

  for (const cat of TEST_CATEGORIES) {
    const refs = byCategory.get(cat);
    if (!refs || refs.length === 0) continue;
    categoriesTested += 1;

    // 1. Have Claude generate scenarios from the live refs.
    const scenarios = await generateCanaryScenarios(cat, refs);
    if (scenarios.length === 0) {
      console.warn(`[citation-canary] no scenarios generated for category=${cat}`);
      continue;
    }

    // 2. Run each scenario through the engine and verify citations.
    for (const sc of scenarios) {
      scenariosRun += 1;
      try {
        const result = await generateComplaintLetter({
          companyName: 'Test Provider',
          issueDescription: sc.scenario_text,
          desiredOutcome: sc.desired_outcome,
          amount: sc.amount_gbp ? String(sc.amount_gbp) : undefined,
          letterType: 'complaint',
          // The engine's category resolver doesn't see 'category' as
          // input — it works from issueDescription text. We're testing
          // the WHOLE pipeline including category resolution, so don't
          // shortcut.
        });

        const actual = result.legalReferences || [];
        const missing = sc.must_cite_law_names.filter(
          (mustCite) => !citationFuzzyMatch(mustCite, actual),
        );

        if (missing.length === 0) {
          passed += 1;
        } else {
          failed += 1;
          failures.push({
            category: cat,
            scenario: sc.scenario_text.slice(0, 200),
            expected: sc.must_cite_law_names,
            actual,
            missing,
          });
        }
      } catch (e) {
        failed += 1;
        failures.push({
          category: cat,
          scenario: sc.scenario_text.slice(0, 200),
          expected: sc.must_cite_law_names,
          actual: [],
          missing: [`ENGINE_ERROR: ${e instanceof Error ? e.message : String(e)}`],
        });
      }
    }
  }

  const ok = failed === 0;
  const result: CanaryResult = {
    ok,
    generated_at: new Date().toISOString(),
    categories_tested: categoriesTested,
    scenarios_run: scenariosRun,
    passed,
    failed,
    failures,
  };

  // Persist to business_log (audit trail).
  try {
    await sb.from('business_log').insert({
      category: 'citation_canary',
      title: ok
        ? `Citation canary OK — ${passed}/${scenariosRun} scenarios across ${categoriesTested} categories`
        : `Citation canary FAIL — ${failed}/${scenariosRun} scenarios under-cite`,
      content: JSON.stringify(result, null, 2),
      created_by: 'citation-canary-cron',
    });
  } catch (e) {
    console.warn('[citation-canary] business_log write failed', e instanceof Error ? e.message : e);
  }

  // Telegram alert on any failure — this is the proactive trip-wire
  // we want to see BEFORE users hit it.
  if (!ok) {
    try {
      const lines: string[] = [
        `🚨 *Citation canary alert* — ${failed}/${scenariosRun} scenarios under-cite`,
        '',
        'The engine missed required citations on synthetic test scenarios generated from the LIVE legal_references table. Real user letters today are at risk of the same shortfall.',
        '',
      ];
      for (const f of failures.slice(0, 5)) {
        lines.push(`*${f.category}*: missing ${f.missing.length} ref${f.missing.length === 1 ? '' : 's'}`);
        for (const m of f.missing.slice(0, 3)) {
          lines.push(`  • ${m}`);
        }
        lines.push('');
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
      console.warn('[citation-canary] Telegram failed', e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json(result, { status: ok ? 200 : 500 });
}
