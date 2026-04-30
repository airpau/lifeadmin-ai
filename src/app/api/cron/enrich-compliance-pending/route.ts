/**
 * Compliance enrichment cron (PR ζ).
 *
 * Schedule: 04:00 UTC daily — wired in vercel.json.
 *
 * Purpose: when a correction or candidate lands in the queue, do the
 * legwork BEFORE the founder reviews — fetch source URL, extract relevant
 * text, diff URL/title, risk-score the change, optionally summarise via
 * Perplexity. Founder then sees a fully-prepped diff with evidence
 * instead of a one-line "Perplexity says try this".
 *
 * Hard rules:
 *   - NEVER auto-applies a correction. Only writes enrichment_data
 *     onto the pending row.
 *   - Hard cap: 50 items/day total (corrections + candidates combined).
 *   - Per-item cost ≈ £0.01 (Perplexity AI summary + free HTTP fetch).
 *     Daily worst-case ~£0.50.
 *   - Skips items that already have enriched_at set.
 *   - Gracefully no-ops if legal_ref_corrections / legal_ref_candidates
 *     don't exist yet (sibling PRs δ, ε not merged).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';

export const maxDuration = 300;

const DAILY_CAP = 50;
const FETCH_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 1_000_000; // 1MB

type RiskScore = 'low' | 'medium' | 'high';

interface EnrichmentData {
  fetched_at: string;
  fetched_status: number | null;
  fetched_redirect_chain: string[];
  extracted_text: string;
  url_diff: { from: string | null; to: string | null; redirected_to: string | null };
  title_diff: { from: string | null; to: string | null };
  risk_score: RiskScore;
  risk_reasons: string[];
  ai_summary: string | null;
  error?: string;
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function safeFetch(url: string): Promise<{
  status: number | null;
  body: string;
  finalUrl: string | null;
  redirectChain: string[];
  error?: string;
}> {
  const redirectChain: string[] = [];
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Paybacker-ComplianceEnricher/1.0 (hello@paybacker.co.uk)',
      },
    });
    if (res.url && res.url !== url) redirectChain.push(res.url);

    // Cap body size
    const reader = res.body?.getReader();
    let received = 0;
    const chunks: Uint8Array[] = [];
    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value) continue;
        received += value.length;
        if (received > MAX_BODY_BYTES) {
          chunks.push(value.slice(0, Math.max(0, MAX_BODY_BYTES - (received - value.length))));
          break;
        }
        chunks.push(value);
      }
    }
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const body = buf.toString('utf-8');
    return { status: res.status, body, finalUrl: res.url || url, redirectChain };
  } catch (err) {
    return {
      status: null,
      body: '',
      finalUrl: null,
      redirectChain,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function extractRelevantText(html: string, url: string): string {
  // legislation.gov.uk: try to find h1/h2 + paragraph text near the section
  // For other sources: strip tags, take first 2KB
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (url.includes('legislation.gov.uk')) {
    // Try to find a section heading and the body following it
    const headingMatch = stripped.match(/(\d+\s+[A-Z][^.]+\.[^.]*\.)/);
    if (headingMatch) {
      return stripped.slice(stripped.indexOf(headingMatch[0]), stripped.indexOf(headingMatch[0]) + 2000);
    }
  }
  return stripped.slice(0, 2000);
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? m[1].trim().replace(/\s+/g, ' ') : null;
}

function scoreRisk(opts: {
  urlFrom: string | null;
  urlTo: string | null;
  finalUrl: string | null;
  titleFrom: string | null;
  titleTo: string | null;
  beforeValue: string | null;
  afterValue: string | null;
}): { score: RiskScore; reasons: string[] } {
  const reasons: string[] = [];
  let level: RiskScore = 'low';

  const promote = (target: RiskScore) => {
    const order: Record<RiskScore, number> = { low: 0, medium: 1, high: 2 };
    if (order[target] > order[level]) level = target;
  };

  const { urlFrom, urlTo, finalUrl, titleFrom, titleTo, beforeValue, afterValue } = opts;

  if (urlFrom && urlTo && urlFrom !== urlTo) {
    try {
      const a = new URL(urlFrom);
      const b = new URL(urlTo);
      if (a.host !== b.host) {
        reasons.push(`host changed: ${a.host} → ${b.host}`);
        promote('high');
      } else if (a.pathname !== b.pathname) {
        reasons.push(`path changed: ${a.pathname} → ${b.pathname}`);
        promote('medium');
      } else {
        reasons.push('URL slug differs');
        promote('low');
      }
    } catch {
      reasons.push('URL parse failed — treating as medium');
      promote('medium');
    }
  }

  if (urlTo && finalUrl && urlTo !== finalUrl) {
    reasons.push(`source redirected: ${urlTo} → ${finalUrl}`);
    promote('low');
  }

  if (titleFrom && titleTo && titleFrom !== titleTo) {
    const a = titleFrom.toLowerCase();
    const b = titleTo.toLowerCase();
    if (a === b) {
      reasons.push('title case/punctuation only');
      promote('low');
    } else {
      reasons.push(`title changed: "${titleFrom.slice(0, 60)}" → "${titleTo.slice(0, 60)}"`);
      promote('medium');
    }
  }

  if (beforeValue && afterValue) {
    const sectionRe = /\bsection\s+(\d+)/i;
    const a = beforeValue.match(sectionRe);
    const b = afterValue.match(sectionRe);
    if (a && b && a[1] !== b[1]) {
      reasons.push(`section number changed: ${a[1]} → ${b[1]}`);
      promote('medium');
    }
    // Act-name change heuristic: any 4-digit year change
    const yearA = beforeValue.match(/\b(19|20)\d{2}\b/);
    const yearB = afterValue.match(/\b(19|20)\d{2}\b/);
    if (yearA && yearB && yearA[0] !== yearB[0]) {
      reasons.push(`year edition changed: ${yearA[0]} → ${yearB[0]}`);
      promote('medium');
    }
    // Crude act-name check
    const actA = beforeValue.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+Act)/);
    const actB = afterValue.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+Act)/);
    if (actA && actB && actA[1] !== actB[1]) {
      reasons.push(`act name changed: ${actA[1]} → ${actB[1]}`);
      promote('high');
    }
  }

  if (reasons.length === 0) reasons.push('no material change detected — punctuation/whitespace only');
  return { score: level, reasons };
}

async function perplexitySummary(prompt: string): Promise<string | null> {
  const key = process.env.PERPLEXITY_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [
          {
            role: 'system',
            content:
              'You are an evidence-led UK legal-reference reviewer. Answer in 1-2 sentences. NEVER invent law. If unsure, say so.',
          },
          { role: 'user', content: prompt },
        ],
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    return data.choices?.[0]?.message?.content?.trim() ?? null;
  } catch {
    return null;
  }
}

async function enrichRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: 'legal_ref_corrections' | 'legal_ref_candidates',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any,
): Promise<{ ok: boolean; risk?: RiskScore; error?: string }> {
  const sourceUrl: string | null =
    row.source_url ||
    row.proposed_url ||
    row.after_url ||
    row.url ||
    null;

  let fetched: Awaited<ReturnType<typeof safeFetch>> = {
    status: null,
    body: '',
    finalUrl: null,
    redirectChain: [],
  };
  if (sourceUrl) {
    fetched = await safeFetch(sourceUrl);
  }

  const extractedText = fetched.body
    ? extractRelevantText(fetched.body, sourceUrl || '')
    : '';
  const fetchedTitle = fetched.body ? extractTitle(fetched.body) : null;

  const titleFrom: string | null = row.before_title || row.canonical_title || null;
  const titleTo: string | null = row.after_title || row.proposed_title || fetchedTitle;

  const urlFrom: string | null = row.before_url || row.canonical_url || null;
  const urlTo: string | null = sourceUrl;

  const { score, reasons } = scoreRisk({
    urlFrom,
    urlTo,
    finalUrl: fetched.finalUrl,
    titleFrom,
    titleTo,
    beforeValue: row.before_value || null,
    afterValue: row.after_value || null,
  });

  let aiSummary: string | null = null;
  if (extractedText && (titleTo || urlTo)) {
    const prompt = `Compare this proposed UK legal reference change. Is it likely a primary source still in force? Risk: ${score}. URL: ${urlTo}. Title: ${titleTo}. Excerpt: ${extractedText.slice(0, 800)}`;
    aiSummary = await perplexitySummary(prompt);
  }

  const enrichment: EnrichmentData = {
    fetched_at: new Date().toISOString(),
    fetched_status: fetched.status,
    fetched_redirect_chain: fetched.redirectChain,
    extracted_text: extractedText.slice(0, 2000),
    url_diff: { from: urlFrom, to: urlTo, redirected_to: fetched.finalUrl },
    title_diff: { from: titleFrom, to: titleTo },
    risk_score: score,
    risk_reasons: reasons,
    ai_summary: aiSummary,
    ...(fetched.error ? { error: fetched.error } : {}),
  };

  try {
    const { error } = await supabase
      .from(table)
      .update({
        enrichment_data: enrichment,
        enriched_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    if (error) return { ok: false, error: error.message };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
  return { ok: true, risk: score };
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  const supabase = getAdmin();
  const results = {
    processed_corrections: 0,
    processed_candidates: 0,
    risk_low: 0,
    risk_medium: 0,
    risk_high: 0,
    errors: 0,
    cap: DAILY_CAP,
    tables_missing: { legal_ref_corrections: false, legal_ref_candidates: false },
  };

  let budget = DAILY_CAP;

  // Corrections first
  try {
    const { data: corrections, error } = await supabase
      .from('legal_ref_corrections')
      .select('*')
      .eq('status', 'pending')
      .is('enriched_at', null)
      .order('created_at', { ascending: true })
      .limit(budget);
    if (error) {
      // Likely missing table or missing enriched_at column — skip silently
      results.tables_missing.legal_ref_corrections = true;
    } else if (corrections) {
      for (const row of corrections) {
        if (budget <= 0) break;
        const out = await enrichRow(supabase, 'legal_ref_corrections', row);
        budget--;
        if (out.ok) {
          results.processed_corrections++;
          if (out.risk === 'low') results.risk_low++;
          else if (out.risk === 'medium') results.risk_medium++;
          else if (out.risk === 'high') results.risk_high++;
        } else {
          results.errors++;
        }
      }
    }
  } catch {
    results.tables_missing.legal_ref_corrections = true;
  }

  // Candidates
  try {
    const { data: candidates, error } = await supabase
      .from('legal_ref_candidates')
      .select('*')
      .eq('status', 'pending')
      .is('enriched_at', null)
      .order('created_at', { ascending: true })
      .limit(budget);
    if (error) {
      results.tables_missing.legal_ref_candidates = true;
    } else if (candidates) {
      for (const row of candidates) {
        if (budget <= 0) break;
        const out = await enrichRow(supabase, 'legal_ref_candidates', row);
        budget--;
        if (out.ok) {
          results.processed_candidates++;
          if (out.risk === 'low') results.risk_low++;
          else if (out.risk === 'medium') results.risk_medium++;
          else if (out.risk === 'high') results.risk_high++;
        } else {
          results.errors++;
        }
      }
    }
  } catch {
    results.tables_missing.legal_ref_candidates = true;
  }

  // Best-effort log
  try {
    await supabase.from('business_log').insert({
      category: 'compliance',
      action: 'enrichment_cron',
      details: results,
    });
  } catch {
    // optional
  }

  return NextResponse.json({ ok: true, ...results });
}

// Mirror GET so the founder can trigger this from the admin dashboard
// without needing a cron-secret bearer header (the admin UI authenticates
// via the Supabase session cookie, see authorizeAdminOrCron).
export async function POST(request: NextRequest) {
  return GET(request);
}
