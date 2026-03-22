import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const POSTHOG_HOST = 'https://eu.posthog.com';
const POSTHOG_PERSONAL_KEY = process.env.POSTHOG_PERSONAL_API_KEY!;

async function posthogQuery(path: string) {
  const res = await fetch(`${POSTHOG_HOST}/api/projects/@current${path}`, {
    headers: { Authorization: `Bearer ${POSTHOG_PERSONAL_KEY}` },
  });
  return res.json();
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const period = request.nextUrl.searchParams.get('period') || '7d';

  try {
    // Get recent events summary
    const events = await posthogQuery('/events/?limit=100&orderBy=-timestamp');

    // Count events by type
    const eventCounts: Record<string, number> = {};
    const uniqueUsers = new Set<string>();

    for (const e of events.results || []) {
      const name = e.event || 'unknown';
      eventCounts[name] = (eventCounts[name] || 0) + 1;
      if (e.distinct_id) uniqueUsers.add(e.distinct_id);
    }

    // Get persons count
    const persons = await posthogQuery('/persons/?limit=1');

    return NextResponse.json({
      period,
      generated: new Date().toISOString(),
      summary: {
        total_events_recent: events.results?.length || 0,
        unique_visitors_recent: uniqueUsers.size,
        total_persons: persons.count || 0,
      },
      event_breakdown: eventCounts,
      recent_events: (events.results || []).slice(0, 20).map((e: any) => ({
        event: e.event,
        distinct_id: e.distinct_id?.substring(0, 12) + '...',
        timestamp: e.timestamp?.substring(0, 19),
        url: e.properties?.$current_url || e.properties?.$pathname || null,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
