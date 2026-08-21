import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildRenewalEmail } from '@/lib/email/renewal-reminders';
import { canSendEmail } from '@/lib/email-rate-limit';
import { sendNotification } from '@/lib/notifications/dispatch';
import { isPayrollLike } from '@/lib/subscriptions/payroll-filter';
import { buildRenewalDigest, formatRenewalAmount } from '@/lib/subscriptions/renewal-digest';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface RenewingSub {
  user_id: string;
  provider_name: string;
  amount: number | string;
  category: string | null;
  next_billing_date: string;
  /** Typed as string to match RenewalSubscription in the email builder;
   *  the column is nullable and null flows through unchanged, exactly as
   *  it did when these rows were untyped. */
  billing_cycle: string;
  contract_type: string | null;
  provider_type: string | null;
}

interface PendingRenewal {
  sub: RenewingSub;
  daysLeft: number;
  /** tasks.description key that dedups this (user, window, date) tuple. */
  reminderKey: string;
}

/**
 * Daily renewal reminder cron — 30, 14, and 7 days before renewal.
 *
 * Schedule: Daily at 8am — configured in vercel.json
 *
 * 2026-08-16: the three windows are now COLLECTED first and emitted as
 * ONE combined message per user. Previously the outer `for (const days of
 * windows)` loop dispatched independently, so a user with renewals at 30,
 * 14 and 7 days out received three separate emails, three Telegram
 * messages and three billed WhatsApp templates in the same 08:00 minute.
 * `buildRenewalDigest` already handles a mixed daysLeft list, so the
 * combined message needs no new copy.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // Check windows: 30 days, 14 days, 7 days from now
  const windows = [30, 14, 7];
  let totalSent = 0;
  const results: Array<{ email: string; windows: number[]; renewals: number; sent: boolean }> = [];

  // ── Phase 1: collect every due renewal across all three windows ──────
  const perUser = new Map<string, PendingRenewal[]>();

  for (const days of windows) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const dateStr = targetDate.toISOString().split('T')[0];

    // Find subscriptions renewing on this date (± 1 day)
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const { data: renewingSubs } = await supabase
      .from('subscriptions')
      .select('user_id, provider_name, amount, category, next_billing_date, billing_cycle, contract_type, provider_type')
      .is('dismissed_at', null)
      .eq('status', 'active')
      .not('next_billing_date', 'is', null)
      .gte('next_billing_date', dateStr)
      .lt('next_billing_date', nextDay.toISOString().split('T')[0]);

    if (!renewingSubs || renewingSubs.length === 0) continue;

    // Drop payroll / salary / wages rows that the bank-scan importer
    // mis-detected as subscriptions — they are not cancellable renewals.
    const cancellableSubs = (renewingSubs as RenewingSub[]).filter((s) => !isPayrollLike(s));

    for (const sub of cancellableSubs) {
      if (!perUser.has(sub.user_id)) perUser.set(sub.user_id, []);
      perUser.get(sub.user_id)!.push({
        sub,
        daysLeft: days,
        reminderKey: `renewal_${days}d_${dateStr}`,
      });
    }
  }

  // ── Phase 2: ONE combined message per user ──────────────────────────
  for (const [userId, pending] of perUser.entries()) {
    // Drop any window we already sent today (per-window dedup preserved
    // exactly — the keys are unchanged, we just check them in bulk).
    const keys = Array.from(new Set(pending.map((p) => p.reminderKey)));
    const { data: alreadySent } = await supabase
      .from('tasks')
      .select('description')
      .eq('user_id', userId)
      .eq('type', 'renewal_reminder')
      .in('description', keys);
    const sentKeys = new Set((alreadySent ?? []).map((t) => t.description as string));

    const due = pending.filter((p) => !sentKeys.has(p.reminderKey));
    if (due.length === 0) continue;

    // Get user info + tier in one round trip — renewal reminders are
    // an Essential+ feature (Free users see "upgrade to get reminded"
    // on the subscriptions page, they don't get the email itself).
    const { data: user } = await supabase
      .from('profiles')
      .select('email, full_name, first_name, subscription_tier, subscription_status, trial_ends_at, trial_converted_at, trial_expired_at')
      .eq('id', userId)
      .single();

    if (!user?.email) continue;

    // Tier gate. Mirrors getEffectiveTier in plan-limits.ts so a user
    // on Free with no active onboarding trial gets skipped. Trusts
    // subscription_tier directly per the "demotion is webhook-driven"
    // rule (CLAUDE.md).
    const trialActive = !!user.trial_ends_at
      && new Date(user.trial_ends_at) > new Date()
      && !user.trial_converted_at
      && !user.trial_expired_at;
    const effectiveTier = trialActive ? 'pro' : (user.subscription_tier || 'free');
    if (effectiveTier === 'free') continue;

    // The 30/14/7 renewal warning is a service message on a paid tier. The
    // deals block inside it is marketing. So a hit cap strips the offer rather
    // than suppressing the email: the user still gets the warning they pay
    // for, and we send no marketing over the cap.
    //
    // (Before PR#534 a hit cap `continue`d past the whole dispatch, muting
    // Telegram, WhatsApp and push as well — channels the EMAIL cap has no say
    // over. Dedup is written on ANY delivery, so a capped morning still marks
    // the window done and the Pocket Agent digest is not repeated tomorrow.)
    const rateCheck = await canSendEmail(supabase, userId, 'renewal_reminder');
    const includeDeals = rateCheck.allowed;

    const userName = user.first_name || user.full_name?.split(' ')[0] || 'there';

    // Soonest window drives the email headline; the digest carries the
    // per-item lead times so nothing is lost.
    const soonest = Math.min(...due.map((d) => d.daysLeft));
    const dueWindows = Array.from(new Set(due.map((d) => d.daysLeft))).sort((a, b) => b - a);

    const renewals = due.map(({ sub }) => ({
      provider_name: sub.provider_name,
      amount: parseFloat(String(sub.amount)),
      category: sub.category,
      next_billing_date: sub.next_billing_date,
      billing_cycle: sub.billing_cycle,
      contract_type: sub.contract_type,
      provider_type: sub.provider_type,
    }));

    const { subject, html } = buildRenewalEmail(userName, renewals, soonest, { includeDeals });

    // Build the WhatsApp + Telegram digest from the shared helper so the
    // amount is rendered with its REAL billing cycle (no fabricated
    // "/month" on annual / balance figures) and ALL due renewals — across
    // every window — land in a SINGLE numbered message.
    const digest = buildRenewalDigest(
      due.map(({ sub, daysLeft }) => ({
        providerName: sub.provider_name,
        amountDisplay: formatRenewalAmount(parseFloat(String(sub.amount)), sub.billing_cycle).display,
        daysLeft,
      })),
    );

    // WhatsApp goes out via the approved single-var pocket_agent_reply
    // wrapper (Twilio template vars reject newlines, so we send the
    // flattened single-line copy). This replaces the old
    // paybacker_alert_renewal template whose body hard-coded
    // "£{{3}}/month" — the source of the wrong "/month" amounts — and it
    // now covers multi-renewal alerts too (previously WhatsApp-silent).
    const dispatchResult = await sendNotification(supabase, {
      userId,
      event: 'renewal_reminder',
      email: { subject, html },
      telegram: { text: digest.telegram },
      whatsapp: {
        templateName: 'paybacker_pocket_agent_reply',
        templateParameters: [digest.whatsapp],
      },
      push: {
        title: `${renewals.length} renewal${renewals.length === 1 ? '' : 's'} coming up`,
        body: `${renewals.length} renewing in the next ${Math.max(...dueWindows)} days — tap to review`,
      },
    });

    const sent = dispatchResult.delivered.length > 0;

    // Log the digest as an outbound WhatsApp turn so the Pocket Agent can
    // resolve "CANCEL 1" / "CANCEL <provider>" against it in history.
    if (dispatchResult.delivered.includes('whatsapp')) {
      const { data: waSession } = await supabase
        .from('whatsapp_sessions')
        .select('whatsapp_phone')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();
      if (waSession?.whatsapp_phone) {
        await supabase.from('whatsapp_message_log').insert({
          user_id: userId,
          whatsapp_phone: waSession.whatsapp_phone,
          direction: 'outbound',
          message_type: 'template',
          template_name: 'paybacker_pocket_agent_reply',
          message_text: digest.telegram,
        }).then(undefined, (e) => console.warn('[renewal-reminders] digest log failed', e));
      }
    }

    if (sent) {
      // One task row per covered window so the per-window dedup keys
      // stay exactly as they were before the combine.
      const coveredKeys = Array.from(new Set(due.map((d) => d.reminderKey)));
      await supabase.from('tasks').insert(
        coveredKeys.map((key) => ({
          user_id: userId,
          type: 'renewal_reminder',
          title: `Renewal reminder: ${due.length} subs across ${dueWindows.join('/')}d windows`,
          description: key,
          status: 'completed',
        })),
      );
      totalSent++;
    }

    results.push({ email: user.email, windows: dueWindows, renewals: due.length, sent });
  }

  console.log(`renewal-reminders: sent=${totalSent}`);

  return NextResponse.json({ ok: true, sent: totalSent, results });
}
