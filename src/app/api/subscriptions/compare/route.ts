import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { findCheaperAlternatives, compareAllSubscriptions, saveComparisons } from '@/lib/comparison-engine';
import { normaliseMerchantName } from '@/lib/merchant-normalise';

/**
 * GET /api/subscriptions/compare?subscriptionId={id}
 * Returns comparisons for a single subscription.
 *
 * GET /api/subscriptions/compare?all=1
 * Returns all saved comparisons from DB for the logged-in user.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const all = request.nextUrl.searchParams.get('all');
    if (all) {
      // Fetch all saved comparisons for user's subscriptions
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('id, provider_name, category, provider_type')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .is('dismissed_at', null);

      if (!subs || subs.length === 0) {
        return NextResponse.json({ totalAnnualSaving: 0, count: 0, subscriptionsCompared: 0, subscriptions: [] });
      }

      const subIds = subs.map((s: any) => s.id);
      const subMap = new Map((subs || []).map((s: any) => [s.id, s]));

      const { data: comps } = await supabase
        .from('subscription_comparisons')
        .select('*')
        .in('subscription_id', subIds)
        .eq('dismissed', false)
        .order('annual_saving', { ascending: false });

      const grouped: Record<string, any[]> = {};
      let totalAnnualSaving = 0;
      let count = 0;

      for (const c of (comps || [])) {
        if (!grouped[c.subscription_id]) {
          grouped[c.subscription_id] = [];
          count++; // unique subscriptions with a deal
          totalAnnualSaving += parseFloat(String(c.annual_saving)); // only count best deal
        }
        grouped[c.subscription_id].push({
          dealProvider: c.deal_provider,
          dealName: c.deal_name,
          dealUrl: c.deal_url,
          currentPrice: parseFloat(String(c.current_price)),
          dealPrice: parseFloat(String(c.deal_price)),
          annualSaving: parseFloat(String(c.annual_saving)),
        });
      }

      const subscriptions = Object.keys(grouped).map(subId => {
        const sub = subMap.get(subId);
        return {
          subscriptionId: subId,
          subscriptionName: normaliseMerchantName(sub?.provider_name || 'Unknown'),
          providerName: normaliseMerchantName(sub?.provider_name || 'Unknown'),
          category: sub?.category || sub?.provider_type || '',
          comparisons: grouped[subId] || [],
        };
      });

      return NextResponse.json({
        totalAnnualSaving,
        count,
        subscriptionsCompared: subIds.length,
        subscriptions,
      });
    }

    const subscriptionId = request.nextUrl.searchParams.get('subscriptionId');
    if (!subscriptionId) {
      return NextResponse.json({ error: 'subscriptionId or all param required' }, { status: 400 });
    }

    const comparisons = await findCheaperAlternatives(subscriptionId, user.id);
    return NextResponse.json({ comparisons });
  } catch (err) {
    console.error('Compare GET error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/subscriptions/compare
 * Runs compareAllSubscriptions for the logged-in user, saves results, returns summary
 * along with per-subscription comparisons.
 */
export async function POST() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await compareAllSubscriptions(user.id);

    // Save comparisons to DB
    for (const [subId, comparisons] of Object.entries(result.comparisons)) {
      const currentPrice = comparisons[0]?.currentPrice || 0;
      await saveComparisons(subId, currentPrice, comparisons);
    }

    // Fetch subscription names for the response
    const subIds = Object.keys(result.comparisons);
    const { data: subDetails } = await supabase
      .from('subscriptions')
      .select('id, provider_name, category, provider_type')
      .in('id', subIds.length > 0 ? subIds : ['none']);

    const subMap = new Map((subDetails || []).map(s => [s.id, s]));

    const subscriptions = subIds.map(subId => {
      const sub = subMap.get(subId);
      return {
        subscriptionId: subId,
        subscriptionName: normaliseMerchantName(sub?.provider_name || 'Unknown'),
        providerName: normaliseMerchantName(sub?.provider_name || 'Unknown'),
        category: sub?.category || sub?.provider_type || '',
        comparisons: result.comparisons[subId] || [],
      };
    });

    return NextResponse.json({
      totalAnnualSaving: result.totalAnnualSaving,
      count: result.count,
      subscriptionsCompared: subIds.length,
      subscriptions,
    });
  } catch (err) {
    console.error('Compare POST error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
