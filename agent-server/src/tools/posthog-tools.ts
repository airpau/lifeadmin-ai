interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, any>;
  handler: (args: any, agentRole: string) => Promise<string>;
}

const POSTHOG_HOST = process.env.POSTHOG_HOST || 'https://eu.posthog.com';
const POSTHOG_KEY = process.env.POSTHOG_PERSONAL_API_KEY || '';

const getRecentVisitors: ToolDef = {
  name: 'posthog_get_recent_visitors',
  description: 'Get recent website visitors and page views from PostHog analytics. Shows which pages were visited, referrer sources, and device info.',
  schema: {
    type: 'object',
    properties: {
      limit: { type: 'number', default: 20, description: 'Number of events to retrieve' },
    },
  },
  handler: async (args) => {
    if (!POSTHOG_KEY) return 'POSTHOG_PERSONAL_API_KEY not configured.';

    try {
      const res = await fetch(`${POSTHOG_HOST}/api/projects/@current/events/?limit=${args.limit || 20}&order=-timestamp`, {
        headers: { 'Authorization': `Bearer ${POSTHOG_KEY}` },
      });
      const data: any = await res.json();

      if (!data.results || data.results.length === 0) return 'No recent events found.';

      const events = data.results.map((e: any) => {
        const props = e.properties || {};
        const person = e.person?.properties || {};
        return {
          event: e.event,
          url: props.$current_url || '?',
          referrer: props.$referrer || 'direct',
          browser: props.$browser || '?',
          screen: `${props.$screen_width || '?'}x${props.$screen_height || '?'}`,
          country: props.$geoip_country_name || '?',
          city: props.$geoip_city_name || '?',
          email: person.email || 'anonymous',
          time: e.timestamp?.substring(0, 19) || '?',
        };
      });

      // Filter out Vercel build previews (800x600 from Ashburn)
      const real = events.filter((e: any) => !e.url.includes('vercel.app') && e.screen !== '800x600');

      if (real.length === 0) return 'No real visitor events found (only Vercel build previews detected).';

      return real.map((e: any) =>
        `${e.time} | ${e.event} | ${e.url.substring(0, 60)} | from: ${e.referrer.substring(0, 40)} | ${e.country}, ${e.city} | ${e.screen} | ${e.email}`
      ).join('\n');
    } catch (err: any) {
      return `PostHog error: ${err.message}`;
    }
  },
};

const getVisitorStats: ToolDef = {
  name: 'posthog_get_visitor_stats',
  description: 'Get visitor statistics: total page views, unique visitors, top pages, and traffic sources for a given period.',
  schema: {
    type: 'object',
    properties: {
      days: { type: 'number', default: 7, description: 'Number of days to look back' },
    },
  },
  handler: async (args) => {
    if (!POSTHOG_KEY) return 'POSTHOG_PERSONAL_API_KEY not configured.';

    try {
      const since = new Date(Date.now() - (args.days || 7) * 24 * 60 * 60 * 1000).toISOString();
      const res = await fetch(`${POSTHOG_HOST}/api/projects/@current/events/?limit=1000&after=${since}&event=$pageview`, {
        headers: { 'Authorization': `Bearer ${POSTHOG_KEY}` },
      });
      const data: any = await res.json();

      if (!data.results) return 'No data returned.';

      // Filter out Vercel previews
      const events = data.results.filter((e: any) => {
        const url = e.properties?.$current_url || '';
        const screen = `${e.properties?.$screen_width}x${e.properties?.$screen_height}`;
        return !url.includes('vercel.app') && screen !== '800x600';
      });

      const uniqueVisitors = new Set(events.map((e: any) => e.distinct_id)).size;

      // Top pages
      const pages: Record<string, number> = {};
      events.forEach((e: any) => {
        const path = e.properties?.$pathname || '/';
        pages[path] = (pages[path] || 0) + 1;
      });

      // Top referrers
      const referrers: Record<string, number> = {};
      events.forEach((e: any) => {
        const ref = e.properties?.$referrer || 'direct';
        const source = ref === '' ? 'direct' : ref.substring(0, 50);
        referrers[source] = (referrers[source] || 0) + 1;
      });

      // Google Ads clicks
      const adClicks = events.filter((e: any) => (e.properties?.$current_url || '').includes('gclid=')).length;

      const topPages = Object.entries(pages).sort((a, b) => b[1] - a[1]).slice(0, 10);
      const topRefs = Object.entries(referrers).sort((a, b) => b[1] - a[1]).slice(0, 5);

      return `Visitor Stats (last ${args.days || 7} days):
- Total page views: ${events.length}
- Unique visitors: ${uniqueVisitors}
- Google Ads clicks: ${adClicks}

Top Pages:
${topPages.map(([p, c]) => `  ${p}: ${c} views`).join('\n')}

Top Referrers:
${topRefs.map(([r, c]) => `  ${r}: ${c}`).join('\n')}`;
    } catch (err: any) {
      return `PostHog error: ${err.message}`;
    }
  },
};

export const posthogTools: ToolDef[] = [getRecentVisitors, getVisitorStats];
