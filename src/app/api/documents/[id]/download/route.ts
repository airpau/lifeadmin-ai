// GET /api/documents/[id]/download: a short-lived signed URL for one of
// the user's own documents. ?mode=view opens PDFs and images in the
// browser; everything else (and HTML email snapshots always) downloads.

import { NextRequest, NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';
import { getOwnedDocument } from '@/lib/documents/query';
import { signedDocumentUrl } from '@/lib/documents/store';

export const runtime = 'nodejs';

const VIEWABLE = new Set(['application/pdf', 'image/jpeg', 'image/png', 'image/webp']);

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (isResponse(user)) return user;
  const admin = documentsAdmin();

  const doc = await getOwnedDocument(admin, user.id, id);
  if (!doc || !doc.storage_path) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

  const view = req.nextUrl.searchParams.get('mode') === 'view' && VIEWABLE.has(doc.mime_type);
  const expiresIn = 120;
  const url = await signedDocumentUrl(admin, doc.storage_path, { expiresIn, downloadName: view ? null : doc.filename });
  if (!url) return NextResponse.json({ error: 'Could not prepare the download. Please try again.' }, { status: 500 });

  return NextResponse.json({ url, expiresIn }, { headers: { 'Cache-Control': 'private, no-store' } });
}
