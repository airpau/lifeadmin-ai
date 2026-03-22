import { NextRequest, NextResponse } from 'next/server';
import { findCancellationMethod } from '@/lib/cancellation-methods';

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get('provider');
  if (!provider) {
    return NextResponse.json({ error: 'provider param required' }, { status: 400 });
  }

  const info = findCancellationMethod(provider);
  return NextResponse.json({ info });
}
