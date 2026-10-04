// POST /api/documents/packs/preview: what a pack would contain, without
// saving or building anything. Every plan. Body:
//   { pack_type, params, added_ids?, removed_ids? }
// Returns the checklist (found and missing), the documents that would go
// in, anything left out (identity documents) and the timeline.

import { NextRequest, NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';
import { getPackDefinition } from '@/lib/documents/packs/registry';
import { previewPack } from '@/lib/documents/packs/load';
import { previewBody } from '@/lib/documents/packs/rows';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const user = await requireUser();
  if (isResponse(user)) return user;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const def = getPackDefinition(body.pack_type);
  if (!def) return NextResponse.json({ error: 'Choose a pack type.' }, { status: 400 });

  try {
    const r = await previewPack(documentsAdmin(), user.id, def, body.params, { added_ids: body.added_ids, removed_ids: body.removed_ids });
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
    return NextResponse.json({ pack_type: def.type, ...previewBody(r.preview) }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (err) {
    console.error('[documents.packs.preview] failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not check your documents for this pack. Please try again.' }, { status: 500 });
  }
}
