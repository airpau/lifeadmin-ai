import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// TEMPORARILY DISABLED for Awin testing — re-enable after Oscar signs off
// When re-enabling, restore the full implementation from git history (commit a266c89)

export async function GET() {
  return NextResponse.json({ limit: 25, claimed: 0, remaining: 0, active: false, tier: 'pro', days: 30 });
}

export async function POST(_request: NextRequest) {
  return NextResponse.json({ claimed: false, reason: 'Founding member programme paused for testing' });
}
