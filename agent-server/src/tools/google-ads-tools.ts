import { config } from '../config';

interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, any>;
  handler: (args: any, agentRole: string) => Promise<string>;
}

const CUSTOMER_ID = (process.env.GOOGLE_ADS_CUSTOMER_ID || '').replace(/-/g, '');
const DEVELOPER_TOKEN = process.env.GOOGLE_ADS_DEVELOPER_TOKEN || '';
const CLIENT_ID = process.env.GOOGLE_ADS_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_ADS_CLIENT_SECRET || '';
const REFRESH_TOKEN = process.env.GOOGLE_ADS_REFRESH_TOKEN || '';

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      refresh_token: REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  });
  const data: any = await res.json();
  if (data.error) throw new Error(`OAuth error: ${data.error_description || data.error}`);
  return data.access_token;
}

async function googleAdsQuery(query: string): Promise<any> {
  if (!DEVELOPER_TOKEN || !REFRESH_TOKEN || !CUSTOMER_ID) {
    return { error: 'Google Ads API not configured. Missing developer token, refresh token, or customer ID.' };
  }

  const accessToken = await getAccessToken();

  const res = await fetch(
    `https://googleads.googleapis.com/v18/customers/${CUSTOMER_ID}/googleAds:searchStream`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': DEVELOPER_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query }),
    }
  );

  const data: any = await res.json();
  if (data.error) {
    return { error: `Google Ads API error: ${data.error.message || JSON.stringify(data.error)}` };
  }
  return data;
}

const getCampaigns: ToolDef = {
  name: 'google_ads_get_campaigns',
  description: 'Get all Google Ads campaigns with their status, budget, and performance metrics. Use this to check what campaigns are running and how they are performing.',
  schema: {
    type: 'object',
    properties: {
      days: { type: 'number', default: 30, description: 'Number of days of performance data to include' },
    },
  },
  handler: async (args) => {
    const days = args.days || 30;
    const data = await googleAdsQuery(`
      SELECT
        campaign.id,
        campaign.name,
        campaign.status,
        campaign.advertising_channel_type,
        campaign_budget.amount_micros,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc
      FROM campaign
      WHERE segments.date DURING LAST_${days}_DAYS
      ORDER BY metrics.cost_micros DESC
    `);

    if (data.error) return data.error;

    const results = (data[0]?.results || []).map((r: any) => ({
      name: r.campaign?.name,
      status: r.campaign?.status,
      type: r.campaign?.advertisingChannelType,
      dailyBudget: r.campaignBudget?.amountMicros ? `GBP ${(r.campaignBudget.amountMicros / 1000000).toFixed(2)}` : 'unknown',
      impressions: r.metrics?.impressions,
      clicks: r.metrics?.clicks,
      cost: r.metrics?.costMicros ? `GBP ${(r.metrics.costMicros / 1000000).toFixed(2)}` : 'GBP 0',
      conversions: r.metrics?.conversions,
      ctr: r.metrics?.ctr ? `${(r.metrics.ctr * 100).toFixed(2)}%` : '0%',
      avgCpc: r.metrics?.averageCpc ? `GBP ${(r.metrics.averageCpc / 1000000).toFixed(2)}` : 'unknown',
    }));

    if (results.length === 0) return 'No campaigns found.';
    return JSON.stringify(results, null, 2);
  },
};

const getAdGroups: ToolDef = {
  name: 'google_ads_get_ad_groups',
  description: 'Get ad groups and their performance for a specific campaign or all campaigns.',
  schema: {
    type: 'object',
    properties: {
      campaign_name: { type: 'string', description: 'Filter by campaign name (optional)' },
      days: { type: 'number', default: 30 },
    },
  },
  handler: async (args) => {
    const days = args.days || 30;
    let query = `
      SELECT
        campaign.name,
        ad_group.id,
        ad_group.name,
        ad_group.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr
      FROM ad_group
      WHERE segments.date DURING LAST_${days}_DAYS
    `;
    if (args.campaign_name) {
      query += ` AND campaign.name = '${args.campaign_name}'`;
    }
    query += ' ORDER BY metrics.cost_micros DESC';

    const data = await googleAdsQuery(query);
    if (data.error) return data.error;

    const results = (data[0]?.results || []).map((r: any) => ({
      campaign: r.campaign?.name,
      adGroup: r.adGroup?.name,
      status: r.adGroup?.status,
      impressions: r.metrics?.impressions,
      clicks: r.metrics?.clicks,
      cost: r.metrics?.costMicros ? `GBP ${(r.metrics.costMicros / 1000000).toFixed(2)}` : 'GBP 0',
      conversions: r.metrics?.conversions,
      ctr: r.metrics?.ctr ? `${(r.metrics.ctr * 100).toFixed(2)}%` : '0%',
    }));

    if (results.length === 0) return 'No ad groups found.';
    return JSON.stringify(results, null, 2);
  },
};

const getKeywords: ToolDef = {
  name: 'google_ads_get_keywords',
  description: 'Get keyword performance data. See which search terms are driving clicks and conversions.',
  schema: {
    type: 'object',
    properties: {
      campaign_name: { type: 'string', description: 'Filter by campaign name (optional)' },
      days: { type: 'number', default: 30 },
    },
  },
  handler: async (args) => {
    const days = args.days || 30;
    let query = `
      SELECT
        campaign.name,
        ad_group.name,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc
      FROM keyword_view
      WHERE segments.date DURING LAST_${days}_DAYS
    `;
    if (args.campaign_name) {
      query += ` AND campaign.name = '${args.campaign_name}'`;
    }
    query += ' ORDER BY metrics.clicks DESC LIMIT 50';

    const data = await googleAdsQuery(query);
    if (data.error) return data.error;

    const results = (data[0]?.results || []).map((r: any) => ({
      campaign: r.campaign?.name,
      adGroup: r.adGroup?.name,
      keyword: r.adGroupCriterion?.keyword?.text,
      matchType: r.adGroupCriterion?.keyword?.matchType,
      status: r.adGroupCriterion?.status,
      impressions: r.metrics?.impressions,
      clicks: r.metrics?.clicks,
      cost: r.metrics?.costMicros ? `GBP ${(r.metrics.costMicros / 1000000).toFixed(2)}` : 'GBP 0',
      conversions: r.metrics?.conversions,
      ctr: r.metrics?.ctr ? `${(r.metrics.ctr * 100).toFixed(2)}%` : '0%',
      avgCpc: r.metrics?.averageCpc ? `GBP ${(r.metrics.averageCpc / 1000000).toFixed(2)}` : 'unknown',
    }));

    if (results.length === 0) return 'No keywords found.';
    return JSON.stringify(results, null, 2);
  },
};

const getSearchTerms: ToolDef = {
  name: 'google_ads_get_search_terms',
  description: 'Get actual search terms that triggered your ads. Shows what people are searching for when they find your ads.',
  schema: {
    type: 'object',
    properties: {
      days: { type: 'number', default: 7 },
    },
  },
  handler: async (args) => {
    const days = args.days || 7;
    const data = await googleAdsQuery(`
      SELECT
        campaign.name,
        search_term_view.search_term,
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions
      FROM search_term_view
      WHERE segments.date DURING LAST_${days}_DAYS
      ORDER BY metrics.clicks DESC
      LIMIT 30
    `);

    if (data.error) return data.error;

    const results = (data[0]?.results || []).map((r: any) => ({
      campaign: r.campaign?.name,
      searchTerm: r.searchTermView?.searchTerm,
      impressions: r.metrics?.impressions,
      clicks: r.metrics?.clicks,
      cost: r.metrics?.costMicros ? `GBP ${(r.metrics.costMicros / 1000000).toFixed(2)}` : 'GBP 0',
      conversions: r.metrics?.conversions,
    }));

    if (results.length === 0) return 'No search terms found.';
    return JSON.stringify(results, null, 2);
  },
};

const getAccountOverview: ToolDef = {
  name: 'google_ads_account_overview',
  description: 'Get a high-level overview of the Google Ads account: total spend, clicks, impressions, conversions, and cost per conversion.',
  schema: {
    type: 'object',
    properties: {
      days: { type: 'number', default: 30 },
    },
  },
  handler: async (args) => {
    const days = args.days || 30;
    const data = await googleAdsQuery(`
      SELECT
        metrics.impressions,
        metrics.clicks,
        metrics.cost_micros,
        metrics.conversions,
        metrics.ctr,
        metrics.average_cpc,
        metrics.cost_per_conversion
      FROM customer
      WHERE segments.date DURING LAST_${days}_DAYS
    `);

    if (data.error) return data.error;

    const r = data[0]?.results?.[0];
    if (!r) return 'No data found for this period.';

    return `Google Ads Account Overview (last ${days} days):
- Impressions: ${r.metrics?.impressions || 0}
- Clicks: ${r.metrics?.clicks || 0}
- Cost: GBP ${r.metrics?.costMicros ? (r.metrics.costMicros / 1000000).toFixed(2) : '0.00'}
- Conversions: ${r.metrics?.conversions || 0}
- CTR: ${r.metrics?.ctr ? (r.metrics.ctr * 100).toFixed(2) : '0'}%
- Avg CPC: GBP ${r.metrics?.averageCpc ? (r.metrics.averageCpc / 1000000).toFixed(2) : '0.00'}
- Cost per conversion: GBP ${r.metrics?.costPerConversion ? (r.metrics.costPerConversion / 1000000).toFixed(2) : 'N/A'}`;
  },
};

export const googleAdsTools: ToolDef[] = [
  getAccountOverview,
  getCampaigns,
  getAdGroups,
  getKeywords,
  getSearchTerms,
];
