import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

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

async function pullGoogleAdsMetrics(supabase: ReturnType<typeof getAdmin>): Promise<number> {
  const accessToken = await getGoogleAccessToken();
  if (!accessToken || !CUSTOMER_ID || !DEVELOPER_TOKEN) return 0;

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const query = `SELECT campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.conversions, metrics.cost_micros FROM campaign WHERE segments.date = '${yesterday}' AND campaign.status != 'REMOVED'`;

  try {
    const res = await fetch(`https://googleads.googleapis.com/v19/customers/${CUSTOMER_ID}/googleAds:searchStream`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': DEVELOPER_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    });

    const data: any = await res.json();
    let count = 0;

    for (const batch of (Array.isArray(data) ? data : [data])) {
      for (const r of (batch.results || [])) {
        const impressions = parseInt(r.metrics?.impressions || '0');
        const clicks = parseInt(r.metrics?.clicks || '0');
        const conversions = parseFloat(r.metrics?.conversions || '0');
        const spend = parseInt(r.metrics?.costMicros || '0') / 1_000_000;
        const cpa = conversions > 0 ? spend / conversions : null;
        const ctr = impressions > 0 ? (clicks / impressions) * 100 : null;

        await supabase.from('daily_ad_metrics').insert({
          date: yesterday,
          platform: 'google_ads',
          campaign_name: r.campaign?.name || 'Unknown',
          campaign_id: r.campaign?.id || null,
          impressions,
          clicks,
          conversions,
          spend: parseFloat(spend.toFixed(2)),
          cpa: cpa ? parseFloat(cpa.toFixed(2)) : null,
          ctr: ctr ? parseFloat(ctr.toFixed(2)) : null,
        });
        count++;
      }
    }
    return count;
  } catch (err: any) {
    console.error('[ad-metrics] Google Ads error:', err.message);
    return 0;
  }
}

async function pullMetaAdsMetrics(supabase: ReturnType<typeof getAdmin>): Promise<number> {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) return 0;

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  try {
    const res = await fetch(
      `https://graph.facebook.com/v25.0/${META_AD_ACCOUNT}/insights?fields=campaign_name,campaign_id,impressions,clicks,actions,spend&time_range={"since":"${yesterday}","until":"${yesterday}"}&level=campaign&access_token=${token}`
    );
    const data: any = await res.json();
    let count = 0;

    for (const row of (data.data || [])) {
      const impressions = parseInt(row.impressions || '0');
      const clicks = parseInt(row.clicks || '0');
      const spend = parseFloat(row.spend || '0');
      const conversions = (row.actions || []).find((a: any) => a.action_type === 'offsite_conversion.fb_pixel_lead')?.value || 0;
      const cpa = conversions > 0 ? spend / conversions : null;
      const ctr = impressions > 0 ? (clicks / impressions) * 100 : null;

      await supabase.from('daily_ad_metrics').insert({
        date: yesterday,
        platform: 'meta_ads',
        campaign_name: row.campaign_name || 'Unknown',
        campaign_id: row.campaign_id || null,
        impressions,
        clicks,
        conversions: parseFloat(String(conversions)),
        spend: parseFloat(spend.toFixed(2)),
        cpa: cpa ? parseFloat(cpa.toFixed(2)) : null,
        ctr: ctr ? parseFloat(ctr.toFixed(2)) : null,
      });
      count++;
    }
    return count;
  } catch (err: any) {
    console.error('[ad-metrics] Meta Ads error:', err.message);
    return 0;
  }
}

/**
 * Daily cron (7am) - pulls yesterday's ad metrics from Google Ads + Meta Ads
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  const [googleCount, metaCount] = await Promise.all([
    pullGoogleAdsMetrics(supabase),
    pullMetaAdsMetrics(supabase),
  ]);

  // Notify via Telegram
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(',')[0];
  if (telegramToken && chatId) {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toLocaleDateString('en-GB');
    const { data: totals } = await supabase
      .from('daily_ad_metrics')
      .select('platform, spend, clicks, conversions')
      .eq('date', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]);

    const googleSpend = (totals || []).filter(t => t.platform === 'google_ads').reduce((s, t) => s + parseFloat(String(t.spend)), 0);
    const metaSpend = (totals || []).filter(t => t.platform === 'meta_ads').reduce((s, t) => s + parseFloat(String(t.spend)), 0);
    const totalClicks = (totals || []).reduce((s, t) => s + (t.clicks || 0), 0);
    const totalConversions = (totals || []).reduce((s, t) => s + parseFloat(String(t.conversions || 0)), 0);

    const msg = `Ad Metrics (${yesterday}):\nGoogle: £${googleSpend.toFixed(2)} | Meta: £${metaSpend.toFixed(2)}\nClicks: ${totalClicks} | Conversions: ${totalConversions}`;
    await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: Number(chatId), text: msg }),
    }).catch(() => {});
  }

  return NextResponse.json({ success: true, google_campaigns: googleCount, meta_campaigns: metaCount });
}
