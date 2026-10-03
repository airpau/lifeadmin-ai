// DELETE /api/documents/[id]: remove a document from the vault.
//
// Order matters: the row is soft deleted FIRST (status 'deleted', no
// storage path), so the document disappears from the vault, the register
// and share links at once even if storage then misbehaves. The stored
// file is removed after that (the user's own object only: the path comes
// from their own row and must sit under their user id); a failure there
// is logged and does not fail the request. The row is kept so automatic
// filing does not bring the same file straight back, and so this month's
// Free count still includes it. A copy already filed into the user's own
// Google Drive is theirs and is left alone.

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

  const { error } = await admin
    .from('documents')
    .update({ status: 'deleted', deleted_at: new Date().toISOString(), storage_path: null })
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: 'Could not delete that document. Please try again.' }, { status: 500 });

  if (doc.storage_path) {
    if (!doc.storage_path.startsWith(`${user.id}/`)) {
      console.error(`[documents] not removing object outside the user prefix for ${id}`);
    } else {
      const { error: rmErr } = await admin.storage.from(DOCUMENTS_BUCKET).remove([doc.storage_path]);
      if (rmErr) console.error(`[documents] storage remove failed for ${id} (row already deleted):`, rmErr.message);
    }
  }

  return NextResponse.json({ ok: true, driveCopyKept: !!doc.drive_link });
}
