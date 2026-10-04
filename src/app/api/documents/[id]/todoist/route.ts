// POST /api/documents/[id]/todoist: create one Todoist task for a
// document's renewal, due or expiry date, with a link back to Paybacker.
// Body (optional): { kind: 'due' | 'renewal' | 'expiry', force?: boolean }.
// Essential and above (PlanLimits.documentReminders). Only ever runs
// when the user presses the button.

import { NextRequest, NextResponse } from 'next/server';
import { appBaseUrl, documentsAdmin, isResponse, requireUser, upgradeRequired } from '@/lib/documents/route-helpers';
import { getOwnedDocument } from '@/lib/documents/query';
import { UPGRADE_COPY, getDocumentEntitlements } from '@/lib/documents/plan';
import { KEY_DATE_LABEL, addDays, isKeyDateKind, londonToday, pickReminderDate } from '@/lib/documents/dates';
import { DOC_TYPE_SINGULAR } from '@/lib/documents/types';
import { decryptToken } from '@/lib/email/token-crypto';
import { createTodoistTask, TodoistAuthError } from '@/lib/documents/todoist';

export const runtime = 'nodejs';

/** Task lands this many days before the key date (or today, if sooner). */
const TODOIST_LEAD_DAYS = 7;

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (isResponse(user)) return user;
  const admin = documentsAdmin();

  const ent = await getDocumentEntitlements(user.id);
  if (!ent.documentReminders) return upgradeRequired(UPGRADE_COPY.reminders, 'essential');

  const body = (await req.json().catch(() => ({}))) as { kind?: string; force?: boolean };
  const doc = await getOwnedDocument(admin, user.id, id);
  if (!doc) return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  if (doc.todoist_task_id && !body.force) {
    return NextResponse.json({ error: 'You already have a Todoist reminder for this document.', alreadyExists: true }, { status: 409 });
  }

  const today = londonToday();
  const pick = pickReminderDate(doc, today, isKeyDateKind(body.kind) ? body.kind : null);
  if (!pick) {
    return NextResponse.json({ error: 'This document has no upcoming renewal, due or expiry date to remind you about.' }, { status: 400 });
  }

  const { data: conn } = await admin
    .from('todoist_connections')
    .select('id, access_token, status')
    .eq('user_id', user.id)
    .maybeSingle();
  const token = conn?.status === 'active' ? decryptToken(conn.access_token) : null;
  if (!token) {
    return NextResponse.json({ error: 'Connect Todoist first.', needsTodoist: true, connectUrl: '/api/auth/todoist' }, { status: 400 });
  }

  const what = doc.supplier ? `${doc.supplier} ${DOC_TYPE_SINGULAR[doc.doc_type].toLowerCase()}` : DOC_TYPE_SINGULAR[doc.doc_type];
  const leadDate = addDays(pick.date, -TODOIST_LEAD_DAYS);
  const dueDate = leadDate > today ? leadDate : today;
  const nice = new Date(`${pick.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });

  try {
    const task = await createTodoistTask(token, {
      content: `${KEY_DATE_LABEL[pick.kind]} ${nice}: ${what}`,
      description: [
        doc.summary,
        doc.amount !== null ? `Amount: £${Number(doc.amount).toFixed(2)}` : null,
        `Open in Paybacker: ${appBaseUrl()}/dashboard/documents?doc=${doc.id}`,
      ]
        .filter(Boolean)
        .join('\n'),
      dueDate,
    });
    await admin.from('documents').update({ todoist_task_id: task.id }).eq('id', doc.id).eq('user_id', user.id);
    return NextResponse.json({ ok: true, taskId: task.id, taskUrl: task.url, dueDate });
  } catch (err) {
    if (err instanceof TodoistAuthError) {
      await admin.from('todoist_connections').update({ status: 'needs_reauth', last_error: 'Access refused' }).eq('user_id', user.id);
      return NextResponse.json({ error: 'Todoist needs reconnecting.', needsTodoist: true, connectUrl: '/api/auth/todoist' }, { status: 400 });
    }
    console.error('[documents.todoist] create failed:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Todoist did not accept the reminder. Please try again.' }, { status: 502 });
  }
}
