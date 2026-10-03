// DELETE /api/documents/[id]: remove a document from the vault.
//
// The stored file is deleted from the private bucket (the user's own
// object only: the path is read from their own row and must sit under
// their user id). The row is kept as status 'deleted' so that automatic
// filing does not bring the same file straight back, and so this
// month's Free quota still counts it. A copy already filed into the
// user's own Google Drive is theirs and is left alone.

import { NextRequest, NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';
import { getOwnedDocument } from '@/lib/documents/query';
import { DOCUMENTS_BUCKET } from '@/lib/documents/types';

export const runtime = 'nodejs';

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (isResponse(user)) return user;
  const admin = documentsAdmin();

  const doc = await getOwnedDocument(admin, user.id, id);
  if (!doc) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

  if (doc.storage_path) {
    if (!doc.storage_path.startsWith(`${user.id}/`)) {
      console.error(`[documents] refusing to delete object outside user prefix for ${id}`);
      return NextResponse.json({ error: 'Could not delete that document.' }, { status: 500 });
    }
    const { error: rmErr } = await admin.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path]);
    if (rmErr) {
      console.error('[documents] storage remove failed:', rmErr.message);
      return NextResponse.json({ error: 'Could not delete that document. Please try again.' }, { status: 500 });
    }
  }

  const { error } = await admin
    .from('documents')
    .update({ status: 'deleted', deleted_at: new Date().toISOString(), storage_path: null })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: 'Could not delete that document. Please try again.' }, { status: 500 });

  return NextResponse.json({ ok: true, driveCopyKept: !!doc.drive_link });
}
