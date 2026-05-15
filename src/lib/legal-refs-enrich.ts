/**
 * Per-row enrichment for legal_ref_corrections / legal_ref_candidates.
 *
 * Extracted from `src/app/api/cron/enrich-compliance-pending/route.ts` so
 * that endpoints which insert pending rows (e.g. recover-url-dead,
 * amendments-sweep) can fire enrichment synchronously instead of waiting
 * for the daily 04:00 UTC cron.
 *
 * Why this matters for founder UX:
 *   PendingCorrectionsSection hides un-enriched rows by default (only the
 *   enriched MEDIUM/HIGH items are surfaced as "needs your eye"). Without
 *   immediate enrichment, freshly-inserted corrections sit in limbo until
 *   the next cron tick, which produces the misleading "No items currently
 *   need your eye" empty state on the admin dashboard.
 *
 * Cost guard: each call performs at most one HTTP fetch (+ optional one
 * Perplexity sonar request). Fire-and-forget callers must `.catch(() => {})`
 * so a failed enrichment never breaks the parent insert flow.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

const FETCH_TIMEOUT_MS = 5000;
const MAX_BODY_BYTES = 1_000_000; // 1MB

export type RiskScore = 'low' | 'medium' | 'high';

export interface EnrichmentData {
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

export type EnrichmentTable = 'legal_ref_corrections' | 'legal_ref_candidates';

interface FetchResult {
  status: number | null;
  body: string;
  finalUrl: string | null;
  redirectChain: string[];
  error?: string;
}

async function safeFetch(url: string): Promise<FetchResult> {
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
  const stripped = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (url.includes('legislation.gov.uk')) {
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
    const yearA = beforeValue.match(/\b(19|20)\d{2}\b/);
    const yearB = afterValue.match(/\b(19|20)\d{2}\b/);
    if (yearA && yearB && yearA[0] !== yearB[0]) {
      reasons.push(`year edition changed: ${yearA[0]} → ${yearB[0]}`);
      promote('medium');
    }
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

/**
 * Run enrichment on a single row from `legal_ref_corrections` or
 * `legal_ref_candidates` and persist the result to `enrichment_data` +
 * `enriched_at`.
 *
 * Used by:
 *   - `/api/cron/enrich-compliance-pending` (loops over pending rows)
 *   - `/api/admin/legal-refs/recover-url-dead` (fire-and-forget on insert
 *     so newly-queued items appear in PendingCorrectionsSection without
 *     waiting for the next cron run)
 */
export async function enrichRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  table: EnrichmentTable,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  row: any,
): Promise<{ ok: boolean; risk?: RiskScore; error?: string }> {
  const sourceUrl: string | null =
    row.source_url ||
    row.proposed_url ||
    row.proposed_source_url ||
    row.after_url ||
    row.url ||
    null;

  let fetched: FetchResult = {
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

  const urlFrom: string | null = row.before_url || row.before_source_url || row.canonical_url || null;
  const urlTo: string | null = sourceUrl;

  const { score, reasons } = scoreRisk({
    urlFrom,
    urlTo,
    finalUrl: fetched.finalUrl,
    titleFrom,
    titleTo,
    beforeValue: row.before_value || row.before_law_name || null,
    afterValue: row.after_value || row.proposed_law_name || null,
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

/**
 * Convenience wrapper: enrich a single correction by id. Loads the row
 * fresh from the DB then calls `enrichRow`. Designed for fire-and-forget
 * use from insert-flow callers — wrap in `.catch(() => {})` at the call
 * site so a transient enrichment failure never breaks the parent insert.
 */
export async function enrichSingleCorrection(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any, any, any>,
  correctionId: string,
): Promise<{ ok: boolean; risk?: RiskScore; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('legal_ref_corrections')
      .select('*')
      .eq('id', correctionId)
      .maybeSingle();
    if (error || !data) {
      return { ok: false, error: error?.message ?? 'correction not found' };
    }
    return await enrichRow(supabase, 'legal_ref_corrections', data);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
