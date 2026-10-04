// GET    /api/documents/packs/[id]: the pack with a fresh checklist (new
//        documents filed since it was made show up straight away).
// PATCH  /api/documents/packs/[id]: change the title, options or the
//        documents added or removed by hand. Body:
//          { title?, params?, added_ids?, removed_ids? }
//        A built pack goes back to draft until it is built again: the
//        old ZIP no longer matches, so it is not offered for download,
//        and it is replaced by the next build.
// DELETE /api/documents/packs/[id]: delete the ZIP, switch off the
//        pack's share links and remove the pack. Refused while a build
//        is running. The row is kept (soft
//        delete) so the Free monthly build allowance cannot be reset by
//        deleting.
// Every plan.

import { NextRequest, NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';
import { getPackDefinition } from '@/lib/documents/packs/registry';
import { previewPack } from '@/lib/documents/packs/load';
import { BUILD_STALE_SECONDS, PACK_COLUMNS, cleanTitle, getOwnedPack, previewBody, publicPack, splitParams, type PackRow } from '@/lib/documents/packs/rows';
import { DOCUMENTS_BUCKET } from '@/lib/documents/types';

export const runtime = 'nodejs';

type Params = { params: Promise<{ id: string }> };

/** A build is running (and not a crashed one past its lock time). */
function isBuilding(pack: PackRow): boolean {
  return pack.status === 'building' && !!pack.build_started_at && Date.now() - Date.parse(pack.build_started_at) < BUILD_STALE_SECONDS * 1000;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await requireUser();
  if (isResponse(user)) return user;
  const admin = documentsAdmin();
  const pack = await getOwnedPack(admin, user.id, id);
  if (!pack) return NextResponse.json({ error: 'Pack not found.' }, { status: 404 });
  const def = getPackDefinition(pack.pack_type);
  if (!def) return NextResponse.json({ pack: publicPack(pack), preview: null });

  const { options, manual } = splitParams(pack.params);
  try {
    const r = await previewPack(admin, user.id, def, options, manual);
    return NextResponse.json(
      { pack: publicPack(pack), preview: r.ok ? previewBody(r.preview) : null, previewError: r.ok ? null : r.error },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (err) {
    console.error('[documents.packs.get] preview failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ pack: publicPack(pack), preview: null, previewError: 'Could not check your documents. Please try again.' });
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await requireUser();
  if (isResponse(user)) return user;
  const admin = documentsAdmin();
  const pack = await getOwnedPack(admin, user.id, id);
  if (!pack) return NextResponse.json({ error: 'Pack not found.' }, { status: 404 });
  if (isBuilding(pack)) {
    return NextResponse.json({ error: 'This pack is being built. Try again in a moment.' }, { status: 409 });
  }
  const def = getPackDefinition(pack.pack_type);
  if (!def) return NextResponse.json({ error: 'This pack type is no longer available.' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const current = splitParams(pack.params);
  const options = body.params && typeof body.params === 'object' ? (body.params as Record<string, unknown>) : current.options;
  const manual = {
    added_ids: body.added_ids !== undefined ? body.added_ids : current.manual.added_ids,
    removed_ids: body.removed_ids !== undefined ? body.removed_ids : current.manual.removed_ids,
  };

  let r;
  try {
    r = await previewPack(admin, user.id, def, options, manual);
  } catch (err) {
    console.error('[documents.packs.patch] preview failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not check your documents. Please try again.' }, { status: 500 });
  }
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const p = r.preview;

  const { data, error } = await admin
    .from('document_packs')
    .update({
      title: body.title !== undefined ? cleanTitle(body.title, pack.title) : pack.title,
      params: { ...(p.params as Record<string, unknown>), added_ids: p.manual.added_ids, removed_ids: p.manual.removed_ids },
      document_ids: p.selection.selected.map((d) => d.id),
      missing: p.missing,
      checklist: p.checklist,
      // The ZIP no longer matches: it must be built again.
      status: 'draft',
      error: null,
    })
    .eq('id', pack.id)
    .eq('user_id', user.id)
    .select(PACK_COLUMNS)
    .single();
  if (error || !data) return NextResponse.json({ error: 'Could not save your changes. Please try again.' }, { status: 500 });
  return NextResponse.json({ pack: publicPack(data as PackRow), preview: previewBody(p) });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await requireUser();
  if (isResponse(user)) return user;
  const admin = documentsAdmin();
  const pack = await getOwnedPack(admin, user.id, id);
  if (!pack) return NextResponse.json({ error: 'Pack not found.' }, { status: 404 });
  if (isBuilding(pack)) {
    return NextResponse.json({ error: 'This pack is being built. Delete it when the build has finished.' }, { status: 409 });
  }

  const now = new Date().toISOString();
  // Links first, so nobody can open the pack while it is being removed.
  await admin.from('document_share_links').update({ revoked_at: now }).eq('user_id', user.id).eq('pack_id', pack.id).is('revoked_at', null);
  const { error } = await admin
    .from('document_packs')
    .update({ deleted_at: now, storage_path: null, status: 'draft' })
    .eq('id', pack.id)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: 'Could not delete the pack. Please try again.' }, { status: 500 });
  if (pack.storage_path && pack.storage_path.startsWith(`${user.id}/packs/`)) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([pack.storage_path]);
  }
  return NextResponse.json({ ok: true });
}
