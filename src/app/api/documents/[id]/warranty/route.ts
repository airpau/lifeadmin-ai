// PATCH /api/documents/[id]/warranty: set or correct a document's
// warranty or guarantee. Every plan. Body, any of:
//   { warranty_until: 'YYYY-MM-DD' | null }   the last covered day
//   { months: number }                         or a length, counted from
//                                              the purchase date
//   { warranty_note: string | null }           what it covers
// warranty_until null clears the warranty (and its note).

import { NextRequest, NextResponse } from 'next/server';
import { documentsAdmin, isResponse, requireUser } from '@/lib/documents/route-helpers';
import { getOwnedDocument } from '@/lib/documents/query';
import { validIsoDate } from '@/lib/documents/classify';
import { cleanWarrantyNote, computeWarrantyUntil, parseWarrantyMonths, purchaseDateOf } from '@/lib/documents/warranty';

export const runtime = 'nodejs';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (isResponse(user)) return user;
  const admin = documentsAdmin();
  const doc = await getOwnedDocument(admin, user.id, id);
  if (!doc) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const update: Record<string, string | null> = {};

  if ('warranty_until' in body) {
    if (body.warranty_until === null || body.warranty_until === '') {
      update.warranty_until = null;
      update.warranty_note = null;
    } else {
      const d = validIsoDate(body.warranty_until);
      if (!d) return NextResponse.json({ error: 'Enter the date the warranty ends.' }, { status: 400 });
      update.warranty_until = d;
    }
  } else if ('months' in body) {
    const months = parseWarrantyMonths(body.months);
    if (!months) return NextResponse.json({ error: 'Enter the warranty length in months (1 to 300).' }, { status: 400 });
    const until = computeWarrantyUntil(purchaseDateOf(doc), months);
    if (!until) return NextResponse.json({ error: 'This document has no purchase date to count from. Enter the end date instead.' }, { status: 400 });
    update.warranty_until = until;
  }
  if ('warranty_note' in body && update.warranty_until !== null) {
    update.warranty_note = cleanWarrantyNote(body.warranty_note);
  }
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 });

  // A changed date makes any Todoist warranty task out of date.
  if ('warranty_until' in update && update.warranty_until !== doc.warranty_until) update.warranty_todoist_task_id = null;

  const { error } = await admin.from('documents').update(update).eq('id', doc.id).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: 'Could not save the warranty. Please try again.' }, { status: 500 });
  return NextResponse.json({
    ok: true,
    warranty_until: 'warranty_until' in update ? update.warranty_until : doc.warranty_until,
    warranty_note: 'warranty_note' in update ? update.warranty_note : doc.warranty_note,
  });
}
