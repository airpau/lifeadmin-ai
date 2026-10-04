// GET /api/documents/packs/[id]/download: a short-lived signed URL for a
// built pack's ZIP. Every plan (Free users can download the pack they
// built). A pack ZIP can be up to 100 MB, which is far over what a
// function may return, so the browser fetches it from storage directly.
//
// Storage sets the Content-Disposition on a signed URL itself and only
// takes a plain name, so the name is reduced to ASCII with the same
// helper as every other download (content-disposition.ts asciiFilename).
// The response also carries the full Content-Disposition value (ASCII
// filename plus the UTF-8 filename* form) for clients that show it.

import { NextRequest, NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';
import { getOwnedPack } from '@/lib/documents/packs/rows';
import { signedDocumentUrl } from '@/lib/documents/store';
import { packZipName } from '@/lib/documents/packs/build';
import { contentDisposition } from '@/lib/documents/content-disposition';

export const runtime = 'nodejs';

const EXPIRES_IN = 300;

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (isResponse(user)) return user;
  const admin = documentsAdmin();
  const pack = await getOwnedPack(admin, user.id, id);
  if (!pack) return NextResponse.json({ error: 'Pack not found.' }, { status: 404 });
  if (pack.status !== 'ready' || !pack.storage_path) {
    return NextResponse.json({ error: 'Build the pack first, then download it.' }, { status: 400 });
  }
  const name = packZipName(pack.title);
  const url = await signedDocumentUrl(admin, pack.storage_path, { expiresIn: EXPIRES_IN, downloadName: name });
  if (!url) return NextResponse.json({ error: 'Could not prepare the download. Please try again.' }, { status: 500 });
  return NextResponse.json(
    { url, expiresIn: EXPIRES_IN, filename: name, contentDisposition: contentDisposition(name) },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
