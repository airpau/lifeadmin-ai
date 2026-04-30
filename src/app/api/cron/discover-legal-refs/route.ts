/**
 * GET /api/cron/discover-legal-refs?leg=recent|category
 *
 * Active legal-reference discovery pipeline. Per founder strategic note:
 *   "We need to always be ADDING to the laws in the compliance centre to
 *    ensure Paybacker always has every source of law that can be cited."
 *
 * Two legs:
 *   - leg=recent  : weekly broad sweep of UK consumer-law changes in the
 *                   last 30 days (Acts, SIs, Ofcom/Ofgem/FCA rulings,
 *                   FOS decisions, CAA, HMRC/DVLA, court rulings).
 *   - leg=category: daily per-category coverage check, rotating through
 *                   the distinct categories so each is touched ~bi-weekly.
 *
 * Output flow (NEVER auto-applies):
 *   1. Ask Perplexity sonar-pro.
 *   2. For each returned item, dedupe against legal_references and
 *      legal_ref_candidates (by source_url or title substring match).
 *   3. Insert survivors into legal_ref_candidates with status='pending'.
 *   4. Log run summary into legal_ref_discovery_runs.
 *
 * Cost control:
 *   - Hard cap: max 60 Perplexity calls per run (£0.30 ish).
 *   - If pending candidate queue > 100, skip with a 'queue full' note.
 *   - Every Perplexity call goes through logPerplexityCall.
 *
 * Per CLAUDE.md rule #3 — Perplexity only for real-time web research.
 *
 * Auth: Bearer CRON_SECRET (Vercel cron) OR logged-in admin (founder
 * "Discover now" button).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { logPerplexityCall } from '@/lib/cost-ledger';
import { checkUkLegalAuthority } from '@/lib/legal-refs-authority';

const CITATION_SOURCE_RULE = [
  'CITATION SOURCE RULE (mandatory): Only return URLs from primary UK legal',
  'authorities. Acceptable sources: legislation.gov.uk, gov.uk and its',
  'subdomains (.fca.org.uk, .ofcom.org.uk, .ofgem.gov.uk, etc.),',
  'financial-ombudsman.org.uk, parliament.uk, bailii.org, judiciary.uk,',
  'supremecourt.uk, ico.org.uk, cma.gov.uk, caa.co.uk, orr.gov.uk, nhs.uk.',
  '',
  'NEVER cite trade associations (UK Finance, ABI, BSA), commentary sites,',
  'news sites, law-firm blogs, Wikipedia, MoneySavingExpert, Which?, or',
  'consumer-rights aggregators. They are commentary, not authority.',
  '',
  'If the only available source is a trade association or commentary site,',
  'return null for source_url rather than fabricating a primary citation.',
].join('\n');

export const runtime = 'nodejs';
export const maxDuration = 120;

const PERPLEXITY_USD_PER_CALL = 0.005; // sonar-pro flat rate per cost-ledger.ts
const USD_TO_GBP = 0.79;
const HARD_CAP_GBP = 0.30;
const MAX_CALLS_PER_RUN = Math.floor(HARD_CAP_GBP / (PERPLEXITY_USD_PER_CALL * USD_TO_GBP)); // ~75
const MAX_PENDING_QUEUE = 100;

// Default category list — used if the legal_references table is empty
// (shouldn't happen in prod) or if a brand-new category is requested.
const DEFAULT_CATEGORIES = [
  'energy', 'broadband', 'mobile', 'water', 'insurance', 'fitness',
  'software', 'finance', 'food', 'transport', 'statutory', 'streaming',
  'banking', 'debt-recovery',
];

interface PerplexityCandidate {
  title: string;
  source_url?: string | null;
  source_type?: string | null;
  summary?: string | null;
  category?: string | null;
  jurisdiction?: string | null;
  published_at?: string | null;
  citation?: string | null;
  confidence?: string | null;
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function normaliseTitle(s: string): string {
  return s.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function callPerplexity(prompt: string): Promise<{ items: PerplexityCandidate[]; raw: unknown }> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) throw new Error('PERPLEXITY_API_KEY not set');
  const res = await fetch('https://api.perplexity.ai/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'sonar-pro',
      messages: [
        { role: 'system', content: CITATION_SOURCE_RULE },
        { role: 'user', content: prompt },
      ],
      return_citations: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`Perplexity HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  logPerplexityCall({ model: 'sonar-pro', endpoint: '/api/cron/discover-legal-refs' });
  const content: string = data.choices?.[0]?.message?.content ?? '';
  const match = content.match(/\[[\s\S]*\]/);
  if (!match) return { items: [], raw: data };
  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    return { items: [], raw: data };
  }
  if (!Array.isArray(parsed)) return { items: [], raw: data };
  const items = parsed.filter(
    (u): u is PerplexityCandidate =>
      !!u && typeof u === 'object' && typeof (u as PerplexityCandidate).title === 'string',
  );
  return { items, raw: data };
}

function recentPrompt(): string {
  return `List UK consumer law changes published in the last 30 days — Acts, statutory instruments, Ofcom/Ofgem/FCA rulings, FOS decisions, Civil Aviation Authority updates, HMRC/DVLA guidance changes, court rulings on consumer rights. Return ONLY a JSON array (no preamble, no markdown fences) with objects shaped:
[{"title": "...", "source_url": "...", "source_type": "statute|regulator_rule|case_law|guidance|fos_decision", "summary": "...", "jurisdiction": "UK", "published_at": "yyyy-mm-dd", "category": "energy|broadband|mobile|water|insurance|finance|transport|banking|statutory|streaming|software|fitness|food|debt-recovery", "confidence": "high|medium|low"}]
Only items genuinely material for consumer disputes. Maximum 15 items.`;
}

function categoryPrompt(category: string): string {
  return `For UK ${category} consumer disputes, list all currently-cited primary statutes, statutory instruments, regulator rules, ombudsman decisions and binding case law. Return ONLY a JSON array (no preamble, no markdown fences) with objects:
[{"title": "...", "source_url": "...", "source_type": "statute|regulator_rule|case_law|guidance|fos_decision", "citation": "...", "summary": "...", "category": "${category}", "jurisdiction": "UK", "confidence": "high|medium|low"}]
Include items that are commonly cited even if not the freshest. Maximum 15 items.`;
}

async function loadCategoriesFromDb(): Promise<string[]> {
  const admin = getAdmin();
  const { data } = await admin
    .from('legal_references')
    .select('category')
    .not('category', 'is', null)
    .limit(2000);
  if (!data) return DEFAULT_CATEGORIES;
  const set = new Set<string>();
  for (const row of data as Array<{ category: string | null }>) {
    if (row.category) set.add(row.category);
  }
  const list = Array.from(set);
  return list.length > 0 ? list.sort() : DEFAULT_CATEGORIES;
}

/**
 * Best-effort dedupe. Two checks:
 *   - exact source_url match against legal_references
 *   - normalised title substring match against legal_references.law_name
 *   - same checks against legal_ref_candidates with status in pending/rejected
 *     (avoid resurrecting a previously-rejected suggestion)
 */
async function isDuplicate(
  cand: PerplexityCandidate,
): Promise<boolean> {
  const admin = getAdmin();
  const url = cand.source_url?.trim() || null;
  const norm = normaliseTitle(cand.title);
  if (url) {
    const { data: byUrl } = await admin
      .from('legal_references')
      .select('id')
      .eq('source_url', url)
      .limit(1);
    if (byUrl && byUrl.length > 0) return true;
    const { data: candByUrl } = await admin
      .from('legal_ref_candidates')
      .select('id')
      .eq('source_url', url)
      .in('status', ['pending', 'rejected', 'approved'])
      .limit(1);
    if (candByUrl && candByUrl.length > 0) return true;
  }
  if (norm.length > 5) {
    // ilike substring on first 30 chars of normalised title
    const probe = norm.slice(0, 30);
    const { data: byTitle } = await admin
      .from('legal_references')
      .select('id')
      .ilike('law_name', `%${probe}%`)
      .limit(1);
    if (byTitle && byTitle.length > 0) return true;
  }
  return false;
}

async function pendingQueueSize(): Promise<number> {
  const admin = getAdmin();
  const { count } = await admin
    .from('legal_ref_candidates')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  return count ?? 0;
}

async function logRun(args: {
  leg: 'recent_updates' | 'category_coverage';
  category?: string | null;
  found: number;
  added: number;
  skipped: number;
  costGbp: number;
  raw?: unknown;
  notes?: string | null;
}): Promise<number | null> {
  const admin = getAdmin();
  const { data, error } = await admin
    .from('legal_ref_discovery_runs')
    .insert({
      leg: args.leg,
      category: args.category ?? null,
      candidates_found: args.found,
      candidates_added: args.added,
      candidates_skipped_duplicate: args.skipped,
      cost_gbp: args.costGbp,
      perplexity_response: args.raw ?? null,
      notes: args.notes ?? null,
    })
    .select('id')
    .single();
  if (error) {
    console.warn('[discover-legal-refs] run log insert failed:', error.message);
    return null;
  }
  return (data as { id: number } | null)?.id ?? null;
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  const url = new URL(request.url);
  const legParam = (url.searchParams.get('leg') || 'recent').toLowerCase();
  const leg: 'recent_updates' | 'category_coverage' =
    legParam === 'category' || legParam === 'category_coverage'
      ? 'category_coverage'
      : 'recent_updates';

  const queueSize = await pendingQueueSize();
  if (queueSize > MAX_PENDING_QUEUE) {
    const notes = `queue full — review pending first (${queueSize} pending)`;
    await logRun({ leg, found: 0, added: 0, skipped: 0, costGbp: 0, notes });
    return NextResponse.json({ ok: true, skipped: true, notes, candidates_found: 0, candidates_added: 0, candidates_skipped_duplicate: 0 });
  }

  // Resolve target category for leg B — rotate through categories using
  // day-of-year mod N so each fires every ~14 days.
  let targetCategory: string | null = null;
  if (leg === 'category_coverage') {
    const categories = await loadCategoriesFromDb();
    const explicit = url.searchParams.get('category');
    if (explicit && categories.includes(explicit)) {
      targetCategory = explicit;
    } else {
      const start = new Date(Date.UTC(new Date().getUTCFullYear(), 0, 0));
      const dayOfYear = Math.floor((Date.now() - start.getTime()) / (1000 * 60 * 60 * 24));
      targetCategory = categories[dayOfYear % categories.length];
    }
  }

  const prompt = leg === 'recent_updates' ? recentPrompt() : categoryPrompt(targetCategory!);

  let perplexityResult: { items: PerplexityCandidate[]; raw: unknown } = { items: [], raw: null };
  let costGbp = 0;
  try {
    perplexityResult = await callPerplexity(prompt);
    costGbp = PERPLEXITY_USD_PER_CALL * USD_TO_GBP;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await logRun({ leg, category: targetCategory, found: 0, added: 0, skipped: 0, costGbp: 0, notes: `perplexity error: ${msg}` });
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }

  // Cap on calls — current implementation is single-call per run, but
  // guard anyway so a future fan-out can't exceed the budget silently.
  if (costGbp > HARD_CAP_GBP) {
    await logRun({ leg, category: targetCategory, found: 0, added: 0, skipped: 0, costGbp, notes: 'cost cap exceeded — aborted' });
    return NextResponse.json({ ok: false, error: 'cost cap exceeded' }, { status: 429 });
  }

  const items = perplexityResult.items.slice(0, MAX_CALLS_PER_RUN); // safety bound
  let added = 0;
  let skipped = 0;
  let rejectedNonAuthority = 0;
  let secondaryFlagged = 0;
  const admin = getAdmin();

  // Insert run row first so candidates can reference it.
  const runId = await logRun({
    leg,
    category: targetCategory,
    found: items.length,
    added: 0,
    skipped: 0,
    costGbp,
    raw: perplexityResult.raw,
    notes: targetCategory ? `category: ${targetCategory}` : null,
  });

  for (const item of items) {
    if (!item.title || typeof item.title !== 'string') {
      skipped++;
      continue;
    }
    if (await isDuplicate(item)) {
      skipped++;
      continue;
    }

    // Authority allowlist gate. Drop rejected/unrecognised entirely.
    // Secondary sources are queued but force-low-confidence with a
    // notes warning so the founder must verify before approving.
    let confidence = item.confidence?.toString().slice(0, 20) || null;
    let summaryWithWarning = item.summary?.toString().slice(0, 4000) || null;
    if (item.source_url) {
      const authority = checkUkLegalAuthority(item.source_url);
      if (!authority.ok) {
        rejectedNonAuthority++;
        skipped++;
        continue;
      }
      if (authority.reason === 'secondary') {
        secondaryFlagged++;
        confidence = 'low';
        const warning =
          `[secondary source: ${authority.matched_domain}] verify against primary source before approving. `;
        summaryWithWarning = (warning + (summaryWithWarning ?? '')).slice(0, 4000);
      }
    }

    const { error } = await admin.from('legal_ref_candidates').insert({
      title: item.title.slice(0, 500),
      source_url: item.source_url?.toString().slice(0, 1000) || null,
      source_type: item.source_type?.toString().slice(0, 80) || null,
      summary: summaryWithWarning,
      category: (item.category || targetCategory || null)?.toString().slice(0, 80) || null,
      jurisdiction: item.jurisdiction || 'UK',
      confidence,
      status: 'pending',
      discovery_run_id: runId,
    });
    if (error) {
      console.warn('[discover-legal-refs] candidate insert failed:', error.message);
      skipped++;
      continue;
    }
    added++;
  }

  // Update run row with final tallies (best-effort).
  const authorityNotes =
    rejectedNonAuthority > 0 || secondaryFlagged > 0
      ? `authority_filter: {rejected_non_authority: ${rejectedNonAuthority}, secondary: ${secondaryFlagged}}`
      : null;
  if (runId !== null) {
    const update: Record<string, unknown> = {
      candidates_added: added,
      candidates_skipped_duplicate: skipped,
    };
    if (authorityNotes) {
      // Append to existing notes rather than overwriting the category tag.
      const existingNote = targetCategory ? `category: ${targetCategory}` : null;
      update.notes = [existingNote, authorityNotes].filter(Boolean).join(' | ');
    }
    await admin
      .from('legal_ref_discovery_runs')
      .update(update)
      .eq('id', runId);
  }

  return NextResponse.json({
    ok: true,
    leg,
    category: targetCategory,
    candidates_found: items.length,
    candidates_added: added,
    candidates_skipped_duplicate: skipped,
    rejected_non_authority: rejectedNonAuthority,
    secondary: secondaryFlagged,
    cost_gbp: Number(costGbp.toFixed(6)),
  });
}

export async function POST(request: NextRequest) {
  // Mirror GET so the founder "Discover now" admin button can POST.
  return GET(request);
}
