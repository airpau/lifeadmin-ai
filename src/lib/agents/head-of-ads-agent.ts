import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function runHeadOfAdsAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Track signups by UTM source (from profiles or waitlist)
  // Users who signed up via ads will have referrer data in auth metadata
  const [
    totalUsers,
    newUsersToday,
    newUsersWeek,
    tiersResult,
    // Check deal clicks as a proxy for engagement from ad traffic
    dealClicksWeek,
    // Check agent runs for complaint generation (shows feature usage from ad signups)
    complaintsWeek,
    // Social post engagement
    socialPostsPosted,
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', yesterday),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', lastWeek),
    supabase.from('profiles').select('subscription_tier'),
    supabase.from('deal_clicks').select('id', { count: 'exact', head: true }).gte('clicked_at', lastWeek),
    supabase.from('tasks').select('id', { count: 'exact', head: true })
      .eq('type', 'complaint_letter').gte('created_at', lastWeek),
    supabase.from('social_posts').select('id', { count: 'exact', head: true }).eq('status', 'posted'),
  ]);

  // Tier breakdown for conversion tracking
  const tiers: Record<string, number> = { free: 0, essential: 0, pro: 0 };
  for (const p of tiersResult.data || []) {
    const tier = p.subscription_tier || 'free';
    tiers[tier] = (tiers[tier] || 0) + 1;
  }
  const mrr = tiers.essential * 9.99 + tiers.pro * 19.99;
  const payingCustomers = tiers.essential + tiers.pro;

  // Try to get Google Ads data if API is configured
  let googleAdsData = 'Google Ads API not yet connected. Manual check required at ads.google.com.';
  // Future: if (process.env.GOOGLE_ADS_API_KEY) { fetch google ads reporting API }

  // Try to get Meta Ads data if API is configured
  let metaAdsData = 'Meta Ads API not yet connected. Manual check required at business.facebook.com.';
  // Future: if (process.env.META_MARKETING_TOKEN) { fetch meta marketing API }

  const contextPrompt = `Current time: ${now.toISOString()}

## Campaign Status
- Google Ads: LIVE (launched 23 March 2026). Search campaign targeting UK consumers.
  Keywords: complaint letters, energy bill disputes, subscription tracking, debt disputes, flight compensation, parking appeals.
  Budget: approximately £10.60/day (£322/month).
  ${googleAdsData}

- Meta Ads: Not yet launched (pending setup with Meta Pixel).

- Organic Social: ${socialPostsPosted.count || 0} posts published across Facebook/Instagram.

## User Acquisition Metrics
- Total users: ${totalUsers.count || 0}
- New users (last 24h): ${newUsersToday.count || 0}
- New users (last 7 days): ${newUsersWeek.count || 0}
- Paying customers: ${payingCustomers} (Essential: ${tiers.essential}, Pro: ${tiers.pro})
- Free users: ${tiers.free}
- MRR: £${mrr.toFixed(2)}

## Engagement (proxy for ad quality)
- Deal clicks (last 7 days): ${dealClicksWeek.count || 0}
- Complaints generated (last 7 days): ${complaintsWeek.count || 0}

## Budget
- Google Ads: ~£10.60/day = ~£322/month
- Meta Ads: not yet active
- Awin Advertiser (influencer): ~£40/month + commissions
- Total ad budget: ~£362/month

## What We Need
- Google Ads conversion tracking is set up (signup page and checkout page configured)
- Meta Pixel needs installing (waiting for Pixel ID)
- UTM tracking on all ad URLs

Please analyse this data and produce your advertising report. If data is limited because campaigns just launched, say so and recommend what metrics to watch over the coming days. Focus on estimated CPA and whether the current budget is appropriate for our growth targets.`;

  return runExecutiveAgent(agentConfig, contextPrompt, { useSonnet: true });
}
