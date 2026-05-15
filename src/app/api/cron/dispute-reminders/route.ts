import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  // Legacy cron retired — autonomous dispute-agent now handles all follow-ups
  return NextResponse.json({ ok: true, skipped: true, reason: 'Superseded by dispute-agent state machine' });
}
