// POST /api/documents/packs/[id]/build: build the pack's ZIP (index PDF
// plus the original files) and store it in the private documents bucket.
//
// Plan: Free builds 1 pack a calendar month, Essential and above as many
// as they like (PlanLimits.packBuildsPerMonth). The check and the "one
// build of this pack at a time" lock are taken together, atomically, by
// document_pack_claim_build(). A build that fails gives the Free
// allowance back. Rebuilding a pack already counted this month is free.
//
// Runs inside the request: maxDuration 300, with a 240 second build
// budget so a slow pack fails cleanly with a message.

import { NextRequest, NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';
import { UPGRADE_COPY, getDocumentEntitlements } from '@/lib/documents/plan';
import { getPackDefinition } from '@/lib/documents/packs/registry';
import { previewPack } from '@/lib/documents/packs/load';
import { BUILD_STALE_SECONDS, PACK_COLUMNS, getOwnedPack, publicPack, splitParams, type PackRow } from '@/lib/documents/packs/rows';
import { PackBuildError, buildPackBundle } from '@/lib/documents/packs/build';

export const runtime = 'nodejs';
export const maxDuration = 300;

const BUILD_BUDGET_MS = 240_000;

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const startedAt = Date.now();
  const { id } = await params;
  const user = await requireUser();
  if (isResponse(user)) return user;
  const admin = documentsAdmin();

  const pack = await getOwnedPack(admin, user.id, id);
  if (!pack) return NextResponse.json({ error: 'Pack not found.' }, { status: 404 });
  const def = getPackDefinition(pack.pack_type);
  if (!def) return NextResponse.json({ error: 'This pack type is no longer available.' }, { status: 400 });

  // Check the options and the documents BEFORE using a build.
  const { options, manual } = splitParams(pack.params);
  let r;
  try {
    r = await previewPack(admin, user.id, def, options, manual);
  } catch (err) {
    console.error('[documents.packs.build] preview failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Could not check your documents. Please try again.' }, { status: 500 });
  }
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  const preview = r.preview;
  if (preview.selection.selected.length === 0 && !(preview.ctx.dispute?.correspondence.length)) {
    return NextResponse.json({ error: 'There is nothing to put in this pack yet. Add some documents first.' }, { status: 400 });
  }

  const ent = await getDocumentEntitlements(user.id);
  const { data: claim, error: claimErr } = await admin.rpc('document_pack_claim_build', {
    p_user_id: user.id,
    p_pack_id: pack.id,
    p_monthly_limit: ent.packBuildsPerMonth,
    p_stale_seconds: BUILD_STALE_SECONDS,
  });
  const c = (claim ?? {}) as { result?: string; counted?: boolean; prev_counted_build_at?: string | null };
  if (claimErr || !c.result) {
    console.error('[documents.packs.build] claim failed:', claimErr?.message);
    return NextResponse.json({ error: 'Building packs is temporarily unavailable. Please try again shortly.' }, { status: 503 });
  }
  if (c.result === 'not_found') return NextResponse.json({ error: 'Pack not found.' }, { status: 404 });
  if (c.result === 'busy') return NextResponse.json({ error: 'This pack is already being built. It will be ready in a moment.', alreadyRunning: true }, { status: 409 });
  if (c.result === 'quota') {
    return NextResponse.json(
      { error: UPGRADE_COPY.packBuilds(ent.packBuildsPerMonth ?? 1), upgradeRequired: true, minimumPlan: 'essential', upgradeUrl: '/pricing' },
      { status: 403 },
    );
  }

  try {
    const built = await buildPackBundle(admin, {
      userId: user.id,
      packId: pack.id,
      title: pack.title,
      def,
      preview,
      deadlineAt: startedAt + BUILD_BUDGET_MS,
      previousPath: pack.storage_path,
    });
    const { data, error } = await admin
      .from('document_packs')
      .update({
        status: 'ready',
        storage_path: built.storagePath,
        size_bytes: built.sizeBytes,
        file_count: built.fileCount,
        generated_at: new Date().toISOString(),
        document_ids: preview.selection.selected.map((d) => d.id),
        missing: preview.missing,
        checklist: preview.checklist,
        error: built.skipped ? `${built.skipped} file${built.skipped === 1 ? '' : 's'} could not be read and ${built.skipped === 1 ? 'was' : 'were'} left out.` : null,
      })
      .eq('id', pack.id)
      .eq('user_id', user.id)
      .select(PACK_COLUMNS)
      .single();
    if (error || !data) throw new PackBuildError(`save failed: ${error?.message}`, 'The pack was built but could not be saved. Please try again.');
    return NextResponse.json({ pack: publicPack(data as PackRow), skipped: built.skipped });
  } catch (err) {
    const message = err instanceof PackBuildError ? err.userMessage : 'Something went wrong building the pack. Please try again.';
    console.error('[documents.packs.build] failed:', err instanceof Error ? err.message : err);
    await admin
      .from('document_packs')
      .update({
        status: 'failed',
        error: message,
        // A failed build does not use the Free allowance.
        ...(c.counted ? { counted_build_at: c.prev_counted_build_at ?? null } : {}),
      })
      .eq('id', pack.id)
      .eq('user_id', user.id);
    return NextResponse.json({ error: message }, { status: err instanceof PackBuildError ? 422 : 500 });
  }
}
