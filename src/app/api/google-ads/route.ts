import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

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
  if (data.error) throw new Error(`OAuth: ${data.error_description || data.error}`);
  return data.access_token;
}

async function googleAdsQuery(query: string): Promise<any> {
  const accessToken = await getAccessToken();
  const res = await fetch(
    `https://googleads.googleapis.com/v19/customers/${CUSTOMER_ID}/googleAds:searchStream`,
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
  return res.json();
}

async function googleAdsMutate(operations: any[]): Promise<any> {
  const accessToken = await getAccessToken();
  const res = await fetch(
    `https://googleads.googleapis.com/v19/customers/${CUSTOMER_ID}/googleAds:mutate`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'developer-token': DEVELOPER_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ mutateOperations: operations }),
    }
  );
  return res.json();
}

/**
 * Google Ads API - Campaign management
 *
 * GET: List campaigns with performance data
 * POST: Create campaign, ad group, or ads
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!DEVELOPER_TOKEN || !REFRESH_TOKEN || !CUSTOMER_ID) {
    return NextResponse.json({ error: 'Google Ads not configured' }, { status: 503 });
  }

  const action = request.nextUrl.searchParams.get('action') || 'campaigns';

  try {
    if (action === 'campaigns') {
      const data = await googleAdsQuery(`
        SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type,
               campaign_budget.amount_micros,
               metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
               metrics.cost_per_conversion
        FROM campaign
        WHERE campaign.status != 'REMOVED'
        ORDER BY metrics.impressions DESC
        LIMIT 20
      `);
      return NextResponse.json({ ok: true, data });
    }

    if (action === 'ad_groups') {
      const campaignId = request.nextUrl.searchParams.get('campaign_id');
      const data = await googleAdsQuery(`
        SELECT ad_group.id, ad_group.name, ad_group.status, ad_group.type,
               metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
        FROM ad_group
        ${campaignId ? `WHERE campaign.id = ${campaignId}` : ''}
        ORDER BY metrics.impressions DESC
        LIMIT 20
      `);
      return NextResponse.json({ ok: true, data });
    }

    if (action === 'ads') {
      const data = await googleAdsQuery(`
        SELECT ad_group_ad.ad.id, ad_group_ad.ad.name, ad_group_ad.status,
               ad_group_ad.ad.responsive_search_ad.headlines,
               ad_group_ad.ad.responsive_search_ad.descriptions,
               ad_group_ad.ad.final_urls,
               metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions
        FROM ad_group_ad
        WHERE ad_group_ad.status != 'REMOVED'
        ORDER BY metrics.impressions DESC
        LIMIT 20
      `);
      return NextResponse.json({ ok: true, data });
    }

    if (action === 'keywords') {
      const data = await googleAdsQuery(`
        SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
               ad_group_criterion.status, ad_group.name,
               metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions,
               metrics.average_cpc
        FROM keyword_view
        WHERE ad_group_criterion.status != 'REMOVED'
        ORDER BY metrics.impressions DESC
        LIMIT 30
      `);
      return NextResponse.json({ ok: true, data });
    }

    if (action === 'performance') {
      const days = request.nextUrl.searchParams.get('days') || '7';
      const data = await googleAdsQuery(`
        SELECT segments.date,
               metrics.impressions, metrics.clicks, metrics.cost_micros,
               metrics.conversions, metrics.average_cpc
        FROM customer
        WHERE segments.date DURING LAST_${days}_DAYS
        ORDER BY segments.date DESC
      `);
      return NextResponse.json({ ok: true, data });
    }

    return NextResponse.json({ error: 'Unknown action. Use: campaigns, ad_groups, ads, keywords, performance' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!DEVELOPER_TOKEN || !REFRESH_TOKEN || !CUSTOMER_ID) {
    return NextResponse.json({ error: 'Google Ads not configured' }, { status: 503 });
  }

  const body = await request.json();
  const { action } = body;

  try {
    if (action === 'create_campaign') {
      const { name, budget_micros, bidding_strategy, channel_type } = body;

      // Create budget first
      const budgetOp = {
        campaignBudgetOperation: {
          create: {
            name: `${name} Budget`,
            amountMicros: budget_micros || '10000000', // Default £10/day
            deliveryMethod: 'STANDARD',
          },
        },
      };

      const budgetResult = await googleAdsMutate([budgetOp]);
      if (budgetResult.error) {
        return NextResponse.json({ error: budgetResult.error.message }, { status: 500 });
      }

      const budgetResourceName = budgetResult.mutateOperationResponses?.[0]?.campaignBudgetResult?.resourceName;

      // Create campaign
      const campaignOp = {
        campaignOperation: {
          create: {
            name,
            advertisingChannelType: channel_type || 'SEARCH',
            status: 'PAUSED', // Start paused for review
            campaignBudget: budgetResourceName,
            biddingStrategyType: bidding_strategy || 'MAXIMIZE_CONVERSIONS',
            networkSettings: {
              targetGoogleSearch: true,
              targetSearchNetwork: true,
              targetContentNetwork: false,
            },
            geoTargetTypeSetting: {
              positiveGeoTargetType: 'PRESENCE_OR_INTEREST',
            },
          },
        },
      };

      const campaignResult = await googleAdsMutate([campaignOp]);
      return NextResponse.json({ ok: true, result: campaignResult });
    }

    if (action === 'create_ad_group') {
      const { campaign_id, name, cpc_bid_micros } = body;

      const op = {
        adGroupOperation: {
          create: {
            name,
            campaign: `customers/${CUSTOMER_ID}/campaigns/${campaign_id}`,
            type: 'SEARCH_STANDARD',
            cpcBidMicros: cpc_bid_micros || '1000000', // Default £1 CPC
            status: 'ENABLED',
          },
        },
      };

      const result = await googleAdsMutate([op]);
      return NextResponse.json({ ok: true, result });
    }

    if (action === 'create_responsive_search_ad') {
      const { ad_group_id, headlines, descriptions, final_url } = body;

      const op = {
        adGroupAdOperation: {
          create: {
            adGroup: `customers/${CUSTOMER_ID}/adGroups/${ad_group_id}`,
            status: 'ENABLED',
            ad: {
              responsiveSearchAd: {
                headlines: (headlines || []).map((h: string, i: number) => ({
                  text: h,
                  pinnedField: i < 3 ? `HEADLINE_${i + 1}` : undefined,
                })),
                descriptions: (descriptions || []).map((d: string) => ({
                  text: d,
                })),
              },
              finalUrls: [final_url || 'https://paybacker.co.uk'],
            },
          },
        },
      };

      const result = await googleAdsMutate([op]);
      return NextResponse.json({ ok: true, result });
    }

    if (action === 'add_keywords') {
      const { ad_group_id, keywords } = body;

      const ops = (keywords || []).map((kw: { text: string; match_type?: string }) => ({
        adGroupCriterionOperation: {
          create: {
            adGroup: `customers/${CUSTOMER_ID}/adGroups/${ad_group_id}`,
            keyword: {
              text: kw.text,
              matchType: kw.match_type || 'PHRASE',
            },
            status: 'ENABLED',
          },
        },
      }));

      const result = await googleAdsMutate(ops);
      return NextResponse.json({ ok: true, result });
    }

    if (action === 'add_location_targeting') {
      const { campaign_id } = body;

      // Target United Kingdom (geo target constant 2826)
      const op = {
        campaignCriterionOperation: {
          create: {
            campaign: `customers/${CUSTOMER_ID}/campaigns/${campaign_id}`,
            location: {
              geoTargetConstant: 'geoTargetConstants/2826', // United Kingdom
            },
          },
        },
      };

      const result = await googleAdsMutate([op]);
      return NextResponse.json({ ok: true, result });
    }

    if (action === 'update_campaign_status') {
      const { campaign_id, status } = body; // ENABLED, PAUSED, REMOVED

      const op = {
        campaignOperation: {
          update: {
            resourceName: `customers/${CUSTOMER_ID}/campaigns/${campaign_id}`,
            status,
          },
          updateMask: 'status',
        },
      };

      const result = await googleAdsMutate([op]);
      return NextResponse.json({ ok: true, result });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
