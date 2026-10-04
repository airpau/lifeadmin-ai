// GET  /api/documents/packs/[id]/share: this pack's share links.
// POST /api/documents/packs/[id]/share: create a read-only link to this
//      pack only (for an accountant, a lender or an ombudsman). Body:
//      { label?, days? } (1 to 90, default 30). The link is shown ONCE;
//      only its SHA-256 hash and prefix are stored, in
//      document_share_links with pack_id set. A pack link can never open
//      the register, and a register link can never open a pack.
// Pro and above (PlanLimits.packSharing). Switching a link off uses the
// existing DELETE /api/documents/share-links/[id], on every plan.

import { NextRequest, NextResponse } from 'next/server';
import { appBaseUrl, documentsAdmin, isResponse, requireUser, upgradeRequired } from '@/lib/documents/route-helpers';
import { UPGRADE_COPY, getDocumentEntitlements } from '@/lib/documents/plan';
import { getOwnedPack } from '@/lib/documents/packs/rows';
import { SHARE_LINK_MAX_ACTIVE, clampShareDays, generateShareToken, shareLinkStatus } from '@/lib/documents/share-token';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await requireUser();
  if (isResponse(user)) return user;
  const admin = documentsAdmin();
  const pack = await getOwnedPack(admin, user.id, id);
  if (!pack) return NextResponse.json({ error: 'Pack not found.' }, { status: 404 });
  const ent = await getDocumentEntitlements(user.id);
  if (!ent.packSharing) return upgradeRequired(UPGRADE_COPY.packSharing, 'pro');

  const { data, error } = await admin
    .from('document_share_links')
    .select('id, token_prefix, label, expires_at, revoked_at, last_used_at, use_count, created_at')
    .eq('user_id', user.id)
    .eq('pack_id', pack.id)
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: 'Could not load the links for this pack.' }, { status: 500 });
  return NextResponse.json({
    links: (data ?? []).map((l) => ({ ...l, status: shareLinkStatus({ expires_at: l.expires_at, revoked_at: l.revoked_at }) })),
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await requireUser();
  if (isResponse(user)) return user;
  const admin = documentsAdmin();
  const ent = await getDocumentEntitlements(user.id);
  if (!ent.packSharing) return upgradeRequired(UPGRADE_COPY.packSharing, 'pro');

  const pack = await getOwnedPack(admin, user.id, id);
  if (!pack) return NextResponse.json({ error: 'Pack not found.' }, { status: 404 });
  if (pack.status !== 'ready' || !pack.storage_path) {
    return NextResponse.json({ error: 'Build the pack first, then share it.' }, { status: 400 });
  }

  const body = (await req.json().catch(() => ({}))) as { label?: unknown; days?: unknown };
  const label = typeof body.label === 'string' ? body.label.replace(/\s+/g, ' ').trim().slice(0, 80) || null : null;
  const days = clampShareDays(body.days);

  const { count } = await admin
    .from('document_share_links')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('pack_id', pack.id)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString());
  if ((count ?? 0) >= SHARE_LINK_MAX_ACTIVE) {
    return NextResponse.json({ error: `A pack can have up to ${SHARE_LINK_MAX_ACTIVE} active links. Switch one off first.` }, { status: 400 });
  }

  const t = generateShareToken();
  const { data, error } = await admin
    .from('document_share_links')
    .insert({
      user_id: user.id,
      pack_id: pack.id,
      token_prefix: t.prefix,
      token_hash: t.hash,
      label,
      expires_at: new Date(Date.now() + days * 86_400_000).toISOString(),
    })
    .select('id, token_prefix, label, expires_at, created_at')
    .single();
  if (error || !data) return NextResponse.json({ error: 'Could not create the link. Please try again.' }, { status: 500 });

  return NextResponse.json(
    { link: { ...data, status: 'active' }, url: `${appBaseUrl()}/shared/pack/${t.plaintext}`, shownOnce: true },
    { headers: { 'Cache-Control': 'private, no-store' } },
  );
}
