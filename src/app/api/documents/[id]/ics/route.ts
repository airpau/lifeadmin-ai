// GET /api/documents/[id]/ics: a calendar file (.ics) the user taps to
// add a reminder for a document's renewal, due or expiry date.
// ?kind=due|renewal|expiry picks which date; default is the soonest
// upcoming one. Essential and above (PlanLimits.documentReminders).

import { NextRequest, NextResponse } from 'next/server';
import { appBaseUrl, documentsAdmin, isResponse, requireUser, upgradeRequired } from '@/lib/documents/route-helpers';
import { getOwnedDocument } from '@/lib/documents/query';
import { UPGRADE_COPY, getDocumentEntitlements } from '@/lib/documents/plan';
import { KEY_DATE_LABEL, isKeyDateKind, londonToday, pickReminderDate } from '@/lib/documents/dates';
import { buildDocumentIcs } from '@/lib/documents/ics';
import { DOC_TYPE_SINGULAR } from '@/lib/documents/types';
import { sanitizeFilename } from '@/lib/documents/attachments';
import { contentDisposition } from '@/lib/documents/content-disposition';

export const runtime = 'nodejs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (isResponse(user)) return user;

  const ent = await getDocumentEntitlements(user.id);
  if (!ent.documentReminders) return upgradeRequired(UPGRADE_COPY.reminders, 'essential');

  const doc = await getOwnedDocument(documentsAdmin(), user.id, id);
  if (!doc) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });

  const kindParam = req.nextUrl.searchParams.get('kind');
  const pick = pickReminderDate(doc, londonToday(), isKeyDateKind(kindParam) ? kindParam : null);
  if (!pick) {
    return NextResponse.json({ error: 'This document has no upcoming renewal, due or expiry date to remind you about.' }, { status: 400 });
  }

  const what = doc.supplier ? `${doc.supplier} ${DOC_TYPE_SINGULAR[doc.doc_type].toLowerCase()}` : DOC_TYPE_SINGULAR[doc.doc_type];
  const nice = new Date(`${pick.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
  const link = `${appBaseUrl()}/dashboard/documents?doc=${doc.id}`;
  const description = [
    `${KEY_DATE_LABEL[pick.kind]} on ${nice}.`,
    doc.amount !== null ? `Amount: £${Number(doc.amount).toFixed(2)}${doc.currency && doc.currency !== 'GBP' ? ` (${doc.currency})` : ''}.` : null,
    doc.summary,
    pick.kind === 'renewal' ? 'Worth checking you are still on a fair price before it renews.' : null,
    `Open it in Paybacker: ${link}`,
  ]
    .filter(Boolean)
    .join('\n');

  const ics = buildDocumentIcs({ uid: `${doc.id}-${pick.kind}`, keyDate: pick.date, label: KEY_DATE_LABEL[pick.kind], what, description, url: link });
  const filename = sanitizeFilename(`Paybacker reminder ${what} ${pick.date}.ics`);

  return new NextResponse(ics, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': contentDisposition(filename),
      'Cache-Control': 'private, no-store',
    },
  });
}
