import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function runCMOAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    socialPostsAll,
    socialPostsPosted,
    socialPostsLastWeek,
    waitlistTotal,
    waitlistConverted,
    waitlistInvited,
    dealClicksTotal,
    dealClicksLastWeek,
    newUsersToday,
    totalUsers,
  ] = await Promise.all([
    supabase.from('social_posts').select('id', { count: 'exact', head: true }),
    supabase.from('social_posts').select('id', { count: 'exact', head: true }).eq('status', 'posted'),
    supabase.from('social_posts').select('id', { count: 'exact', head: true }).eq('status', 'posted').gte('posted_at', lastWeek),
    supabase.from('waitlist_signups').select('id', { count: 'exact', head: true }),
    supabase.from('waitlist_signups').select('id', { count: 'exact', head: true }).eq('status', 'converted'),
    supabase.from('waitlist_signups').select('id', { count: 'exact', head: true }).eq('status', 'invited'),
    supabase.from('deal_clicks').select('id', { count: 'exact', head: true }),
    supabase.from('deal_clicks').select('id', { count: 'exact', head: true }).gte('clicked_at', lastWeek),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', yesterday),
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
  ]);

  const wlTotal = waitlistTotal.count || 0;
  const wlConverted = waitlistConverted.count || 0;
  const wlInvited = waitlistInvited.count || 0;
  const conversionRate = wlTotal > 0 ? ((wlConverted / wlTotal) * 100).toFixed(1) : '0';
  const inviteRate = wlTotal > 0 ? ((wlInvited / wlTotal) * 100).toFixed(1) : '0';

  const contextPrompt = `Today is ${now.toISOString().split('T')[0]}. Here is the marketing data for Paybacker LTD:

## Social Media
- Total posts created: ${socialPostsAll.count || 0}
- Posts published: ${socialPostsPosted.count || 0}
- Posts published last 7 days: ${socialPostsLastWeek.count || 0}
- Platform: Facebook (active), Instagram (pending Meta app review)

## Waitlist & Acquisition
- Total waitlist signups: ${wlTotal}
- Invited: ${wlInvited} (${inviteRate}%)
- Converted to users: ${wlConverted} (${conversionRate}%)
- New user signups (last 24h): ${newUsersToday.count || 0}
- Total registered users: ${totalUsers.count || 0}

## Deal Engagement (Awin Affiliate)
- Total deal clicks (all time): ${dealClicksTotal.count || 0}
- Deal clicks (last 7 days): ${dealClicksLastWeek.count || 0}
- Categories: energy, broadband, insurance, mobile, mortgages, credit cards, loans

## Brand
- Domain: paybacker.co.uk
- Target audience: UK professionals aged 25-45
- Positioning: AI-powered money recovery for UK consumers
- Competitors: DoNotPay (US-focused), Resolver (manual process)

Please analyse this data and produce your daily marketing report. Focus on growth opportunities and actionable recommendations.`;

  return runExecutiveAgent(agentConfig, contextPrompt);
}
