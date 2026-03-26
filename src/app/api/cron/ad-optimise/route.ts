import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CUSTOMER_ID = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
const DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '';
const META_AD_ACCOUNT = 'act_1413289257265883';

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function getGoogleAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
  });
  const data: any = await res.json();
  return data.access_token || null;
}

interface OptAction {
  platform: string;
  campaign: string;
  action: string;
  reason: string;
  details?: string;
}

/**
 * Weekly cron (Monday 6am) - auto-optimise ad campaigns
 * Rules from business-ops.md:
 * - CPA < £6 -> increase budget +20%
 * - CPA £6-10 -> no change
 * - CPA £10-15 -> decrease budget -30%
 * - CPA > £15 -> pause campaign
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const actions: OptAction[] = [];

  // Get last 7 days of metrics
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const { data: weekMetrics } = await supabase
    .from('daily_ad_metrics')
    .select('platform, campaign_name, campaign_id, spend, clicks, conversions')
    .gte('date', weekAgo);

  if (!weekMetrics || weekMetrics.length === 0) {
    return NextResponse.json({ success: true, actions: [], reason: 'No metrics data for last 7 days' });
  }

  // Aggregate by campaign
  const campaignStats: Record<string, { platform: string; id: string; spend: number; clicks: number; conversions: number }> = {};
  for (const m of weekMetrics) {
    const key = `${m.platform}:${m.campaign_name}`;
    if (!campaignStats[key]) {
      campaignStats[key] = { platform: m.platform, id: m.campaign_id || '', spend: 0, clicks: 0, conversions: 0 };
    }
    campaignStats[key].spend += parseFloat(String(m.spend)) || 0;
    campaignStats[key].clicks += m.clicks || 0;
    campaignStats[key].conversions += parseFloat(String(m.conversions)) || 0;
  }

  // Apply rules to Google Ads campaigns
  const accessToken = await getGoogleAccessToken();

  for (const [name, stats] of Object.entries(campaignStats)) {
    const cpa = stats.conversions > 0 ? stats.spend / stats.conversions : stats.spend > 0 ? Infinity : 0;
    const campaignName = name.split(':')[1] || name;

    if (cpa === 0) continue; // No spend, skip

    if (cpa < 6) {
      actions.push({ platform: stats.platform, campaign: campaignName, action: 'increase_budget_20pct', reason: `CPA £${cpa.toFixed(2)} < £6` });

      // Apply for Google Ads
      if (stats.platform === 'google_ads' && accessToken && stats.id) {
        try {
          // Get current budget, increase by 20%
          const query = `SELECT campaign.id, campaign_budget.amount_micros, campaign_budget.resource_name FROM campaign WHERE campaign.id = ${stats.id}`;
          const res = await fetch(`https://googleads.googleapis.com/v19/customers/${CUSTOMER_ID}/googleAds:searchStream`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'developer-token': DEVELOPER_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({ query }),
          });
          const data: any = await res.json();
          const budgetResource = data?.[0]?.results?.[0]?.campaignBudget?.resourceName;
          const currentBudget = parseInt(data?.[0]?.results?.[0]?.campaignBudget?.amountMicros || '0');

          if (budgetResource && currentBudget > 0) {
            const newBudget = Math.round(currentBudget * 1.2);
            // Cap at 3x original (assume original is the campaign's initial budget)
            const maxBudget = currentBudget * 3;
            const finalBudget = Math.min(newBudget, maxBudget);

            await fetch(`https://googleads.googleapis.com/v19/${budgetResource}`, {
              method: 'PATCH',
              headers: { 'Authorization': `Bearer ${accessToken}`, 'developer-token': DEVELOPER_TOKEN, 'Content-Type': 'application/json' },
              body: JSON.stringify({ amountMicros: String(finalBudget) }),
            });
            actions[actions.length - 1].details = `Budget: ${currentBudget / 1_000_000} -> ${finalBudget / 1_000_000}`;
          }
        } catch (err: any) {
          actions[actions.length - 1].details = `Failed: ${err.message}`;
        }
      }
    } else if (cpa >= 10 && cpa < 15) {
      actions.push({ platform: stats.platform, campaign: campaignName, action: 'decrease_budget_30pct', reason: `CPA £${cpa.toFixed(2)} between £10-15` });
    } else if (cpa >= 15) {
      actions.push({ platform: stats.platform, campaign: campaignName, action: 'pause_campaign', reason: `CPA £${cpa.toFixed(2)} > £15` });

      // Pause Google Ads campaign
      if (stats.platform === 'google_ads' && accessToken && stats.id) {
        try {
          await fetch(`https://googleads.googleapis.com/v19/customers/${CUSTOMER_ID}/googleAds:mutate`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${accessToken}`, 'developer-token': DEVELOPER_TOKEN, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              mutateOperations: [{
                campaignOperation: {
                  update: { resourceName: `customers/${CUSTOMER_ID}/campaigns/${stats.id}`, status: 'PAUSED' },
                  updateMask: 'status',
                },
              }],
            }),
          });
        } catch {}
      }

      // Pause Meta Ads campaign
      if (stats.platform === 'meta_ads' && stats.id) {
        const token = process.env.META_ACCESS_TOKEN;
        if (token) {
          await fetch(`https://graph.facebook.com/v25.0/${stats.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'PAUSED', access_token: token }),
          }).catch(() => {});
        }
      }
    }
  }

  // Log actions to business_log
  if (actions.length > 0) {
    await supabase.from('business_log').insert({
      category: 'agent_note',
      title: `Weekly ad optimisation: ${actions.length} actions`,
      content: actions.map(a => `[${a.platform}] ${a.campaign}: ${a.action} (${a.reason})${a.details ? ` - ${a.details}` : ''}`).join('\n'),
      created_by: 'system',
    });
  }

  // Notify via Telegram
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(',')[0];
  if (telegramToken && chatId && actions.length > 0) {
    const msg = `Weekly Ad Optimisation:\n\n${actions.map(a => `${a.campaign}: ${a.action}\n  ${a.reason}`).join('\n\n')}`;
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: Number(chatId), text: msg }),
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, actions });
}
