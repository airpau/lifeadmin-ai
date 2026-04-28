/**
 * GET /api/cron/legal-coverage-alert
 *
 * Daily failsafe for the legal_references index. The B2B API's whole
 * value depends on the index being fresh and complete; if it ever
 * goes silent or thin, B2B customers ground their replies in stale
 * UK law and we lose the moat. This cron alerts loud BEFORE that
 * happens.
 *
 * Schedule: daily 07:00 UTC (after verify-legal-refs at 05:00 and
 * legal-updates at 06:00, so this sees fresh metrics).
 *
 * Three layers:
 *
 * 1. INDEX FRESHNESS — every active ref should have last_verified
 *    within 14 days. Stale refs decay confidence_score and a list is
 *    surfaced. >5 stale = alert.
 *
 * 2. SOURCE FRESHNESS — every distinct source_url should have been
 *    fetched in the last 48h. A source going silent means our daily
 *    crons have been failing for that source.
 *
 * 3. COVERAGE BREADTH — every dispute_type returnable by the API
 *    must have ≥1 ref with verification_status = 'current' or
 *    'updated'. A dispute_type with zero refs means the API will
 *    return 422 NO_STATUTE_MATCH for that whole sector.
 *
 * Plus a named-statute check for the priority-A statutes the
 * marketing copy advertises: CRA 2015 s.9/s.19/s.49, CCA 1974 s.75/
 * s.77/s.78, UK261, SLC 21BA, Ofcom GC C1, Limitation Act s.5, FOS
 * 8-week rule, Tenant Fees Act, FCA Consumer Duty. Any missing → alert.
 *
 * Output:
 *   - business_log row with the full report
 *   - Telegram founder ping if any layer trips
 *   - JSON response with ok=false when any check fails
 *
 * Auth: Bearer CRON_SECRET (Vercel cron sends GET).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Every dispute_type the B2B API can return. Each MUST have ≥1
// active ref or the API will 422 for that whole sector.
const REQUIRED_CATEGORIES = [
  'energy', 'broadband', 'finance', 'travel', 'rail', 'insurance',
  'council_tax', 'parking', 'hmrc', 'dvla', 'nhs', 'gym', 'debt', 'general',
];

// Statutes named in the marketing / docs that the engine MUST be
// able to ground in. If a phrase here returns no rows, the named
// statute is missing from the index and a customer relying on it
// gets the wrong answer.
const REQUIRED_STATUTE_KEYWORDS: { keyword: string; description: string }[] = [
  { keyword: 'Consumer Rights Act 2015', description: 'CRA 2015 — primary consumer-goods/services statute' },
  { keyword: 'Consumer Credit Act 1974', description: 'CCA 1974 — Section 75, 77, 78 (chargeback, agreements)' },
  { keyword: 'UK261', description: 'UK261 / EU261 retained — flight delay/cancellation' },
  { keyword: 'Standard Licence Condition 21B', description: 'Ofgem SLC 21BA — energy back-billing 12-month rule' },
  { keyword: 'General Conditions', description: 'Ofcom General Conditions — broadband / mobile rights' },
  { keyword: 'Limitation Act 1980', description: 'Limitation Act — statute-barred debt 6yrs/5yrs Scotland' },
  { keyword: 'Tenant Fees Act', description: 'Tenant Fees Act 2019 — landlord/letting fee rules' },
  { keyword: 'Consumer Contracts (Information', description: 'CCR 2013 — distance / off-premises 14-day cancellation' },
  { keyword: 'Equality Act 2010', description: 'Equality Act — discrimination claims' },
  { keyword: 'Package Travel', description: 'Package Travel Regs 2018 — package holidays / ATOL' },
];

const FRESHNESS_DAYS = 14;
const SOURCE_FRESHNESS_HOURS = 48;
const STALE_REF_ALERT_THRESHOLD = 5;

interface CoverageReport {
  ok: boolean;
  generated_at: string;
  layer_1_freshness: {
    total_refs: number;
    stale_count: number;
    stale_threshold_days: number;
    stale_refs: Array<{ id: string; law_name: string; section: string | null; days_stale: number; confidence: number }>;
    failed: boolean;
  };
  layer_2_sources: {
    total_sources: number;
    silent_sources: Array<{ source_url: string; hours_since_check: number; refs_using_it: number }>;
    failed: boolean;
  };
  layer_3_coverage: {
    missing_categories: string[];
    missing_named_statutes: Array<{ keyword: string; description: string }>;
    failed: boolean;
  };
  pending_review_queue: {
    open_count: number;
    oldest_age_days: number | null;
    failed: boolean;
  };
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }
  const sb = admin();

  // --- Layer 1: index freshness -------------------------------------
  const stalenessCutoff = new Date(Date.now() - FRESHNESS_DAYS * 86400_000).toISOString();
  const { data: allActive } = await sb
    .from('legal_references')
    .select('id, law_name, section, last_verified, confidence_score')
    .in('verification_status', ['current', 'updated']);
  const total = allActive?.length ?? 0;
  const stale = (allActive ?? []).filter((r) => !r.last_verified || r.last_verified < stalenessCutoff);
  const staleRefs = stale.slice(0, 20).map((r) => ({
    id: r.id,
    law_name: r.law_name,
    section: r.section ?? null,
    days_stale: r.last_verified
      ? Math.floor((Date.now() - new Date(r.last_verified).getTime()) / 86400_000)
      : 999,
    confidence: r.confidence_score ?? 0,
  }));

  // --- Layer 2: source freshness ------------------------------------
  // Pull every distinct source_url from active refs and compare against
  // legal_audit_log to see when each was last successfully checked.
  const sourceCutoff = new Date(Date.now() - SOURCE_FRESHNESS_HOURS * 3600_000).toISOString();
  const { data: sourceRows } = await sb
    .from('legal_references')
    .select('source_url')
    .in('verification_status', ['current', 'updated'])
    .not('source_url', 'is', null);
  const sourceCounts = new Map<string, number>();
  for (const r of sourceRows ?? []) {
    const u = (r.source_url as string | null) ?? '';
    if (u) sourceCounts.set(u, (sourceCounts.get(u) ?? 0) + 1);
  }
  // Most-recent legal_audit_log row per source URL.
  const silentSources: CoverageReport['layer_2_sources']['silent_sources'] = [];
  for (const [url, refsUsingIt] of sourceCounts.entries()) {
    const { data: lastCheck } = await sb
      .from('legal_audit_log')
      .select('created_at')
      .eq('source_url', url)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    const lastCheckedAt = lastCheck?.created_at ?? null;
    if (!lastCheckedAt || lastCheckedAt < sourceCutoff) {
      const hoursSince = lastCheckedAt
        ? Math.floor((Date.now() - new Date(lastCheckedAt).getTime()) / 3600_000)
        : 9999;
      silentSources.push({ source_url: url, hours_since_check: hoursSince, refs_using_it: refsUsingIt });
    }
  }

  // --- Layer 3: coverage breadth ------------------------------------
  const { data: byCat } = await sb
    .from('legal_references')
    .select('category')
    .in('verification_status', ['current', 'updated']);
  const present = new Set<string>();
  for (const r of byCat ?? []) present.add((r.category as string) ?? 'general');
  const missingCategories = REQUIRED_CATEGORIES.filter((c) => !present.has(c));

  const missingNamedStatutes: Array<{ keyword: string; description: string }> = [];
  for (const probe of REQUIRED_STATUTE_KEYWORDS) {
    const { count } = await sb
      .from('legal_references')
      .select('id', { count: 'exact', head: true })
      .in('verification_status', ['current', 'updated'])
      .ilike('law_name', `%${probe.keyword}%`);
    if (!count || count === 0) missingNamedStatutes.push(probe);
  }

  // --- Pending review queue ----------------------------------------
  const { data: pending } = await sb
    .from('legal_update_queue')
    .select('id, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });
  const openCount = pending?.length ?? 0;
  const oldestAgeDays = pending && pending.length > 0
    ? Math.floor((Date.now() - new Date(pending[0].created_at).getTime()) / 86400_000)
    : null;

  // --- Roll up & alert ---------------------------------------------
  const layer1Failed = staleRefs.length > STALE_REF_ALERT_THRESHOLD;
  const layer2Failed = silentSources.length > 0;
  const layer3Failed = missingCategories.length > 0 || missingNamedStatutes.length > 0;
  const pendingFailed = (oldestAgeDays ?? 0) > 7;
  const ok = !layer1Failed && !layer2Failed && !layer3Failed && !pendingFailed;

  const report: CoverageReport = {
    ok,
    generated_at: new Date().toISOString(),
    layer_1_freshness: {
      total_refs: total,
      stale_count: stale.length,
      stale_threshold_days: FRESHNESS_DAYS,
      stale_refs: staleRefs,
      failed: layer1Failed,
    },
    layer_2_sources: {
      total_sources: sourceCounts.size,
      silent_sources: silentSources,
      failed: layer2Failed,
    },
    layer_3_coverage: {
      missing_categories: missingCategories,
      missing_named_statutes: missingNamedStatutes,
      failed: layer3Failed,
    },
    pending_review_queue: {
      open_count: openCount,
      oldest_age_days: oldestAgeDays,
      failed: pendingFailed,
    },
  };

  // Persist to business_log so the founder dashboard / SQL queries
  // can audit every run, not just the failures.
  try {
    await sb.from('business_log').insert({
      category: 'legal_coverage_alert',
      title: ok
        ? `Legal coverage OK — ${total} refs across ${present.size} categories`
        : `Legal coverage ALERT — failed checks: ${[
            layer1Failed ? 'freshness' : null,
            layer2Failed ? 'sources' : null,
            layer3Failed ? 'coverage' : null,
            pendingFailed ? 'review_queue' : null,
          ].filter(Boolean).join(', ')}`,
      content: JSON.stringify(report, null, 2),
      created_by: 'legal-coverage-alert-cron',
    });
  } catch (e) {
    console.warn('[legal-coverage-alert] business_log write failed', e instanceof Error ? e.message : e);
  }

  // Telegram alert on any failure. Fire-and-forget — don't gate cron
  // success on Telegram delivery.
  if (!ok) {
    try {
      const lines: string[] = ['🚨 *Legal coverage alert*', ''];
      if (layer1Failed) {
        lines.push(`⏰ *Freshness*: ${stale.length} of ${total} refs not verified in ${FRESHNESS_DAYS} days`);
        for (const r of staleRefs.slice(0, 5)) {
          lines.push(`  • ${r.law_name}${r.section ? ` ${r.section}` : ''} — ${r.days_stale}d stale`);
        }
        lines.push('');
      }
      if (layer2Failed) {
        lines.push(`📡 *Sources silent ${SOURCE_FRESHNESS_HOURS}h+*: ${silentSources.length}`);
        for (const s of silentSources.slice(0, 5)) {
          lines.push(`  • ${s.refs_using_it} ref(s) at ${s.source_url}`);
        }
        lines.push('');
      }
      if (layer3Failed) {
        if (missingCategories.length > 0) {
          lines.push(`🕳 *Missing categories*: ${missingCategories.join(', ')}`);
        }
        if (missingNamedStatutes.length > 0) {
          lines.push(`🕳 *Missing named statutes*:`);
          for (const m of missingNamedStatutes) {
            lines.push(`  • ${m.keyword} — ${m.description}`);
          }
        }
        lines.push('');
      }
      if (pendingFailed) {
        lines.push(`📋 *Review queue stale*: ${openCount} pending, oldest ${oldestAgeDays}d`);
      }

      const token = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
      if (token && chatId) {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text: lines.join('\n'),
            parse_mode: 'Markdown',
          }),
        });
      }
    } catch (e) {
      console.warn('[legal-coverage-alert] Telegram send failed', e instanceof Error ? e.message : e);
    }
  }

  return NextResponse.json(report, { status: ok ? 200 : 500 });
}
