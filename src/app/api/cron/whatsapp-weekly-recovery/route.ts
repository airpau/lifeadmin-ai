/**
 * Weekly WhatsApp recovery digest — Mon 09:00 UTC.
 *
 * Independent of telegram-weekly-summary (which fires Sat 08:00 UTC).
 * This cron targets ONLY WhatsApp Pocket Agent Pro users who have at
 * least one won dispute, and fires the `paybacker_recovery_total_weekly`
 * Meta-approved template.
 *
 * Triggered by vercel.json: `0 9 * * 1`.
 *
 * Idempotency: per-user-per-Monday entry in `notification_log`
 * (notification_type='whatsapp_recovery_weekly', reference_key=ISO date).
 *
 * Gating:
 *   - Active whatsapp_sessions row, opted_out_at IS NULL
 *   - Pro tier (or trial-Pro via isProPocketAgentEligible)
 *   - At least one won dispute on file
 *   - User's `whatsapp_weekly_recovery` preference is enabled (default true)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendNotification } from '@/lib/notifications/dispatch';
import { isAlertEnabled } from '@/lib/whatsapp/notification-prefs';
import { isProPocketAgentEligible } from '@/lib/telegram/eligibility';

export const runtime = 'nodejs';
export const maxDuration = 120;
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization') ?? '';
  const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = getAdmin();
  const now = new Date();
  const isoMonday = (() => {
    // Anchor the reference_key to the calendar date this run represents,
    // so reruns the same day deduplicate cleanly.
    const d = new Date(now);
    d.setUTCHours(0, 0, 0, 0);
    return d.toISOString().slice(0, 10);
  })();

  const errors: string[] = [];
  let candidates = 0;
  let sent = 0;
  let skippedPref = 0;
  let skippedNoWins = 0;
  let skippedDuplicate = 0;

  const { data: sessions, error } = await sb
    .from('whatsapp_sessions')
    .select('user_id, whatsapp_phone')
    .eq('is_active', true)
    .is('opted_out_at', null);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  if (!sessions || sessions.length === 0) {
    return NextResponse.json({ ok: true, candidates: 0, sent: 0 });
  }

  const userIds = sessions.map((s) => s.user_id);
  const { data: profiles } = await sb
    .from('profiles')
    .select(
      'id, subscription_tier, subscription_status, stripe_subscription_id, trial_ends_at, trial_converted_at, trial_expired_at',
    )
    .in('id', userIds);
  const proIds = new Set(
    (profiles ?? []).filter((p) => isProPocketAgentEligible(p)).map((p) => p.id),
  );

  const weekStart = new Date(now);
  weekStart.setDate(weekStart.getDate() - 7);

  for (const session of sessions) {
    if (!proIds.has(session.user_id)) continue;
    candidates++;

    try {
      const allowed = await isAlertEnabled(sb, session.user_id, 'whatsapp_weekly_recovery');
      if (!allowed) {
        skippedPref++;
        continue;
      }

      // Idempotency
      const { data: already } = await sb
        .from('notification_log')
        .select('id')
        .eq('user_id', session.user_id)
        .eq('notification_type', 'whatsapp_recovery_weekly')
        .eq('reference_key', isoMonday)
        .maybeSingle();
      if (already) {
        skippedDuplicate++;
        continue;
      }

      const { data: wonCount } = await sb
        .from('disputes')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', session.user_id)
        .in('status', ['resolved_won', 'resolved_partial']);
      const wins = (wonCount as unknown as { count?: number })?.count ?? 0;

      const { data: weekly } = await sb
        .from('verified_savings')
        .select('amount_saved')
        .eq('user_id', session.user_id)
        .gte('created_at', weekStart.toISOString());

      const { data: all } = await sb
        .from('verified_savings')
        .select('amount_saved')
        .eq('user_id', session.user_id);

      const amountThisWeek = (weekly ?? []).reduce(
        (s, r) => s + (Number(r.amount_saved) || 0),
        0,
      );
      const lifetimeAmount = (all ?? []).reduce(
        (s, r) => s + (Number(r.amount_saved) || 0),
        0,
      );

      if (wins === 0 && amountThisWeek <= 0 && lifetimeAmount <= 0) {
        skippedNoWins++;
        continue;
      }

      const result = await sendNotification(sb, {
        userId: session.user_id,
        event: 'recovery_weekly',
        whatsapp: {
          templateName: 'paybacker_recovery_total_weekly',
          templateParameters: [
            `£${amountThisWeek.toFixed(2)}`,
            `£${lifetimeAmount.toFixed(2)}`,
          ],
        },
      });

      if (result.delivered.includes('whatsapp')) {
        sent++;
        await sb.from('notification_log').insert({
          user_id: session.user_id,
          notification_type: 'whatsapp_recovery_weekly',
          reference_key: isoMonday,
        });
      }
    } catch (err) {
      const m = err instanceof Error ? err.message : String(err);
      console.error(`[whatsapp-weekly-recovery][${session.user_id}] ${m}`);
      errors.push(`${session.user_id}: ${m}`);
    }
  }

  return NextResponse.json({
    ok: true,
    candidates,
    sent,
    skippedPref,
    skippedNoWins,
    skippedDuplicate,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}
