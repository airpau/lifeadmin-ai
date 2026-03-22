import { NextRequest, NextResponse } from 'next/server';

const POSTHOG_KEY = 'phc_GNRV5alJCSp3SMcZzo4BgdTy0HcbttVIH4hakfBjv97';
const POSTHOG_HOST = 'https://eu.i.posthog.com';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { event, properties, distinct_id } = body;

    if (!event) {
      return NextResponse.json({ error: 'event required' }, { status: 400 });
    }

    // Forward to PostHog server-side — guaranteed delivery, no ad blockers
    const res = await fetch(`${POSTHOG_HOST}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: POSTHOG_KEY,
        event,
        properties: {
          distinct_id: distinct_id || 'anonymous',
          ...properties,
        },
      }),
    });

    const result = await res.text();
    return NextResponse.json({ ok: true, status: result });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
