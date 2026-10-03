// GET /api/shared/register/[token]/download/[docId]: public, read-only
// download for the holder of an accountant share link. Checks the token
// (hash, expiry, revocation, owner still on a plan with the register),
// that the document belongs to the link's owner and is active, then
// redirects to a 60 second signed storage URL. Rate limited per IP.

import { NextRequest, NextResponse } from 'next/server';
import { documentsAdmin } from '@/lib/documents/route-helpers';
import { clientIp, resolveShareToken } from '@/lib/documents/share-links';
import { checkIpRateLimit } from '@/lib/rate-limit';
import { signedDocumentUrl } from '@/lib/documents/store';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' };

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string; docId: string }> }) {
  const { token, docId } = await params;

  const rl = await checkIpRateLimit(clientIp(req.headers), 'shared-register-download', 60);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } });
  }

  const admin = documentsAdmin();
  const r = await resolveShareToken(admin, token);
  if (!r.ok) return NextResponse.json({ error: 'This link has expired or been switched off.' }, { status: 404, headers: NO_STORE });
  if (!/^[0-9a-f-]{36}$/i.test(docId)) return NextResponse.json({ error: 'Not found.' }, { status: 404, headers: NO_STORE });

  const { data: doc } = await admin
    .from('documents')
    .select('storage_path, filename')
    .eq('id', docId)
    .eq('user_id', r.link.userId)
    .eq('status', 'active')
    .maybeSingle();
  if (!doc?.storage_path) return NextResponse.json({ error: 'Not found.' }, { status: 404, headers: NO_STORE });

  const url = await signedDocumentUrl(admin, doc.storage_path as string, { expiresIn: 60, downloadName: doc.filename as string });
  if (!url) return NextResponse.json({ error: 'Could not prepare the download.' }, { status: 500, headers: NO_STORE });
  return NextResponse.redirect(url, { status: 302, headers: NO_STORE });
}
