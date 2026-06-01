/**
 * PostHog read-API helpers — server-side web analytics for the Telegram
 * daily brief and the founder /analytics command.
 *
 * This is the READ side of PostHog (insights / funnels / trends). It is
 * distinct from src/lib/posthog-server.ts, which is the WRITE side
 * (fire-and-forget capture()). The two use different credentials:
 *
 *   - WRITE  → project write key (phc_…)            → POSTHOG_API_KEY
 *   - READ   → personal API key (phx_… "Bearer")    → POSTHOG_PERSONAL_API_KEY
 *
 * The REST query endpoints below authenticate with a *personal* API key.
 * A project write key (phc_…) will 401 against them. We therefore prefer
 * POSTHOG_PERSONAL_API_KEY and fall back to POSTHOG_API_KEY only so a
 * correctly-scoped personal key dropped into either slot still works.
 * Every function degrades gracefully — if no usable key is configured or
 * a query fails, callers get `{ available: false }` and skip the section
 * rather than erroring the whole cron / command.
 *
 * Pattern mirrors the working PostHog read in src/app/api/mcp/route.ts
 * (getPosthogCreds + /api/projects/{id}/insights/…).
 */

export interface FunnelStats {
  steps: Array<{ name: string; count: number }>;
  /** Overall conversion = last step / first step (percent, 0-100). */
  conversionPct: number;
  /** Largest single-step drop, e.g. "Homepage → Signup page: 83% drop". */
  biggestDrop: string | null;
}

export interface WebAnalytics {
  available: boolean;
  /** Unique visitors (pageview DAU) for the date window. */
  dau: number;
  /** `user_signed_up` events in the window. */
  signups: number;
  funnel: FunnelStats | null;
}

export interface AnalyticsReport {
  available: boolean;
  reason?: string;
  yesterday: {
    dau: number;
    pageviews: number;
    signups: number;
    bankConnected: number;
    disputesCreated: number;
    rageClicks: number;
  };
  funnel7d: FunnelStats | null;
  funnel30d: FunnelStats | null;
  topPages: Array<{ url: string; views: number }>;
  ga4: Ga4Report | null;
}

export interface Ga4Report {
  sessions: number;
  conversions: number;
  windowDays: number;
}

function getReadCreds(): { apiKey: string; host: string; projectId: string } | null {
  // Prefer the personal API key (full read API). See file header for why a
  // project write key won't work against the insights endpoints.
  const apiKey =
    process.env.POSTHOG_PERSONAL_API_KEY ||
    process.env.POSTHOG_API_KEY ||
    process.env.POSTHOG_PROJECT_API_KEY ||
    '';
  if (!apiKey) return null;
  const host =
    process.env.POSTHOG_HOST ||
    process.env.NEXT_PUBLIC_POSTHOG_HOST ||
    'https://eu.posthog.com';
  const projectId = process.env.POSTHOG_PROJECT_ID || '145782';
  return { apiKey, host, projectId };
}

type Creds = NonNullable<ReturnType<typeof getReadCreds>>;

// ---------------------------------------------------------------------------
// Low-level query helpers
// ---------------------------------------------------------------------------

async function postInsight(
  creds: Creds,
  kind: 'trend' | 'funnel',
  body: Record<string, unknown>,
): Promise<any | null> {
  try {
    const res = await fetch(
      `${creds.host}/api/projects/${creds.projectId}/insights/${kind}/`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${creds.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      console.warn(`[posthog-insights] ${kind} query failed: ${res.status}`);
      return null;
    }
    return await res.json();
  } catch (err) {
    console.warn(
      `[posthog-insights] ${kind} query threw:`,
      err instanceof Error ? err.message : String(err),
    );
    return null;
  }
}

/** Pull a scalar total out of a trend insight `result[0]`. */
function trendScalar(json: any): number {
  const series = json?.result?.[0];
  if (!series) return 0;
  if (typeof series.aggregated_value === 'number') return series.aggregated_value;
  if (Array.isArray(series.data)) {
    return series.data.reduce((s: number, n: number) => s + (Number(n) || 0), 0);
  }
  if (typeof series.count === 'number') return series.count;
  return 0;
}

function parseFunnel(json: any, labels: string[]): FunnelStats | null {
  const result = json?.result;
  if (!Array.isArray(result) || result.length === 0) return null;
  const steps = result.map((r: any, i: number) => ({
    name: r?.name || labels[i] || `Step ${i + 1}`,
    count: Number(r?.count ?? 0),
  }));
  const first = steps[0]?.count ?? 0;
  const last = steps[steps.length - 1]?.count ?? 0;
  const conversionPct = first > 0 ? (last / first) * 100 : 0;

  // Biggest single-step relative drop.
  let biggestDrop: string | null = null;
  let worstPct = -1;
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1].count;
    const cur = steps[i].count;
    if (prev <= 0) continue;
    const dropPct = ((prev - cur) / prev) * 100;
    if (dropPct > worstPct) {
      worstPct = dropPct;
      biggestDrop = `${steps[i - 1].name} → ${steps[i].name}: ${Math.round(dropPct)}% drop`;
    }
  }
  return { steps, conversionPct, biggestDrop };
}

// The acquisition funnel reused by the brief and the command.
const SIGNUP_FUNNEL_EVENTS = [
  { id: '$pageview', name: 'Homepage' },
  {
    id: '$pageview',
    name: 'Signup page',
    properties: [{ key: '$current_url', operator: 'icontains', value: '/signup' }],
  },
  { id: 'user_signed_up', name: 'Signed up' },
];
const SIGNUP_FUNNEL_LABELS = ['Homepage', 'Signup page', 'Signed up'];

async function fetchSignupFunnel(creds: Creds, dateFrom: string): Promise<FunnelStats | null> {
  const json = await postInsight(creds, 'funnel', {
    events: SIGNUP_FUNNEL_EVENTS,
    date_from: dateFrom,
    funnel_order_type: 'ordered',
    insight: 'FUNNELS',
  });
  return parseFunnel(json, SIGNUP_FUNNEL_LABELS);
}

async function fetchDailyEventTotal(
  creds: Creds,
  eventId: string,
  dateStr: string,
  math: 'dau' | 'total' = 'total',
): Promise<number> {
  const json = await postInsight(creds, 'trend', {
    events: [{ id: eventId, math }],
    date_from: dateStr,
    date_to: dateStr,
    interval: 'day',
  });
  return trendScalar(json);
}

// ---------------------------------------------------------------------------
// Public: morning-brief web analytics (lightweight)
// ---------------------------------------------------------------------------

/**
 * Yesterday's DAU + signups + the 7-day acquisition funnel. Used in the
 * founder's Telegram morning brief. Returns `{ available: false }` when
 * PostHog isn't configured or every query failed — callers skip the
 * section silently.
 */
export async function getWebAnalytics(): Promise<WebAnalytics> {
  const creds = getReadCreds();
  const empty: WebAnalytics = { available: false, dau: 0, signups: 0, funnel: null };
  if (!creds) return empty;

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dateStr = yesterday.toISOString().split('T')[0];

  const [dau, signups, funnel] = await Promise.all([
    fetchDailyEventTotal(creds, '$pageview', dateStr, 'dau'),
    fetchDailyEventTotal(creds, 'user_signed_up', dateStr, 'total'),
    fetchSignupFunnel(creds, '-7d'),
  ]);

  // If literally everything came back empty AND the funnel query failed,
  // treat as unavailable so we don't render a misleading all-zero block.
  const available = funnel !== null || dau > 0 || signups > 0;
  return { available, dau, signups, funnel };
}

// ---------------------------------------------------------------------------
// Public: full analytics report (founder /analytics command)
// ---------------------------------------------------------------------------

async function fetchTopPages(
  creds: Creds,
  dateStr: string,
): Promise<Array<{ url: string; views: number }>> {
  const json = await postInsight(creds, 'trend', {
    events: [{ id: '$pageview', math: 'total' }],
    breakdown: '$pathname',
    breakdown_type: 'event',
    date_from: dateStr,
    date_to: dateStr,
    interval: 'day',
  });
  const result = json?.result;
  if (!Array.isArray(result)) return [];
  return result
    .map((s: any) => ({
      url: String(s?.breakdown_value ?? '(unknown)'),
      views:
        typeof s?.aggregated_value === 'number'
          ? s.aggregated_value
          : Array.isArray(s?.data)
            ? s.data.reduce((a: number, n: number) => a + (Number(n) || 0), 0)
            : Number(s?.count ?? 0),
    }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);
}

export async function getAnalyticsReport(): Promise<AnalyticsReport> {
  const creds = getReadCreds();
  const empty: AnalyticsReport = {
    available: false,
    reason: 'POSTHOG_PERSONAL_API_KEY (or POSTHOG_API_KEY) not configured',
    yesterday: { dau: 0, pageviews: 0, signups: 0, bankConnected: 0, disputesCreated: 0, rageClicks: 0 },
    funnel7d: null,
    funnel30d: null,
    topPages: [],
    ga4: null,
  };
  if (!creds) return empty;

  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const dateStr = yesterday.toISOString().split('T')[0];

  const [
    dau,
    pageviews,
    signups,
    bankConnected,
    disputesCreated,
    rageClicks,
    funnel7d,
    funnel30d,
    topPages,
    ga4,
  ] = await Promise.all([
    fetchDailyEventTotal(creds, '$pageview', dateStr, 'dau'),
    fetchDailyEventTotal(creds, '$pageview', dateStr, 'total'),
    fetchDailyEventTotal(creds, 'user_signed_up', dateStr, 'total'),
    fetchDailyEventTotal(creds, 'bank_connected', dateStr, 'total'),
    fetchDailyEventTotal(creds, 'dispute_created', dateStr, 'total'),
    fetchDailyEventTotal(creds, '$rageclick', dateStr, 'total'),
    fetchSignupFunnel(creds, '-7d'),
    fetchSignupFunnel(creds, '-30d'),
    fetchTopPages(creds, dateStr),
    getGa4Report(),
  ]);

  return {
    available: true,
    yesterday: { dau, pageviews, signups, bankConnected, disputesCreated, rageClicks },
    funnel7d,
    funnel30d,
    topPages,
    ga4,
  };
}

/** Telegram-Markdown rendering of the full report. */
export function formatAnalyticsReport(r: AnalyticsReport): string {
  if (!r.available) {
    return `📊 *Analytics*\n\nPostHog read API not configured.\n_${r.reason ?? 'Add POSTHOG_PERSONAL_API_KEY to Vercel.'}_`;
  }
  const y = r.yesterday;
  const lines: string[] = [];
  lines.push('📊 *Web Analytics — yesterday*');
  lines.push(
    `Visitors: *${y.dau}* | Pageviews: *${y.pageviews}*\n` +
      `Signups: *${y.signups}* | Banks connected: *${y.bankConnected}* | Disputes: *${y.disputesCreated}*` +
      (y.rageClicks > 0 ? `\n😡 Rage clicks: *${y.rageClicks}*` : ''),
  );

  const fmtFunnel = (label: string, f: FunnelStats | null): string => {
    if (!f) return `\n*${label}:* _no data_`;
    const path = f.steps.map((s) => s.count).join(' → ');
    let out = `\n*${label}:* ${path} (${f.conversionPct.toFixed(1)}% conversion)`;
    if (f.biggestDrop) out += `\nBiggest drop: ${f.biggestDrop}`;
    return out;
  };
  lines.push(fmtFunnel('7-day funnel', r.funnel7d) + fmtFunnel('30-day funnel', r.funnel30d));

  if (r.topPages.length > 0) {
    lines.push(
      '*Top pages (yesterday):*\n' +
        r.topPages.map((p, i) => `${i + 1}. ${p.url} — ${p.views}`).join('\n'),
    );
  }

  if (r.ga4) {
    lines.push(
      `*Google Analytics (${r.ga4.windowDays}d):*\nSessions: *${r.ga4.sessions}* | Conversions: *${r.ga4.conversions}*`,
    );
  } else {
    lines.push(
      '_GA4 not wired — set GOOGLE_ANALYTICS_PROPERTY_ID + a service-account credential to enable._',
    );
  }

  return lines.join('\n\n');
}

// ---------------------------------------------------------------------------
// Google Analytics 4 (GA4 Data API) — stubbed until credentials are added
// ---------------------------------------------------------------------------

/**
 * GA4 sessions + conversions for the last 7 days via the GA4 Data API
 * (https://analyticsdata.googleapis.com/v1beta/properties/{id}:runReport).
 *
 * NOT YET WIRED. The GA4 Data API requires an OAuth2 access token, which
 * means a Google service account with the Analytics Data API enabled and
 * the service-account email granted Viewer on the GA4 property. To turn
 * this on:
 *
 *   1. Create a service account in Google Cloud, enable "Google Analytics
 *      Data API", download the JSON key.
 *   2. In GA4 Admin → Property Access Management, add the service-account
 *      email as a Viewer.
 *   3. Add to Vercel:
 *        GOOGLE_ANALYTICS_PROPERTY_ID   (numeric GA4 property id)
 *        GA4_SERVICE_ACCOUNT_JSON       (the full service-account JSON, or
 *                                        GA4_CLIENT_EMAIL + GA4_PRIVATE_KEY)
 *   4. `npm i google-auth-library`, mint an access token with scope
 *      https://www.googleapis.com/auth/analytics.readonly, then POST to
 *      properties/${GOOGLE_ANALYTICS_PROPERTY_ID}:runReport with
 *      { dateRanges:[{startDate:'7daysAgo',endDate:'yesterday'}],
 *        metrics:[{name:'sessions'},{name:'conversions'}] } and read
 *      response.rows[0].metricValues.
 *
 * Until GOOGLE_ANALYTICS_PROPERTY_ID is present we return null so callers
 * render the "GA4 not wired" hint instead of erroring.
 */
export async function getGa4Report(): Promise<Ga4Report | null> {
  const propertyId = process.env.GOOGLE_ANALYTICS_PROPERTY_ID;
  if (!propertyId) return null;

  // Credentials present? Without a service-account credential we can't mint
  // the OAuth2 token the Data API needs, so bail rather than half-call it.
  const hasCreds =
    !!process.env.GA4_SERVICE_ACCOUNT_JSON ||
    (!!process.env.GA4_CLIENT_EMAIL && !!process.env.GA4_PRIVATE_KEY);
  if (!hasCreds) {
    console.warn(
      '[posthog-insights] GOOGLE_ANALYTICS_PROPERTY_ID set but no GA4 service-account credentials — skipping GA4.',
    );
    return null;
  }

  // TODO(ga4): implement the runReport call here once google-auth-library is
  // added (see doc-comment above). Intentionally a no-op for now so the
  // /analytics command and morning brief never depend on GA4 being live.
  return null;
}
