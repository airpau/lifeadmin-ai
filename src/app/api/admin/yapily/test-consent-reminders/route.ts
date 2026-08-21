// src/app/api/admin/yapily/test-consent-reminders/route.ts
//
// Founder-only harness for the UK 90-day consent reminder schedule.
//
// Why this exists
// ───────────────
// This flow cannot be exercised naturally without waiting 90 days for a
// real consent to age out. That is not a theoretical inconvenience: the
// reminder cron ran daily for months and, across the entire history of
// the system, sent exactly ONE email — the "already stopped" variant,
// never an advance warning. Nobody noticed, because noticing would have
// required someone's consent to lapse while they were watching.
//
// So the schedule is simulated instead. `simulateDaysLeft` overrides
// the stored deadline, which lets a full T-7 → T+3 cycle be walked in
// seconds against a real connection, real channel availability and the
// real tier gate — through the SAME dispatch function the cron calls,
// not a copy of it.
//
// GET  ?connectionId=…            → the whole 11-day schedule, dry run
// GET  ?connectionId=…&days=3     → just T-3, dry run
// POST { connectionId, send:true } → actually send today's reminder
//
// Dry run is the default. `send: true` is the only way to emit anything.

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { dispatchConsentReminders } from '@/lib/yapily/dispatch-consent-reminders';
import {
  reminderSchedule,
  reminderDeadline,
  daysUntil,
  FIRST_REMINDER_DAYS_BEFORE,
  REMINDER_DAYS_AFTER,
} from '@/lib/yapily/consent-reminders';

export const maxDuration = 120;

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  const { searchParams } = new URL(request.url);
  const connectionId = searchParams.get('connectionId') || undefined;
  const daysParam = searchParams.get('days');

  const supabase = getAdmin();
  const now = new Date();

  // Where does this connection actually sit right now?
  let live: Record<string, unknown> | null = null;
  if (connectionId) {
    const { data } = await supabase
      .from('bank_connections')
      .select('id, bank_name, provider, status, consent_expires_at, consent_reconfirm_by, yapily_consent_id')
      .eq('id', connectionId)
      .maybeSingle();
    if (!data) {
      return NextResponse.json({ error: 'Bank connection not found' }, { status: 404 });
    }
    const deadline = reminderDeadline(data);
    live = {
      bank_name: data.bank_name,
      status: data.status,
      renewable: !!data.yapily_consent_id,
      deadline,
      deadline_source: data.consent_reconfirm_by
        ? 'consent_reconfirm_by (Yapily)'
        : 'consent_expires_at (locally computed fallback)',
      days_left_today: deadline ? daysUntil(deadline, now) : null,
    };
  }

  // A single day, or the whole cycle.
  const days = daysParam !== null
    ? [Number(daysParam)]
    : reminderSchedule().map((s) => s.daysLeft);

  if (days.some((d) => !Number.isFinite(d))) {
    return NextResponse.json({ error: 'days must be a number' }, { status: 400 });
  }

  const timeline = [];
  for (const d of days) {
    const run = await dispatchConsentReminders(supabase, now, {
      dryRun: true,
      connectionId,
      simulateDaysLeft: d,
    });
    timeline.push({
      days_left: d,
      label: d > 0 ? `T-${d}` : d === 0 ? 'T-0 (deadline)' : `T+${Math.abs(d)}`,
      would_send: run.outcomes.filter((o) => o.channel !== null).length,
      outcomes: run.outcomes.map((o) => ({
        connection: o.connectionId,
        bank: o.bankName,
        stage: o.stage,
        channel: o.channel,
        reason: o.reason,
      })),
    });
  }

  return NextResponse.json({
    ok: true,
    mode: 'dry_run',
    connectionId: connectionId ?? '(all connections in the window)',
    live,
    policy: {
      first_reminder: `T-${FIRST_REMINDER_DAYS_BEFORE}`,
      last_reminder: `T+${REMINDER_DAYS_AFTER}`,
      cadence: 'once per day',
      channels: 'exactly one per connection per day: WhatsApp (Pro) → Telegram → email',
      in_app: 'renewal banner shows on every /dashboard page throughout, not counted as a send',
    },
    timeline,
    hint: 'POST { "connectionId": "…", "send": true } to actually send today\'s reminder.',
  });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) return NextResponse.json({ error: auth.reason }, { status: auth.status });

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // Params may come from the query string instead.
  }

  const { searchParams } = new URL(request.url);
  const connectionId =
    (body.connectionId as string | undefined) || searchParams.get('connectionId') || undefined;

  // Sending is opt-in. This route talks to WhatsApp, Telegram and
  // Resend against real users, so the mutation must be asked for
  // explicitly rather than being what happens if you open the URL.
  const send = body.send === true || searchParams.get('send') === 'true';

  const simulateDaysLeft =
    body.simulateDaysLeft !== undefined ? Number(body.simulateDaysLeft) : undefined;
  if (simulateDaysLeft !== undefined && !Number.isFinite(simulateDaysLeft)) {
    return NextResponse.json({ error: 'simulateDaysLeft must be a number' }, { status: 400 });
  }

  const supabase = getAdmin();
  const run = await dispatchConsentReminders(supabase, new Date(), {
    dryRun: !send,
    connectionId,
    simulateDaysLeft,
  });

  return NextResponse.json({
    ok: true,
    mode: send ? 'sent' : 'dry_run',
    connectionId: connectionId ?? '(all connections in the window)',
    simulateDaysLeft: simulateDaysLeft ?? null,
    reminders_sent: run.remindersSent,
    reminders_by_channel: run.sentByChannel,
    reminders_skipped: run.remindersSkipped,
    outcomes: run.outcomes,
  });
}
