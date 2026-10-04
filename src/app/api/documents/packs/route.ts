// GET  /api/documents/packs: the user's packs, newest first.
// POST /api/documents/packs: save a new pack as a draft. Every plan (the
//      build is what is limited). Body:
//        { pack_type, params, title?, added_ids?, removed_ids? }
//      The options are validated by the pack definition and the checklist
//      is worked out straight away, so the draft shows found and missing
//      items. Nothing is built here.

import { NextRequest, NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';
import { getPackDefinition } from '@/lib/documents/packs/registry';
import { previewPack } from '@/lib/documents/packs/load';
import { PACK_COLUMNS, cleanTitle, previewBody, publicPack, type PackRow } from '@/lib/documents/packs/rows';

export const runtime = 'nodejs';

/** Most packs a user keeps at once (soft-deleted ones do not count). */
const MAX_PACKS = 50;

export async function GET() {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const { data, error } = await documentsAdmin()
    .from('document_packs')
    .select(PACK_COLUMNS)
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(MAX_PACKS);
  if (error) return NextResponse.json({ error: 'Could not load your packs.' }, { status: 500 });
  return NextResponse.json({ packs: ((data as PackRow[] | null) ?? []).map(publicPack) }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const def = getPackDefinition(body.pack_type);
  if (!def) return NextResponse.json({ error: 'Choose a pack type.' }, { status: 400 });
  const admin = documentsAdmin();

  const { count } = await admin
    .from('document_packs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .is('deleted_at', null);
  if ((count ?? 0) >= MAX_PACKS) {
    return NextResponse.json({ error: `You can keep up to ${MAX_PACKS} packs. Delete one you no longer need first.` }, { status: 400 });
  }

  let r;
  try {
    r = await previewPack(admin, user.id, def, body.params, { added_ids: body.added_ids, removed_ids: body.removed_ids });
  } catch (err) {
    console.error('[documents.packs.create] preview failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not check your documents for this pack. Please try again.' }, { status: 500 });
  }
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const p = r.preview;

  const { data, error } = await admin
    .from('document_packs')
    .insert({
      user_id: user.id,
      pack_type: def.type,
      title: cleanTitle(body.title, p.title),
      params: { ...(p.params as Record<string, unknown>), added_ids: p.manual.added_ids, removed_ids: p.manual.removed_ids },
      status: 'draft',
      document_ids: p.selection.selected.map((d) => d.id),
      missing: p.missing,
      checklist: p.checklist,
    })
    .select(PACK_COLUMNS)
    .single();
  if (error || !data) {
    console.error('[documents.packs.create] insert failed:', error?.message);
    return NextResponse.json({ error: 'Could not save the pack. Please try again.' }, { status: 500 });
  }
  return NextResponse.json({ pack: publicPack(data as PackRow), preview: previewBody(p) }, { status: 201 });
}
