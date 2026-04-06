import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 30;

const TELEGRAM_TOKEN = process.env.TELEGRAM_ADMIN_BOT_TOKEN || '';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const FOUNDER_CHAT_ID = process.env.TELEGRAM_ALLOWED_CHAT_IDS?.split(',').map(Number)[0];

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function getGoogleAdsSpend(days: number): Promise<number> {
  const CUSTOMER_ID = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
  const DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '';
  const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID || '';
  const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET || '';
  const REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN || '';

  if (!CUSTOMER_ID || !DEVELOPER_TOKEN || !REFRESH_TOKEN) return 0;

  try {
    // Get access token
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        refresh_token: REFRESH_TOKEN,
        grant_type: 'refresh_token',
      }),
    });
    const tokenData: any = await tokenRes.json();
    if (tokenData.error) return 0;

    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const endDate = new Date().toISOString().split('T')[0];

    const query = `SELECT metrics.cost_micros FROM customer WHERE segments.date BETWEEN '${startDate}' AND '${endDate}'`;
    const res = await fetch(
      `https://googleads.googleapis.com/v19/customers/${CUSTOMER_ID}/googleAds:searchStream`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenData.access_token}`,
          'developer-token': DEVELOPER_TOKEN,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }
    );
    const data: any = await res.json();
    let totalMicros = 0;
    for (const batch of (Array.isArray(data) ? data : [data])) {
      for (const r of (batch.results || [])) {
        totalMicros += parseInt(r.metrics?.costMicros || '0');
      }
    }
    return totalMicros / 1_000_000; // Convert micros to GBP
  } catch {
    return 0;
  }
}

export interface AcquisitionReport {
  period: string;
  periodStart: string;
  periodEnd: string;
  totalSignups: number;
  sources: {
    source: string;
    count: number;
    percentage: string;
    estimatedCac: string | null;
  }[];
  weekOverWeek: {
    thisWeek: number;
    lastWeek: number;
    change: string;
  };
  topCampaigns: { campaign: string; count: number }[];
  conversionBySource: {
    source: string;
    total: number;
    paid: number;
    conversionRate: string;
  }[];
}

async function buildReport(supabase: ReturnType<typeof getAdmin>, days: number = 7): Promise<AcquisitionReport> {
  const now = new Date();
  const periodEnd = now.toISOString();
  const periodStart = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const prevPeriodStart = new Date(now.getTime() - days * 2 * 24 * 60 * 60 * 1000).toISOString();

  // Get real ad spend from Google Ads
  const googleAdsSpend = await getGoogleAdsSpend(days);

  // This week's signups by source
  const { data: thisWeekUsers } = await supabase
    .from('profiles')
    .select('signup_source, utm_source, utm_medium, utm_campaign, gclid, fbclid, subscription_tier, created_at')
    .gte('created_at', periodStart)
    .lte('created_at', periodEnd)
    .order('created_at', { ascending: false });

  // Last week's signups for comparison
  const { data: lastWeekUsers } = await supabase
    .from('profiles')
    .select('id')
    .gte('created_at', prevPeriodStart)
    .lt('created_at', periodStart);

  const users = thisWeekUsers || [];
  const thisWeekCount = users.length;
  const lastWeekCount = (lastWeekUsers || []).length;

  // Group by source
  const sourceCounts: Record<string, number> = {};
  const sourcePaid: Record<string, number> = {};
  const campaignCounts: Record<string, number> = {};

  for (const u of users) {
    const src = u.signup_source || 'organic';
    sourceCounts[src] = (sourceCounts[src] || 0) + 1;

    if (u.subscription_tier && u.subscription_tier !== 'free') {
      sourcePaid[src] = (sourcePaid[src] || 0) + 1;
    }

    if (u.utm_campaign) {
      campaignCounts[u.utm_campaign] = (campaignCounts[u.utm_campaign] || 0) + 1;
    }
  }

  // Build sources with CAC (using real ad spend data)
  const adSpend: Record<string, number> = {
    google_ads: googleAdsSpend,
    meta_ads: parseFloat(process.env.MONTHLY_META_ADS_SPEND || '0') * (days / 30), // Meta approximation until API added
  };

  const sources = Object.entries(sourceCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([source, count]) => {
      const spend = adSpend[source] || 0;
      const estimatedCac = spend > 0 && count > 0
        ? `£${(spend / count).toFixed(2)}`
        : null;

      return {
        source,
        count,
        percentage: thisWeekCount > 0 ? `${((count / thisWeekCount) * 100).toFixed(1)}%` : '0%',
        estimatedCac,
      };
    });

  // Week over week change
  const change = lastWeekCount > 0
    ? `${thisWeekCount >= lastWeekCount ? '+' : ''}${(((thisWeekCount - lastWeekCount) / lastWeekCount) * 100).toFixed(0)}%`
    : thisWeekCount > 0 ? '+100% (new)' : 'No signups';

  // Top campaigns
  const topCampaigns = Object.entries(campaignCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([campaign, count]) => ({ campaign, count }));

  // Conversion by source (signup -> paid)
  const conversionBySource = Object.entries(sourceCounts).map(([source, total]) => ({
    source,
    total,
    paid: sourcePaid[source] || 0,
    conversionRate: total > 0 ? `${(((sourcePaid[source] || 0) / total) * 100).toFixed(1)}%` : '0%',
  }));

  return {
    period: `${days} days`,
    periodStart: new Date(periodStart).toLocaleDateString('en-GB'),
    periodEnd: new Date(periodEnd).toLocaleDateString('en-GB'),
    totalSignups: thisWeekCount,
    sources,
    weekOverWeek: {
      thisWeek: thisWeekCount,
      lastWeek: lastWeekCount,
      change,
    },
    topCampaigns,
    conversionBySource,
  };
}

export function formatReportTelegram(report: AcquisitionReport): string {
  let msg = `*Weekly Acquisition Report*\n${report.periodStart} - ${report.periodEnd}\n\n`;

  msg += `*Total Signups:* ${report.totalSignups}\n`;
  msg += `*Week-over-Week:* ${report.weekOverWeek.change} (${report.weekOverWeek.lastWeek} -> ${report.weekOverWeek.thisWeek})\n`;

  // Show total ad spend if available
  const totalSpend = report.sources.reduce((sum, s) => {
    if (s.estimatedCac) {
      const cacNum = parseFloat(s.estimatedCac.replace('£', ''));
      return sum + cacNum * s.count;
    }
    return sum;
  }, 0);
  if (totalSpend > 0) {
    const blendedCac = report.totalSignups > 0 ? (totalSpend / report.totalSignups).toFixed(2) : '0';
    msg += `*Total Ad Spend:* £${totalSpend.toFixed(2)} | *Blended CAC:* £${blendedCac}\n`;
  }
  msg += '\n';

  msg += `*Signups by Source:*\n`;
  for (const s of report.sources) {
    msg += `  ${s.source}: ${s.count} (${s.percentage})`;
    if (s.estimatedCac) msg += ` | CAC: ${s.estimatedCac}`;
    msg += '\n';
  }

  if (report.topCampaigns.length > 0) {
    msg += `\n*Top Campaigns:*\n`;
    for (const c of report.topCampaigns) {
      msg += `  ${c.campaign}: ${c.count} signups\n`;
    }
  }

  if (report.conversionBySource.length > 0) {
    msg += `\n*Signup -> Paid Conversion:*\n`;
    for (const c of report.conversionBySource) {
      msg += `  ${c.source}: ${c.paid}/${c.total} (${c.conversionRate})\n`;
    }
  }

  return msg;
}

// GET: cron-triggered weekly report (Monday 9am)
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const report = await buildReport(supabase, 7);
  const message = formatReportTelegram(report);

  // Send to founder via Telegram
  if (FOUNDER_CHAT_ID && TELEGRAM_TOKEN) {
    const chunks = [];
    for (let i = 0; i < message.length; i += 4000) {
      chunks.push(message.slice(i, i + 4000));
    }
    for (const chunk of chunks) {
      const res = await fetch(`${TELEGRAM_API}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: FOUNDER_CHAT_ID, text: chunk, parse_mode: 'Markdown' }),
      });
      if (!res.ok) {
        await fetch(`${TELEGRAM_API}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: FOUNDER_CHAT_ID, text: chunk }),
        });
      }
    }
  }

  // Also save to executive_reports for agents to see
  await supabase.from('executive_reports').insert({
    agent_role: 'system',
    title: `Weekly Acquisition Report (${report.periodStart} - ${report.periodEnd})`,
    content: message,
    recommendations: [
      `Total signups: ${report.totalSignups}`,
      `WoW change: ${report.weekOverWeek.change}`,
      `Top source: ${report.sources[0]?.source || 'none'} (${report.sources[0]?.count || 0})`,
    ],
    data: report,
  });

  return NextResponse.json({ success: true, report });
}

// POST: on-demand report (from Telegram /cac command)
export async function POST(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const days = body.days || 7;

  const supabase = getAdmin();
  const report = await buildReport(supabase, days);

  return NextResponse.json({ success: true, report, formatted: formatReportTelegram(report) });
}
