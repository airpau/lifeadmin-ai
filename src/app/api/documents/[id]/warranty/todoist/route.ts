// POST /api/documents/[id]/warranty/todoist: one Todoist task before a
// warranty or guarantee runs out, with a link back to the receipt. Uses
// the same Todoist connection and task helper as the other document
// reminders. Body (optional): { force?: boolean }. Essential and above
// (PlanLimits.warrantyReminders). Only ever runs when the user presses
// the button.

import { NextRequest, NextResponse } from 'next/server';
import { appBaseUrl, documentsAdmin, isResponse, requireUser, upgradeRequired } from '@/lib/documents/route-helpers';
import { getOwnedDocument } from '@/lib/documents/query';
import { UPGRADE_COPY, getDocumentEntitlements } from '@/lib/documents/plan';
import { addDays, londonToday } from '@/lib/documents/dates';
import { decryptToken } from '@/lib/email/token-crypto';
import { createTodoistTask, TodoistAuthError } from '@/lib/documents/todoist';
import { WARRANTY_LABEL, warrantyWhat } from '@/lib/documents/warranty';

export const runtime = 'nodejs';

/** A month's notice: time to get a fault looked at before cover ends. */
const WARRANTY_LEAD_DAYS = 30;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (isResponse(user)) return user;
  const admin = documentsAdmin();
  const ent = await getDocumentEntitlements(user.id);
  if (!ent.warrantyReminders) return upgradeRequired(UPGRADE_COPY.warrantyReminders, 'essential');

  const body = (await req.json().catch(() => ({}))) as { force?: boolean };
  const doc = await getOwnedDocument(admin, user.id, id);
  if (!doc) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  const today = londonToday();
  if (!doc.warranty_until || doc.warranty_until <= today) {
    return NextResponse.json({ error: 'This document has no warranty end date still to come.' }, { status: 400 });
  }
  if (doc.warranty_todoist_task_id && !body.force) {
    return NextResponse.json({ error: 'You already have a Todoist reminder for this warranty.', alreadyExists: true }, { status: 409 });
  }

  const { data: conn } = await admin.from('todoist_connections').select('id, access_token, status').eq('user_id', user.id).maybeSingle();
  const token = conn?.status === 'active' ? decryptToken(conn.access_token) : null;
  if (!token) return NextResponse.json({ error: 'Connect Todoist first.', needsTodoist: true, connectUrl: '/api/auth/todoist' }, { status: 400 });

  const what = warrantyWhat(doc);
  const lead = addDays(doc.warranty_until, -WARRANTY_LEAD_DAYS);
  const dueDate = lead > today ? lead : today;
  const nice = new Date(`${doc.warranty_until}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });

  try {
    const task = await createTodoistTask(token, {
      content: `${WARRANTY_LABEL} ${nice}: ${what}`,
      description: [
        doc.warranty_note,
        'Anything wrong with it? Contact the seller or maker before the cover ends.',
        `Receipt in Paybacker: ${appBaseUrl()}/dashboard/documents?doc=${doc.id}`,
      ]
        .filter(Boolean)
        .join('\n'),
      dueDate,
    });
    await admin.from('documents').update({ warranty_todoist_task_id: task.id }).eq('id', doc.id).eq('user_id', user.id);
    return NextResponse.json({ ok: true, taskId: task.id, taskUrl: task.url, dueDate });
  } catch (err) {
    if (err instanceof TodoistAuthError) {
      await admin.from('todoist_connections').update({ status: 'needs_reauth', last_error: 'Access refused' }).eq('user_id', user.id);
      return NextResponse.json({ error: 'Todoist needs reconnecting.', needsTodoist: true, connectUrl: '/api/auth/todoist' }, { status: 400 });
    }
    console.error('[documents.warranty.todoist] create failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Todoist did not accept the reminder. Please try again.' }, { status: 502 });
  }
}
