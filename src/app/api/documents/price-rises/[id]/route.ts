// PATCH /api/documents/price-rises/[id]: dismiss a price rise the vault
// found. Body: { status: 'dismissed' | 'active' }. Not plan gated, so a
// user who has downgraded can still tidy up. A linked price increase
// alert on the dashboard is left as it is: the user manages that one
// where it is shown.

import { NextRequest, NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (isResponse(user)) return user;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { status?: unknown };
  const status = body.status === 'active' ? 'active' : body.status === 'dismissed' ? 'dismissed' : null;
  if (!status) return NextResponse.json({ error: 'Status must be dismissed or active.' }, { status: 400 });

  const { data, error } = await documentsAdmin()
    .from('document_price_rises')
    .update({ status })
    .eq('id', id)
    .eq('user_id', user.id)
    .select('id, status');
  if (error) return NextResponse.json({ error: 'Could not update that price rise.' }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return NextResponse.json({ ok: true, status });
}
