// GET /api/shared/pack/[token]/download: public download of ONE document
// pack for the holder of a pack share link. Re-checks the token (hash,
// expiry, revocation, that it is a pack link, that the owner is still on
// a plan with pack sharing) and that the pack is built and not deleted,
// then redirects to a 60 second signed storage URL. Rate limited per IP.

import { NextRequest, NextResponse } from 'next/server';
import { documentsAdmin } from '@/lib/documents/route-helpers';
import { clientIp, resolveShareToken, touchShareLink } from '@/lib/documents/share-links';
import { checkIpRateLimit } from '@/lib/rate-limit';
import { signedDocumentUrl } from '@/lib/documents/store';
import { packZipName } from '@/lib/documents/packs/build';

export const runtime = 'nodejs';

const NO_STORE = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow' };

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rl = await checkIpRateLimit(clientIp(req.headers), 'shared-pack-download', 30);
  if (!rl.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please wait a minute.' }, { status: 429, headers: { ...NO_STORE, 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } });
  }

  const admin = documentsAdmin();
  const r = await resolveShareToken(admin, token, 'pack');
  if (!r.ok || !r.link.packId) return NextResponse.json({ error: 'This link has expired or been switched off.' }, { status: 404, headers: NO_STORE });

  const { data: pack } = await admin
    .from('document_packs')
    .select('title, status, storage_path')
    .eq('id', r.link.packId)
    .eq('user_id', r.link.userId)
    .is('deleted_at', null)
    .maybeSingle();
  const path = (pack?.storage_path as string | null) ?? null;
  if (!pack || pack.status !== 'ready' || !path || !path.startsWith(`${r.link.userId}/packs/`)) {
    return NextResponse.json({ error: 'This pack is not available right now.' }, { status: 404, headers: NO_STORE });
  }

  const url = await signedDocumentUrl(admin, path, { expiresIn: 60, downloadName: packZipName(pack.title as string) });
  if (!url) return NextResponse.json({ error: 'Could not prepare the download.' }, { status: 500, headers: NO_STORE });
  void touchShareLink(admin, r.link.linkId);
  return NextResponse.redirect(url, { status: 302, headers: NO_STORE });
}
