// GET /api/documents/packs/disputes: the user's disputes, for choosing
// which one an evidence bundle is for. Read only, a few fields, newest
// first. Every plan.

import { NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';

export const runtime = 'nodejs';

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { data, error } = await documentsAdmin()
    .from('disputes')
    .select('id, provider_name, issue_type, status, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: 'Could not load your disputes.' }, { status: 500 });
  return NextResponse.json({ disputes: data ?? [] }, { headers: { 'Cache-Control': 'private, no-store' } });
}
