// src/app/api/cron/deal-price-refresh/route.ts
//
// Weekly. Fetches each advertiser's own pricing page and reads the
// prices off it.
//
// The distinction that matters
// ────────────────────────────
// The cron this replaces (`check-deal-prices`) asked an LLM "what does
// this deal currently cost?" and wrote the answer straight to
// `price_monthly`. That is recall, not research. The model has no
// access to today's pricing, cannot cite anything, and was self-
// reporting a confidence score that nothing gated on — so a low
// confidence guess landed in the database and rendered as a green
// "Verified this week" badge.
//
// This fetches the live page and extracts from the text that was
// actually served. The model is doing parsing, not remembering, and
// every price lands with a source URL, a fetch timestamp and a verbatim
// excerpt. That is the difference between a number we can defend and a
// number we cannot.
//
// Scope is deliberately small: only advertisers in `deal_price_sources`,
// which is seeded only with programmes we are actually joined to. There
// is no value in tracking prices for companies we earn nothing from and
// have no relationship with.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { authorizeAdminOrCron } from '@/lib/admin-auth';

export const maxDuration = 300;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface ExtractedPlan {
  name: string;
  /** Which company sells this plan. Only meaningful on a comparison
   *  page; on an advertiser page it is the advertiser. */
  planProvider?: string | null;
  monthlyPrice: number;
  dataAllowance?: string | null;
  speedMbps?: number | null;
  contractMonths?: number | null;
  promoPrice?: number | null;
  promoMonths?: number | null;
  sourceExcerpt: string;
}

/** Politeness gap between advertiser fetches. We are a guest on their site. */
const INTER_FETCH_DELAY_MS = 3_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Strip a fetched page down to something worth sending to the model.
 *
 * Pricing pages are mostly navigation, footers and legal text. Trimming
 * is not just cost: a smaller, denser input measurably reduces the
 * chance of the model picking a price out of a "compare us to" table or
 * a cookie banner.
 */
function condensePage(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&pound;/g, '£')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60_000);
}

async function extractPlans(
  pageText: string,
  provider: string,
  category: string,
  hint: string | null,
  sourceUrl: string,
): Promise<ExtractedPlan[]> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY!,
  });

  const msg = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 3000,
    messages: [
      {
        role: 'user',
        content:
          `Below is the text of ${provider}'s own ${category} pricing page, fetched just now from ${sourceUrl}.\n\n` +
          `Extract the plans it advertises. ${hint ?? ''}\n\n` +
          `Rules:\n` +
          `- Only report a plan if its price appears IN THE TEXT BELOW. Do not use anything you know about ${provider} from elsewhere. If the text does not state a price, omit the plan.\n` +
          `- monthlyPrice is the ongoing monthly price in GBP as a number.\n` +
          `- If a plan advertises a lower introductory price that later reverts, put the intro price in promoPrice and its length in promoMonths, and put the ONGOING price in monthlyPrice.\n` +
          `- planProvider is the company that sells the plan, exactly as the page names it.\n` +
          `- sourceExcerpt must be a short verbatim quote from the text below showing that price. This is checked.\n` +
          `- Return ONLY a JSON array. No prose, no code fences.\n\n` +
          `Shape: [{"name":"","planProvider":"","monthlyPrice":0,"dataAllowance":null,"speedMbps":null,"contractMonths":null,"promoPrice":null,"promoMonths":null,"sourceExcerpt":""}]\n\n` +
          `PAGE TEXT:\n${pageText}`,
      },
    ],
  });

  const raw = msg.content[0]?.type === 'text' ? msg.content[0].text : '';
  const match = raw.match(/\[[\s\S]*\]/);
  if (!match) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    console.warn(`[deal-price-refresh] ${provider}: model returned unparseable JSON`);
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  // Verify each excerpt actually appears in the page we fetched.
  //
  // This is the guard that makes the whole thing trustworthy. If the
  // model has produced a price from memory rather than from the page,
  // its excerpt will not be found in the text, and the plan is dropped.
  // Without this check, "extracted from the live page" would be a claim
  // rather than a fact.
  const haystack = pageText.toLowerCase();
  const plans: ExtractedPlan[] = [];
  for (const p of parsed as ExtractedPlan[]) {
    const price = Number(p?.monthlyPrice);
    if (!Number.isFinite(price) || price <= 0 || price > 500) continue;
    const excerpt = String(p?.sourceExcerpt ?? '').trim();
    if (excerpt.length < 3) continue;
    if (!haystack.includes(excerpt.toLowerCase().slice(0, 40))) {
      console.warn(
        `[deal-price-refresh] ${provider}: dropping "${p.name}" — excerpt not found on the page (likely recalled, not read)`,
      );
      continue;
    }
    plans.push({
      name: String(p.name ?? '').slice(0, 120),
      planProvider: p.planProvider ? String(p.planProvider).slice(0, 80) : null,
      monthlyPrice: Math.round(price * 100) / 100,
      dataAllowance: p.dataAllowance ?? null,
      speedMbps: p.speedMbps == null ? null : Number(p.speedMbps) || null,
      contractMonths: p.contractMonths == null ? null : Number(p.contractMonths) || null,
      promoPrice: p.promoPrice == null ? null : Number(p.promoPrice) || null,
      promoMonths: p.promoMonths == null ? null : Number(p.promoMonths) || null,
      sourceExcerpt: excerpt.slice(0, 300),
    });
  }
  return plans;
}

/** Loose token comparison: "Community Fibre" vs "community fibre 150Mb". */
function providerMatches(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const A = norm(a);
  const B = norm(b);
  if (!A || !B) return false;
  if (A === B) return true;
  // First significant word must appear in the other, both ways, so
  // "Virgin Media" matches "Virgin Media Broadband" but "EE" does not
  // match "Three".
  const headA = A.split(' ')[0];
  const headB = B.split(' ')[0];
  if (headA.length < 2 || headB.length < 2) return false;
  return B.includes(headA) || A.includes(headB);
}

/**
 * Which extracted plan, if any, is genuinely this deal's plan.
 *
 * Returns null rather than guessing. See the call site for why the
 * previous cheapest-plan fallback had to go.
 */
function matchPlanToDeal(
  plans: ExtractedPlan[],
  deal: { plan_name?: string | null; provider?: string | null },
  src: { source_kind?: string | null; provider: string },
): ExtractedPlan | null {
  const isComparison = src.source_kind === 'comparison';

  // On a comparison page, the plan's own provider must match the deal's.
  // Without this, every provider on the page inherits one price.
  const candidates = isComparison
    ? plans.filter((p) => providerMatches(p.planProvider, deal.provider))
    : plans;

  if (candidates.length === 0) return null;

  // On an advertiser page, still require the deal to name a plan we can
  // recognise. "Their cheapest" is not the same product as the one this
  // catalogue row describes.
  const planName = (deal.plan_name ?? '').toLowerCase().trim();
  if (planName.length >= 4) {
    const named = candidates.find((p) => {
      const n = p.name.toLowerCase();
      return n.includes(planName.slice(0, 12)) || planName.includes(n.slice(0, 12));
    });
    if (named) return named;
  }

  // A comparison page that named this provider exactly once is
  // unambiguous even without a plan-name match.
  if (isComparison && candidates.length === 1) return candidates[0];

  return null;
}

export async function GET(request: NextRequest) {
  // Admin cookie OR the cron bearer, same as the programme sync. A
  // weekly job is a long time to wait to find out a pricing page has
  // moved, so the founder can trigger it and read the result.
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  const supabase = getAdmin();
  const summary = {
    sourcesChecked: 0,
    sourcesFailed: 0,
    plansExtracted: 0,
    dealsUpdated: 0,
    /** Deals left untouched because no extracted plan confidently
     *  belonged to them. Expected to be non-zero; that is the guard
     *  working, not a failure. */
    dealsUnmatched: 0,
    skippedNotJoined: 0,
  };

  const { data: sources } = await supabase
    .from('deal_price_sources')
    .select('*')
    .eq('is_active', true)
    .order('last_fetch_at', { ascending: true, nullsFirst: true });

  // Only advertisers we are actually joined to. A price for a company
  // we earn nothing from is effort spent making a competitor look good.
  const { data: joined } = await supabase
    .from('affiliate_programmes')
    .select('awin_advertiser_id')
    .eq('is_joined', true);
  const joinedIds = new Set((joined ?? []).map((p) => p.awin_advertiser_id));

  for (const src of sources ?? []) {
    if (joinedIds.size > 0 && !joinedIds.has(src.awin_advertiser_id)) {
      summary.skippedNotJoined++;
      continue;
    }

    if (summary.sourcesChecked > 0) await sleep(INTER_FETCH_DELAY_MS);
    summary.sourcesChecked++;

    const now = new Date().toISOString();
    try {
      const res = await fetch(src.source_url, {
        headers: {
          // Identify ourselves honestly. We are reading a public
          // pricing page of a partner we have a commercial
          // relationship with, and they should be able to see that.
          'User-Agent':
            'PaybackerPriceBot/1.0 (+https://paybacker.co.uk; affiliate partner price check)',
          Accept: 'text/html,application/xhtml+xml',
        },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);

      const pageText = condensePage(await res.text());
      if (pageText.length < 500) throw new Error('page returned too little text to parse');

      const plans = await extractPlans(
        pageText,
        src.provider,
        src.category,
        src.extraction_hint,
        src.source_url,
      );
      summary.plansExtracted += plans.length;

      if (plans.length === 0) throw new Error('no plans could be extracted from the page');

      await supabase.from('deal_price_snapshots').insert({
        awin_advertiser_id: src.awin_advertiser_id,
        provider: src.provider,
        category: src.category,
        source_url: src.source_url,
        plans,
        plan_count: plans.length,
        fetched_at: now,
      });

      // Update the live catalogue rows for this advertiser. Matched on
      // plan name where we can, otherwise the cheapest extracted plan
      // becomes the headline price for that provider+category.
      const { data: deals } = await supabase
        .from('affiliate_deals')
        .select('id, plan_name, price_monthly, provider')
        .eq('awin_advertiser_id', src.awin_advertiser_id)
        .eq('is_active', true);

      for (const deal of deals ?? []) {
        const match = matchPlanToDeal(plans, deal, src);

        // No confident match means no write. There is deliberately NO
        // cheapest-plan fallback here any more.
        //
        // The first version of this fell back to "the cheapest extracted
        // plan becomes the headline price". On an advertiser page that is
        // merely sloppy. On Broadband Genie, which lists dozens of
        // providers, it wrote one listing price onto every deal sharing
        // that programme id: BT, Sky, EE, Plusnet, Hyperoptic, Community
        // Fibre, NOW and Vodafone all showed £30.99, each citing the same
        // Broadband Genie excerpt, all stamped 'fetched'. Paul spotted it
        // within minutes of the first run.
        //
        // A price attached to the wrong company is worse than no price:
        // it is wrong AND it carries our provenance metadata saying we
        // checked. Leaving the old value alone is the safe failure.
        if (!match) {
          summary.dealsUnmatched++;
          continue;
        }

        await supabase
          .from('affiliate_deals')
          .update({
            previous_price_monthly: deal.price_monthly,
            price_monthly: match.monthlyPrice,
            price_promotional: match.promoPrice,
            speed_mbps: match.speedMbps ?? undefined,
            data_allowance: match.dataAllowance ?? undefined,
            price_source_url: src.source_url,
            price_fetched_at: now,
            price_source_excerpt: match.sourceExcerpt,
            price_provenance: 'fetched',
            last_verified_at: now,
            updated_at: now,
          })
          .eq('id', deal.id);
        summary.dealsUpdated++;
      }

      await supabase
        .from('deal_price_sources')
        .update({
          last_fetch_at: now,
          last_fetch_status: 'ok',
          last_fetch_error: null,
          consecutive_failures: 0,
          updated_at: now,
        })
        .eq('id', src.id);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'unknown';
      summary.sourcesFailed++;
      console.error(`[deal-price-refresh] ${src.provider} failed: ${msg}`);

      // A failure leaves the existing price alone. A stale price we know
      // is stale is better than none, and far better than a guess. The
      // failure counter is what surfaces a permanently moved page.
      await supabase
        .from('deal_price_sources')
        .update({
          last_fetch_at: now,
          last_fetch_status: 'failed',
          last_fetch_error: msg.slice(0, 500),
          consecutive_failures: (src.consecutive_failures ?? 0) + 1,
          updated_at: now,
        })
        .eq('id', src.id);
    }
  }

  console.log(
    `[deal-price-refresh] sources=${summary.sourcesChecked} failed=${summary.sourcesFailed} ` +
      `plans=${summary.plansExtracted} deals_updated=${summary.dealsUpdated} skipped_not_joined=${summary.skippedNotJoined}`,
  );

  return NextResponse.json({ ok: true, ...summary });
}
