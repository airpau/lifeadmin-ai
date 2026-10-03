// GET /api/documents/[id]/warranty/ics: a calendar file with reminders
// before a warranty or guarantee runs out (30, 7 and 1 days before, the
// same .ics builder as the other document reminders). Essential and
// above (PlanLimits.warrantyReminders).

import { NextRequest, NextResponse } from 'next/server';
import { appBaseUrl, documentsAdmin, isResponse, requireUser, upgradeRequired } from '@/lib/documents/route-helpers';
import { getOwnedDocument } from '@/lib/documents/query';
import { UPGRADE_COPY, getDocumentEntitlements } from '@/lib/documents/plan';
import { londonToday } from '@/lib/documents/dates';
import { buildDocumentIcs } from '@/lib/documents/ics';
import { sanitizeFilename } from '@/lib/documents/attachments';
import { contentDisposition } from '@/lib/documents/content-disposition';
import { warrantyWhat, WARRANTY_LABEL } from '@/lib/documents/warranty';

export const runtime = 'nodejs';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (isResponse(user)) return user;
  const ent = await getDocumentEntitlements(user.id);
  if (!ent.warrantyReminders) return upgradeRequired(UPGRADE_COPY.warrantyReminders, 'essential');

  const doc = await getOwnedDocument(documentsAdmin(), user.id, id);
  if (!doc) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  if (!doc.warranty_until || doc.warranty_until <= londonToday()) {
    return NextResponse.json({ error: 'This document has no warranty end date still to come.' }, { status: 400 });
  }

  const what = warrantyWhat(doc);
  const nice = new Date(`${doc.warranty_until}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
  const link = `${appBaseUrl()}/dashboard/documents?doc=${doc.id}`;
  const ics = buildDocumentIcs({
    uid: `${doc.id}-warranty`,
    keyDate: doc.warranty_until,
    label: WARRANTY_LABEL,
    what,
    description: [
      `Cover ends on ${nice}.`,
      doc.warranty_note,
      'If anything is wrong with it, contact the seller or maker before then. Keep the receipt: it is in your Paybacker vault.',
      `Open it in Paybacker: ${link}`,
    ]
      .filter(Boolean)
      .join('\n'),
    url: link,
  });
  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': contentDisposition(sanitizeFilename(`Paybacker warranty ${what} ${doc.warranty_until}.ics`)),
      'Cache-Control': 'private, no-store',
    },
  });
}
