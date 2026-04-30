/**
 * POST /api/admin/legal-refs/recover-url-dead
 *
 * Founder-gated endpoint that lifts the `scripts/recover-url-dead.ts`
 * core logic into the admin dashboard. Probes every legal_references row
 * with `verification_status='url_dead'` using both the default fetcher UA
 * and a real-browser UA (some publishers — ofcom.org.uk, orr.gov.uk —
 * 403 default fetchers but 200 a normal browser).
 *
 * Body: { queue?: boolean }
 *   - queue=false (default): probe-only, returns counts.
 *   - queue=true: also INSERT pending rows in legal_ref_corrections so
 *     a founder can approve via the existing review queue.
 *
 * Returns: { probed, still_dead, now_resolves, redirected_to_authority,
 *            queued, errors }
 *
 * No DB mutation of legal_references at any point — corrections only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { checkUkLegalAuthority } from '@/lib/legal-refs-authority';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { logPerplexityCall } from '@/lib/cost-ledger';

const PERPLEXITY_MODEL = 'sonar-pro';
// sonar-pro flat rate ≈ $0.005 per request. USD→GBP ≈ 0.79.
const PERPLEXITY_COST_PER_CALL_GBP = 0.005 * 0.79;

interface PerplexityRecovery {
  current_url: string | null;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
}

function publisherDomain(url: string): string | null {
  try {
    const u = new URL(url);
    const parts = u.hostname.toLowerCase().replace(/^www\./, '').split('.');
    if (parts.length >= 2) return parts.slice(-2).join('.');
    return u.hostname.toLowerCase();
  } catch {
    return null;
  }
}

async function askPerplexityForRecovery(args: {
  oldUrl: string;
  lawName: string;
  summary: string;
  publisherDomain: string;
}): Promise<PerplexityRecovery | null> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    console.warn('[recover-url-dead] PERPLEXITY_API_KEY not set');
    return null;
  }
  const summaryShort = (args.summary || '').slice(0, 200);
  const userPrompt = [
    `The UK regulator page at ${args.oldUrl} returned 403/404.`,
    `The page is titled '${args.lawName}' and covers '${summaryShort}'.`,
    `What is the current canonical URL on the same regulator's website?`,
    `Return JSON: {current_url: string|null, confidence: 'high'|'medium'|'low', reasoning: string}.`,
    `Only return URLs on ${args.publisherDomain} (e.g. ofcom.org.uk for an Ofcom ref).`,
    `If no current URL exists or the page has been removed entirely, return current_url: null.`,
  ].join(' ');
  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: PERPLEXITY_MODEL,
        messages: [
          {
            role: 'system',
            content:
              'You are a UK legal-citation URL-recovery assistant. Return STRICT JSON only — no markdown, no commentary. ' +
              'Only return URLs hosted on the SAME publisher domain provided in the prompt. If no current canonical URL exists on that domain, return current_url: null.',
          },
          { role: 'user', content: userPrompt },
        ],
        max_tokens: 400,
        temperature: 0.1,
      }),
    });
    if (!res.ok) {
      console.error(`[recover-url-dead] Perplexity ${res.status}`);
      return null;
    }
    const data = await res.json();
    const content: string = data?.choices?.[0]?.message?.content || '';
    const cleaned = content.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const conf = parsed.confidence === 'high' || parsed.confidence === 'medium' || parsed.confidence === 'low'
      ? parsed.confidence
      : 'low';
    return {
      current_url: typeof parsed.current_url === 'string' && parsed.current_url ? parsed.current_url : null,
      confidence: conf,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
    };
  } catch (err) {
    console.error('[recover-url-dead] Perplexity error:', err instanceof Error ? err.message : err);
    return null;
  }
}

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function getAdmin() {
  return createAdminClient(
    (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim(),
    (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim(),
  );
}

async function probe(url: string, ua: string | null): Promise<{
  status: number | 'fetch_error';
  final_url: string | null;
}> {
  const headers: Record<string, string> = ua ? { 'User-Agent': ua } : {};
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return { status: res.status, final_url: res.url };
  } catch {
    return { status: 'fetch_error', final_url: null };
  }
}

interface Row {
  id: string;
  law_name: string;
  source_url: string;
  category: string;
  verification_status: string;
  summary: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason || 'Unauthorized' }, { status: auth.status });
  }

  let body: { queue?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const queue = body.queue === true;

  const admin = getAdmin();
  const { data, error } = await admin
    .from('legal_references')
    .select('id, law_name, source_url, category, verification_status, summary')
    .eq('verification_status', 'url_dead')
    .order('category', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  const rows = (data ?? []) as Row[];

  const summary = {
    probed: 0,
    still_dead: 0,
    now_resolves: 0,
    redirected_to_authority: 0,
    queued: 0,
    perplexity_calls: 0,
    perplexity_recovered: 0,
    perplexity_cost_gbp: 0,
    errors: [] as string[],
  };

  for (const row of rows) {
    summary.probed++;
    // eslint-disable-next-line no-await-in-loop
    const def = await probe(row.source_url, null);
    // eslint-disable-next-line no-await-in-loop
    const ua = await probe(row.source_url, BROWSER_UA);

    let category: 'still_dead' | 'now_resolves' | 'redirected_to_authority' = 'still_dead';
    let finalUrl: string | null = null;

    const ok2xx = typeof ua.status === 'number' && ua.status >= 200 && ua.status < 300;
    const ok3xx = typeof ua.status === 'number' && ua.status >= 300 && ua.status < 400 && ua.final_url;

    if (ok2xx || ok3xx) {
      finalUrl = ua.final_url ?? row.source_url;
      const redirected = !!finalUrl && finalUrl !== row.source_url;
      if (redirected) {
        const auth = checkUkLegalAuthority(finalUrl);
        if (auth.reason === 'authority' || auth.reason === 'secondary') {
          category = 'redirected_to_authority';
        } else {
          category = 'now_resolves';
        }
      } else {
        category = 'now_resolves';
      }
    }

    if (category === 'still_dead') summary.still_dead++;
    else if (category === 'now_resolves') summary.now_resolves++;
    else summary.redirected_to_authority++;

    if (queue && category !== 'still_dead' && finalUrl) {
      const proposed_source_url = finalUrl !== row.source_url ? finalUrl : null;
      const reasoning =
        'Server-side probe found a working URL after the original returned ' +
        `4xx/5xx (default UA=${def.status}, browser UA=${ua.status}). ` +
        'Verify the destination still cites the same law before approving.';

      // eslint-disable-next-line no-await-in-loop
      const { error: insErr } = await admin.from('legal_ref_corrections').insert({
        ref_id: row.id,
        proposer: 'url-dead-recovery-2026-04-30',
        before_law_name: row.law_name,
        before_source_url: row.source_url,
        before_status: 'url_dead',
        proposed_law_name: null,
        proposed_source_url,
        proposed_status: null,
        reasoning,
        confidence: 'medium',
        status: 'pending',
      });
      if (insErr) {
        summary.errors.push(`${row.id}: ${insErr.message}`);
      } else {
        summary.queued++;
      }
    } else if (queue && category === 'still_dead') {
      // Perplexity fallback for Cloudflare-blocked publishers (Ofcom,
      // Ofgem, ORR) where both UAs 403 — server probe cannot find a
      // redirect even though the page may have moved on the same domain.
      const pubDomain = publisherDomain(row.source_url);
      if (pubDomain) {
        // eslint-disable-next-line no-await-in-loop
        const recovery = await askPerplexityForRecovery({
          oldUrl: row.source_url,
          lawName: row.law_name,
          summary: row.summary || '',
          publisherDomain: pubDomain,
        });
        summary.perplexity_calls++;
        // Attribute spend to cost ledger (fire-and-forget).
        logPerplexityCall({
          model: PERPLEXITY_MODEL,
          endpoint: '/api/admin/legal-refs/recover-url-dead',
          userId: auth.userId ?? null,
          metadata: { legal_reference_id: row.id, mode: 'url-recovery' },
        });
        summary.perplexity_cost_gbp = +(
          summary.perplexity_calls * PERPLEXITY_COST_PER_CALL_GBP
        ).toFixed(4);

        const proposedUrl = recovery?.current_url ?? null;
        const sameAuthority =
          proposedUrl && checkUkLegalAuthority(proposedUrl).ok;
        const samePublisher =
          proposedUrl && publisherDomain(proposedUrl) === pubDomain;
        const confOk =
          recovery?.confidence === 'high' || recovery?.confidence === 'medium';

        if (recovery && proposedUrl && sameAuthority && samePublisher && confOk) {
          const reasoning =
            `Original URL 403/404 (default UA=${def.status}, browser UA=${ua.status}). ` +
            `Perplexity sonar-pro proposed canonical URL on same publisher domain ` +
            `(${pubDomain}) with confidence=${recovery.confidence}. Reasoning: ${recovery.reasoning}`;
          // eslint-disable-next-line no-await-in-loop
          const { error: insErr } = await admin.from('legal_ref_corrections').insert({
            ref_id: row.id,
            proposer: 'url-recovery-perplexity-2026-04-30',
            before_law_name: row.law_name,
            before_source_url: row.source_url,
            before_status: 'url_dead',
            proposed_law_name: null,
            proposed_source_url: proposedUrl,
            proposed_status: null,
            reasoning,
            confidence: recovery.confidence,
            status: 'pending',
          });
          if (insErr) {
            summary.errors.push(`${row.id}: ${insErr.message}`);
          } else {
            summary.queued++;
            summary.perplexity_recovered++;
          }
        } else {
          // Null / low confidence / off-domain — leave url_dead, log for
          // founder so manual research is visible in business_log.
          // eslint-disable-next-line no-await-in-loop
          await admin.from('business_log').insert({
            category: 'compliance',
            title: `url_dead — manual research needed: ${row.law_name}`,
            content:
              `Ref ${row.id} (${row.law_name}) source ${row.source_url} ` +
              `still 4xx after browser-UA probe. Perplexity recovery returned ` +
              `${proposedUrl ? `URL ${proposedUrl}` : 'no URL'} ` +
              `with confidence=${recovery?.confidence ?? 'n/a'}` +
              (recovery?.reasoning ? `. Reasoning: ${recovery.reasoning}` : '.'),
            created_by: 'system',
          });
        }
      }
    }

    // Polite throttle.
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 250));
  }

  return NextResponse.json({ ok: true, ...summary });
}
