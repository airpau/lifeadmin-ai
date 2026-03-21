import { NextRequest, NextResponse } from 'next/server';
// NOTE: This route is DISABLED — social posts now use templates (zero Claude API cost)

export async function POST(request: NextRequest) {
  return NextResponse.json({ error: 'This endpoint is disabled. Social posts use templates.' }, { status: 410 });
}
