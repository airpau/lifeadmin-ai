import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Daily deal price checker.
 * Fetches provider pages, extracts prices, compares to stored data.
 * Also accepts manual_prices body for admin overrides.
 *
 * Schedule: Daily at 6am
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const results: any[] = [];

  // Check TalkTalk
  try {
    const ttResult = await checkTalkTalk(supabase);
    results.push(ttResult);
  } catch (err: any) {
    results.push({ provider: 'TalkTalk', status: 'error', error: err.message });
  }

  // Check Lebara
  try {
    const lbResult = await checkLebara(supabase);
    results.push(lbResult);
  } catch (err: any) {
    results.push({ provider: 'Lebara', status: 'error', error: err.message });
  }

  return NextResponse.json({ ok: true, results });
}

// Manual override endpoint
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
            updated_at: new Date().toISOString(),
          })
          .eq('id', update.id);
      }
    }
    return NextResponse.json({ ok: true, updated: body.manual_prices.length });
  }

  return NextResponse.json({ error: 'Provide manual_prices array' }, { status: 400 });
}

async function checkTalkTalk(supabase: any) {
  const { data: storedDeals } = await supabase
    .from('affiliate_deals')
    .select('*')
    .eq('provider', 'TalkTalk')
    .eq('is_active', true);

  let fetchError = null;
  let pricesFound: any[] = [];
  let changes: any[] = [];

  try {
    const res = await fetch('https://www.talktalk.co.uk/broadband/compare-deals', {
      headers: { 'User-Agent': 'Paybacker-PriceChecker/1.0 (hello@paybacker.co.uk)' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Extract prices using patterns like £24, £30, £36
    // TalkTalk typically shows prices in their plan cards
    const priceMatches = html.match(/£(\d+(?:\.\d{2})?)\s*(?:\/mo|per month|a month)/gi);
    if (priceMatches) {
      pricesFound = [...new Set(priceMatches.map(m => {
        const num = m.match(/£(\d+(?:\.\d{2})?)/);
        return num ? parseFloat(num[1]) : null;
      }).filter(Boolean))];
    }

    // Compare against stored — if any stored price doesn't appear in found prices, flag it
    if (pricesFound.length > 0) {
      for (const deal of storedDeals || []) {
        const storedPrice = parseFloat(deal.price_monthly);
        if (!pricesFound.includes(storedPrice)) {
          changes.push({
            plan: deal.plan_name,
            old_price: storedPrice,
            note: `Price £${storedPrice} not found on page. Found: ${pricesFound.map(p => `£${p}`).join(', ')}`,
          });
        }
      }
    }
  } catch (err: any) {
    fetchError = err.message;
  }

  // Log the check
  await supabase.from('deal_price_checks').insert({
    provider: 'TalkTalk',
    check_status: fetchError ? 'error' : changes.length > 0 ? 'changes_detected' : 'verified',
    plans_found: pricesFound,
    changes_detected: changes.length > 0 ? changes : null,
    error_message: fetchError,
  });

  // If no error and no changes, mark as verified
  if (!fetchError && changes.length === 0) {
    await supabase
      .from('affiliate_deals')
      .update({ last_verified_at: new Date().toISOString() })
      .eq('provider', 'TalkTalk')
      .eq('is_active', true);
  }

  // If changes detected, log to business_log for admin alert
  if (changes.length > 0) {
    await supabase.from('business_log').insert({
      category: 'deals',
      action: 'price_change_detected',
      details: { provider: 'TalkTalk', changes },
    });
  }

  return {
    provider: 'TalkTalk',
    status: fetchError ? 'error' : changes.length > 0 ? 'changes_detected' : 'verified',
    prices_found: pricesFound.length,
    changes: changes.length,
    error: fetchError,
  };
}

async function checkLebara(supabase: any) {
  const { data: storedDeals } = await supabase
    .from('affiliate_deals')
    .select('*')
    .eq('provider', 'Lebara')
    .eq('is_active', true);

  let fetchError = null;
  let pricesFound: any[] = [];
  let changes: any[] = [];

  try {
    const res = await fetch('https://www.lebara.co.uk/en/best-sim-only-deals.html', {
      headers: { 'User-Agent': 'Paybacker-PriceChecker/1.0 (hello@paybacker.co.uk)' },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // Extract prices — Lebara uses patterns like £5, £10, £2.50
    const priceMatches = html.match(/£(\d+(?:\.\d{2})?)/g);
    if (priceMatches) {
      pricesFound = [...new Set(priceMatches.map(m => {
        const num = m.match(/£(\d+(?:\.\d{2})?)/);
        return num ? parseFloat(num[1]) : null;
      }).filter(Boolean))].sort((a: any, b: any) => a - b);
    }

    // Compare stored prices against found
    if (pricesFound.length > 0) {
      for (const deal of storedDeals || []) {
        const storedPrice = parseFloat(deal.price_monthly);
        const promoPrice = deal.price_promotional ? parseFloat(deal.price_promotional) : null;
        const anyMatch = pricesFound.includes(storedPrice) || (promoPrice && pricesFound.includes(promoPrice));
        if (!anyMatch) {
          changes.push({
            plan: deal.plan_name,
            old_price: storedPrice,
            old_promo: promoPrice,
            note: `Neither £${storedPrice} nor promo £${promoPrice} found on page`,
          });
        }
      }
    }
  } catch (err: any) {
    fetchError = err.message;
  }

  await supabase.from('deal_price_checks').insert({
    provider: 'Lebara',
    check_status: fetchError ? 'error' : changes.length > 0 ? 'changes_detected' : 'verified',
    plans_found: pricesFound,
    changes_detected: changes.length > 0 ? changes : null,
    error_message: fetchError,
  });

  if (!fetchError && changes.length === 0) {
    await supabase
      .from('affiliate_deals')
      .update({ last_verified_at: new Date().toISOString() })
      .eq('provider', 'Lebara')
      .eq('is_active', true);
  }

  if (changes.length > 0) {
    await supabase.from('business_log').insert({
      category: 'deals',
      action: 'price_change_detected',
      details: { provider: 'Lebara', changes },
    });
  }

  return {
    provider: 'Lebara',
    status: fetchError ? 'error' : changes.length > 0 ? 'changes_detected' : 'verified',
    prices_found: pricesFound.length,
    changes: changes.length,
    error: fetchError,
  };
}
