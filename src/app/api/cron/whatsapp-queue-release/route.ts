/**
 * Phase 2 release cron — sends WhatsApp alerts that were deferred to the user's
 * preferred hour once that hour arrives. Runs hourly.
 *
 * Reconstructs the original DispatchInput and calls sendNotification with
 * bypassDefer:true so the alert is NOT re-queued. sendNotification still applies
 * quiet-hours, tier and suppression checks, so a released alert goes through the
 * same gates as any other send.
 *
 * Auth: authorizeAdminOrCron (Bearer CRON_SECRET or founder session).
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { sendNotification } from '@/lib/notifications/dispatch';
import type { NotificationEventType } from '@/lib/notifications/events';
import type { WhatsAppPayload } from '@/lib/notifications/dispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const MAX_PER_RUN = 200;

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function GET(req: NextRequest) {
  const auth = await authorizeAdminOrCron(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  const sb = admin();
  const { data: due, error } = await sb
    .from('whatsapp_alert_queue')
    .select('id, user_id, event_type, payload')
    .eq('status', 'pending')
    .lte('release_after', new Date().toISOString())
    .order('release_after', { ascending: true })
    .limit(MAX_PER_RUN);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!due || due.length === 0) {
    return NextResponse.json({ ok: true, released: 0 });
  }

  let released = 0;
  let failed = 0;
  for (const row of due) {
    try {
      await sendNotification(sb, {
        userId: row.user_id as string,
        event: row.event_type as NotificationEventType,
        whatsapp: row.payload as WhatsAppPayload,
        bypassDefer: true,
      });
      await sb
        .from('whatsapp_alert_queue')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', row.id);
      released += 1;
    } catch (e) {
      failed += 1;
      console.warn('[whatsapp-queue-release] send failed for', row.id, (e as Error)?.message ?? e);
    }
  }

  return NextResponse.json({ ok: true, released, failed });
}
