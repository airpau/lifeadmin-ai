// OBSERVE ONLY. This cron must never write a price a user will see.
//
// It asks Perplexity what a plan costs. On 23 Aug 2026 that produced,
// live on the deals page, Lebara 100GB at "from £4.49/mo" (really £20),
// 50GB at £9 (really £15) and 30GB 12-month at "from £2.49". The
// headline figures were plausible enough to pass review; the
// promotional ones were invented outright. Every row also carried
// last_verified_at, so the product asserted it had checked them.
//
// Prices a user sees now come only from `deal-price-refresh`, which
// fetches the advertiser's own page and verifies a verbatim excerpt
// against it. This cron keeps its value as a CHANGE DETECTOR: an LLM
// noticing a price has moved is a fine reason to go and fetch the page.
// It is not a reason to publish the number it guessed.
//
// If you are tempted to restore the writes because the fetch pipeline
// does not cover a provider yet, don't. No price beats a wrong one.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300; // 5 minutes to cover ~40 deals at ~5s each

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface PriceLookupResult {
  price_monthly: number | null;
  promo_price: number | null;
  confidence: 'high' | 'medium' | 'low';
  notes: string;
}

/**
 * Ask Perplexity for the current headline monthly price for a single plan.
 * Returns null if the API call fails or the response can't be parsed.
 */
async function lookupCurrentPrice(deal: {
  provider: string;
  plan_name: string | null;
  destination_url: string | null;
  category: string;
}): Promise<PriceLookupResult | null> {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  if (!perplexityKey) return null;

  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const planLabel = deal.plan_name ? `their plan "${deal.plan_name}"` : 'their current headline plan';
  const urlContext = deal.destination_url ? ` Check the live page at ${deal.destination_url}.` : '';
  const prompt = `As of today (${today}), what is the current advertised monthly price in GBP (£) for UK provider ${deal.provider} for ${planLabel} in the ${deal.category} category?${urlContext} If there's a promotional/introductory price, also note the promo price. Return ONLY a JSON object with these exact keys: price_monthly (number, the headline or standard monthly price in £), promo_price (number or null, any introductory discounted price in £), confidence ("high" if you found the exact price on the provider's official site, "medium" if from a reputable comparison site, "low" if inferred), notes (short string about any caveats, e.g. "24-month contract", "first 3 months only"). No other text.`;

  try {
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) return null;
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]);
    const price = parsed.price_monthly != null ? parseFloat(String(parsed.price_monthly)) : null;
    const promo = parsed.promo_price != null && parsed.promo_price !== '' ? parseFloat(String(parsed.promo_price)) : null;
    if (price == null || isNaN(price)) return null;

    return {
      price_monthly: price,
      promo_price: promo != null && !isNaN(promo) ? promo : null,
      confidence: ['high', 'medium', 'low'].includes(parsed.confidence) ? parsed.confidence : 'low',
      notes: String(parsed.notes || '').slice(0, 500),
    };
  } catch {
    return null;
  }
}

/**
 * Daily deal price checker.
 * Loops over every active, comparison-enabled deal in affiliate_deals,
 * asks Perplexity for the current headline price, and updates the row
 * if the price has moved. Logs every check to deal_price_checks and
 * significant changes (>£1/month diff) to business_log.
 *
 * Schedule: daily at 6am (see vercel.json).
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // Fetch every active comparison-enabled deal
  const { data: deals, error } = await supabase
    .from('affiliate_deals')
    .select('id, provider, plan_name, category, price_monthly, price_promotional, destination_url')
    .eq('is_active', true)
    .eq('comparison_enabled', true);

  if (error || !deals) {
    return NextResponse.json({ error: 'Failed to load deals', details: error?.message }, { status: 500 });
  }

  const summary = {
    scanned: 0,
    updated: 0,
    unchanged: 0,
    skipped: 0,
    /** Answers the model itself flagged as unreliable. Recorded for
     *  review, never written to a live price. */
    lowConfidenceSkipped: 0,
    failed: 0,
    changes: [] as any[],
  };

  for (const deal of deals) {
    summary.scanned++;

    // Skip deals without a destination URL — nothing to verify against
    if (!deal.destination_url) {
      summary.skipped++;
      await supabase.from('deal_price_checks').insert({
        provider: deal.provider,
        check_status: 'skipped',
        plans_found: null,
        changes_detected: null,
        error_message: 'No destination_url',
      });
      continue;
    }

    const lookup = await lookupCurrentPrice({
      provider: deal.provider,
      plan_name: deal.plan_name,
      destination_url: deal.destination_url,
      category: deal.category,
    });

    if (!lookup || lookup.price_monthly == null) {
      summary.failed++;
      await supabase
        .from('affiliate_deals')
        .update({
          price_scan_status: 'failed',
          updated_at: new Date().toISOString(),
        })
        .eq('id', deal.id);
      await supabase.from('deal_price_checks').insert({
        provider: deal.provider,
        check_status: 'error',
        plans_found: null,
        changes_detected: null,
        error_message: 'Perplexity lookup failed or returned no price',
      });
      continue;
    }

    const storedPrice = deal.price_monthly != null ? parseFloat(String(deal.price_monthly)) : null;
    const storedPromo = deal.price_promotional != null ? parseFloat(String(deal.price_promotional)) : null;
    const newPrice = lookup.price_monthly;
    const newPromo = lookup.promo_price;

    const priceChanged = storedPrice == null || Math.abs(newPrice - storedPrice) >= 0.5;
    const promoChanged = (storedPromo ?? null) !== (newPromo ?? null)
      && (storedPromo == null || newPromo == null || Math.abs((newPromo ?? 0) - (storedPromo ?? 0)) >= 0.5);

    const now = new Date().toISOString();

    // ── Low-confidence answers do not overwrite a live price ────────
    //
    // The model is asked to self-report confidence, and until
    // 2026-08-21 that value was logged and then ignored: a "low" answer
    // overwrote price_monthly and stamped last_verified_at exactly like
    // a confident one. Since last_verified_at drove the green
    // "Verified" badge, the least reliable guesses were the ones most
    // likely to appear verified to the user.
    //
    // Now a low-confidence answer is recorded for review and changes
    // nothing the user sees. A stale price we know is stale beats a
    // fresh one we have no reason to trust.
    if (lookup.confidence === 'low') {
      summary.lowConfidenceSkipped++;
      console.warn(
        `[check-deal-prices] low confidence for ${deal.provider} ${deal.plan_name} — not updating (model said £${newPrice})`,
      );
      await supabase.from('deal_price_checks').insert({
        provider: deal.provider,
        check_status: 'low_confidence_skipped',
        plans_found: [{ deal_id: deal.id, price: newPrice, notes: lookup.notes }],
        checked_at: now,
      });
      continue;
    }

    if (priceChanged || promoChanged) {
      summary.updated++;
      const change = {
        deal_id: deal.id,
        provider: deal.provider,
        plan: deal.plan_name,
        old_price: storedPrice,
        new_price: newPrice,
        old_promo: storedPromo,
        new_promo: newPromo,
        confidence: lookup.confidence,
        notes: lookup.notes,
      };
      summary.changes.push(change);

      // NOT written to affiliate_deals. See the note at the top of this
      // file: this cron observes, it does not publish.
      await supabase
        .from('affiliate_deals')
        .update({ price_scan_status: 'change_proposed', updated_at: now })
        .eq('id', deal.id);

      await supabase.from('deal_price_checks').insert({
        provider: deal.provider,
        check_status: 'changes_detected',
        plans_found: [{ plan: deal.plan_name, price: newPrice, promo: newPromo }],
        changes_detected: [change],
        error_message: null,
      });

      // Log significant changes (>£1 move) so the founder can spot it in business_log
      if (storedPrice == null || Math.abs(newPrice - (storedPrice || 0)) >= 1) {
        await supabase.from('business_log').insert({
          category: 'deals',
          action: 'price_change_detected',
          details: change,
        });
      }
    } else {
      summary.unchanged++;
      // No last_verified_at. An LLM agreeing with a stored number is
      // not verification, and stamping it here is what put "Verified"
      // badges on prices nobody had checked.
      await supabase
        .from('affiliate_deals')
        .update({ price_scan_status: 'unchanged', updated_at: now })
        .eq('id', deal.id);

      await supabase.from('deal_price_checks').insert({
        provider: deal.provider,
        check_status: 'verified',
        plans_found: [{ plan: deal.plan_name, price: newPrice, promo: newPromo }],
        changes_detected: null,
        error_message: null,
      });
    }
  }

  return NextResponse.json({ ok: true, ...summary });
}

// Manual override endpoint — unchanged behaviour, lets admins push price fixes
export async function POST(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const body = await request.json();

  if (body.manual_prices && Array.isArray(body.manual_prices)) {
    for (const update of body.manual_prices) {
      if (update.id && update.price_monthly) {
        await supabase
          .from('affiliate_deals')
          .update({
            price_monthly: update.price_monthly,
            price_promotional: update.price_promotional || null,
            last_verified_at: new Date().toISOString(),
            price_changed_at: new Date().toISOString(),
            price_scan_source: 'manual',
            updated_at: new Date().toISOString(),
          })
          .eq('id', update.id);
      }
    }
    return NextResponse.json({ ok: true, updated: body.manual_prices.length });
  }

  return NextResponse.json({ error: 'Provide manual_prices array' }, { status: 400 });
}
