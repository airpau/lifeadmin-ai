// GET  /api/documents/share-links: the user's accountant share links.
// POST /api/documents/share-links: create one. Body: { label?, days? }
//      (days 1 to 90, default 30). The full link is returned ONCE; only
//      a SHA-256 hash and prefix are stored.
// Pro and above (PlanLimits.accountantRegister). Register links only:
// document pack links (pack_id set) are listed and created under
// /api/documents/packs/[id]/share.

import { NextRequest, NextResponse } from 'next/server';
import { appBaseUrl, documentsAdmin, isResponse, requireUser, upgradeRequired } from '@/lib/documents/route-helpers';
import { UPGRADE_COPY, getDocumentEntitlements } from '@/lib/documents/plan';
import { isMissingColumnError } from '@/lib/documents/types';
import { SHARE_LINK_MAX_ACTIVE, clampShareDays, generateShareToken, shareLinkStatus } from '@/lib/documents/share-token';

export const runtime = 'nodejs';

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const ent = await getDocumentEntitlements(user.id);
  if (!ent.accountantRegister) return upgradeRequired(UPGRADE_COPY.register, 'pro');

  const list = (registerOnly: boolean) => {
    let q = documentsAdmin()
      .from('document_share_links')
      .select('id, token_prefix, label, expires_at, revoked_at, last_used_at, use_count, created_at')
      .eq('user_id', user.id);
    if (registerOnly) q = q.is('pack_id', null);
    return q.order('created_at', { ascending: false }).limit(50);
  };
  let { data, error } = await list(true);
  // Before the stage three migration there is no pack_id: every link is a register link.
  if (isMissingColumnError(error)) ({ data, error } = await list(false));
  if (error) return NextResponse.json({ error: 'Could not load your share links.' }, { status: 500 });
  return NextResponse.json({
    links: (data ?? []).map((l) => ({ ...l, status: shareLinkStatus({ expires_at: l.expires_at, revoked_at: l.revoked_at }) })),
  });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const ent = await getDocumentEntitlements(user.id);
  if (!ent.accountantRegister) return upgradeRequired(UPGRADE_COPY.register, 'pro');

  const body = (await req.json().catch(() => ({}))) as { label?: unknown; days?: unknown };
  const label = typeof body.label === 'string' ? body.label.replace(/\s+/g, ' ').trim().slice(0, 80) || null : null;
  const days = clampShareDays(body.days);
  const admin = documentsAdmin();

  const active = (registerOnly: boolean) => {
    let q = admin
      .from('document_share_links')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('revoked_at', null)
      .gt('expires_at', new Date().toISOString());
    if (registerOnly) q = q.is('pack_id', null);
    return q;
  };
  let { count, error: countErr } = await active(true);
  if (isMissingColumnError(countErr)) ({ count, error: countErr } = await active(false));
  if ((count ?? 0) >= SHARE_LINK_MAX_ACTIVE) {
    return NextResponse.json({ error: `You can have up to ${SHARE_LINK_MAX_ACTIVE} active share links. Revoke one first.` }, { status: 400 });
  }

  const t = generateShareToken();
  const expiresAt = new Date(Date.now() + days * 86_400_000).toISOString();
  const { data, error } = await admin
    .from('document_share_links')
    .insert({ user_id: user.id, token_prefix: t.prefix, token_hash: t.hash, label, expires_at: expiresAt })
    .select('id, token_prefix, label, expires_at, created_at')
    .single();
  if (error || !data) return NextResponse.json({ error: 'Could not create the share link. Please try again.' }, { status: 500 });

  return NextResponse.json(
    { link: { ...data, status: 'active' }, url: `${appBaseUrl()}/shared/register/${t.plaintext}`, shownOnce: true },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
