// GET /api/cron/document-digest: the weekly documents digest. For each
// Essential and above user (PlanLimits.documentDigest) with a due,
// renewal, expiry or warranty date in their vault in the next 30 days,
// one message through the notification dispatcher (event
// 'document_digest'), so the user's channel choices and quiet hours
// apply exactly as for every other consumer alert.
//
// OFF BY DEFAULT. Scheduled in vercel.json (Mondays 08:20 UTC), but a
// no-op unless DOCUMENT_DIGEST_CRON_ENABLED === 'true'. Protected with
// CRON_SECRET, and every call is rejected when CRON_SECRET is unset.
//
// Caps and dedupe, as the renewal reminders cron does it:
//  - the email leg only goes out when canSendEmail() allows it (the
//    global one-a-day cap); Telegram and push are not affected by the
//    email cap
//  - a sent email is recorded with markEmailSent() under the existing
//    'renewal_reminder' task type: tasks_type_check only allows listed
//    types and widening it would mean dropping and recreating the
//    constraint, and a dates-coming-up digest is the same kind of email
//  - once a week per user at most: a notification_log row keyed on the
//    ISO week is claimed before sending (unique index), and released
//    again when nothing was delivered
// No AI call. Nothing is sent to anyone but the user.

import { NextRequest, NextResponse } from 'next/server';
import { appBaseUrl, documentsAdmin } from '@/lib/documents/route-helpers';
import { documentEntitlements } from '@/lib/documents/plan';
import { getEffectiveTier } from '@/lib/plan-limits';
import { londonToday } from '@/lib/documents/dates';
import { buildDigestMessages, digestWindow, isoWeekKey, selectDigestItems, type DigestDoc } from '@/lib/documents/digest';
import { canSendEmail, markEmailSent } from '@/lib/email-rate-limit';
import { sendNotification } from '@/lib/notifications/dispatch';

export const runtime = 'nodejs';
export const maxDuration = 300;

const RUN_BUDGET_MS = 250_000;
const MAX_ROWS = 50_000;
const NOTIFICATION_TYPE = 'document_digest';
/** Task type the email is counted under (see the note above). */
const EMAIL_CAP_TYPE = 'renewal_reminder';

export async function GET(req: NextRequest) {
  const secret = (process.env.CRON_SECRET || '').trim();
  if (!secret || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  if (process.env.DOCUMENT_DIGEST_CRON_ENABLED !== 'true') {
    return NextResponse.json({ ok: true, skipped: 'DOCUMENT_DIGEST_CRON_ENABLED is not true' });
  }

  const startedAt = Date.now();
  const admin = documentsAdmin();
  const today = londonToday();
  const { from, to } = digestWindow(today);
  const week = isoWeekKey(today);

  // 1. Documents with a key date in the window, grouped by user.
  const byUser = new Map<string, DigestDoc[]>();
  for (let offset = 0; offset < MAX_ROWS; offset += 1000) {
    const { data, error } = await admin
      .from('documents')
      .select('id, user_id, doc_type, supplier, summary, amount, currency, due_date, renewal_date, expiry_date, warranty_until, warranty_note')
      .eq('status', 'active')
      .or(
        [
          `and(due_date.gte.${from},due_date.lte.${to})`,
          `and(renewal_date.gte.${from},renewal_date.lte.${to})`,
          `and(expiry_date.gte.${from},expiry_date.lte.${to})`,
          `and(warranty_until.gte.${from},warranty_until.lte.${to})`,
        ].join(','),
      )
      .order('id', { ascending: true })
      .range(offset, offset + 999);
    if (error) {
      console.error('[cron document-digest] document lookup failed:', error.message);
      return NextResponse.json({ ok: false, error: 'document_lookup_failed' }, { status: 500 });
    }
    for (const row of data ?? []) {
      const uid = row.user_id as string;
      if (!byUser.has(uid)) byUser.set(uid, []);
      byUser.get(uid)!.push(row as unknown as DigestDoc);
    }
    if ((data ?? []).length < 1000) break;
  }

  let sent = 0;
  let notEntitled = 0;
  let alreadySent = 0;
  let nothingDelivered = 0;
  let errors = 0;

  for (const [userId, docs] of byUser) {
    if (Date.now() - startedAt > RUN_BUDGET_MS) break;
    try {
      const ent = documentEntitlements(await getEffectiveTier(userId));
      if (!ent.documentDigest) {
        notEntitled++;
        continue;
      }
      const items = selectDigestItems(docs, today);
      if (items.length === 0) continue;

      // Claim this week's digest. The unique index on
      // (user_id, notification_type, reference_key) makes a second run
      // in the same week a no-op.
      const { error: claimErr } = await admin.from('notification_log').insert({ user_id: userId, notification_type: NOTIFICATION_TYPE, reference_key: week });
      if (claimErr) {
        if ((claimErr as { code?: string }).code === '23505') alreadySent++;
        else errors++;
        continue;
      }

      const { data: profile } = await admin.from('profiles').select('first_name, full_name').eq('id', userId).maybeSingle();
      const firstName = (profile?.first_name as string | null) || (profile?.full_name as string | null)?.split(' ')[0] || 'there';
      const msg = buildDigestMessages(firstName, items, appBaseUrl());
      const rate = await canSendEmail(admin, userId, EMAIL_CAP_TYPE);

      const result = await sendNotification(admin, {
        userId,
        event: 'document_digest',
        email: rate.allowed ? msg.email : undefined,
        telegram: { text: msg.telegram },
        push: { title: msg.push.title, body: msg.push.body, deepLink: '/dashboard/documents' },
      });

      if (result.delivered.length === 0) {
        nothingDelivered++;
        await admin.from('notification_log').delete().eq('user_id', userId).eq('notification_type', NOTIFICATION_TYPE).eq('reference_key', week);
        continue;
      }
      if (result.delivered.includes('email')) {
        await markEmailSent(admin, userId, EMAIL_CAP_TYPE, `Documents digest: ${items.length} date${items.length === 1 ? '' : 's'} in the next 30 days`);
      }
      sent++;
    } catch (err) {
      errors++;
      console.error('[cron document-digest] user failed:', err instanceof Error ? err.message : err);
    }
  }

  const body = { ok: true, week, usersWithDates: byUser.size, sent, notEntitled, alreadySent, nothingDelivered, errors, elapsedMs: Date.now() - startedAt };
  console.log('[cron document-digest]', JSON.stringify(body));
  return NextResponse.json(body);
}
