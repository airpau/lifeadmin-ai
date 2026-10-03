// DELETE /api/documents/share-links/[id]: revoke one share link now.
// Revocation is not gated by plan, so a user who has downgraded can
// still switch off a link they made while on Pro.

import { NextRequest, NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';

export const runtime = 'nodejs';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (isResponse(user)) return user;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Share link not found.' }, { status: 404 });

  const { data, error } = await documentsAdmin()
    .from('document_share_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', user.id)
    .is('revoked_at', null)
    .select('id');
  if (error) return NextResponse.json({ error: 'Could not revoke that link. Please try again.' }, { status: 500 });
  if (!data || data.length === 0) return NextResponse.json({ error: 'Share link not found or already revoked.' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
