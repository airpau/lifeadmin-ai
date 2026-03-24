import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

/**
 * DEPRECATED: Agent execution has moved to the Railway agent server.
 * This cron is disabled (set to run once a year as a safety net).
 * All 15 agents now run via the Claude Agent SDK on Railway with
 * self-learning, autonomous tool use, and persistent memory.
 */
export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    status: 'deprecated',
    message: 'Agent execution has moved to Railway agent server. This cron is disabled.',
    railway_url: process.env.RAILWAY_URL || 'not configured',
  });
}
