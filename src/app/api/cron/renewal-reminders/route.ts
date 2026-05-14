import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildRenewalEmail } from '@/lib/email/renewal-reminders';
import { canSendEmail } from '@/lib/email-rate-limit';
import { sendNotification } from '@/lib/notifications/dispatch';
import { renewalTemplateVars } from '@/lib/notifications/brief-builder';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Daily renewal reminder cron — emails users at 30, 14, and 7 days before renewal.
 *
 * Schedule: Daily at 8am — configured in vercel.json
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
  const results: Array<{ email: string; window: number; renewals: number; sent: boolean }> = [];

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

    // Group by user
    const userRenewals = new Map<string, typeof renewingSubs>();
    for (const sub of renewingSubs) {
      if (!userRenewals.has(sub.user_id)) userRenewals.set(sub.user_id, []);
      userRenewals.get(sub.user_id)!.push(sub);
    }

    for (const [userId, subs] of userRenewals.entries()) {
      // Check if we already sent a reminder for this window
      const reminderKey = `renewal_${days}d_${dateStr}`;
      const { data: alreadySent } = await supabase
        .from('tasks')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'renewal_reminder')
        .eq('description', reminderKey)
        .maybeSingle();

      if (alreadySent) continue;

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

      // Global daily email rate limit
      const rateCheck = await canSendEmail(supabase, userId, 'renewal_reminder');
      if (!rateCheck.allowed) continue;

      const userName = user.first_name || user.full_name?.split(' ')[0] || 'there';

      const renewalRows = subs.map((s) => ({
        provider_name: s.provider_name,
        amount: parseFloat(String(s.amount)),
        category: s.category,
        next_billing_date: s.next_billing_date,
        billing_cycle: s.billing_cycle,
        contract_type: s.contract_type,
        provider_type: s.provider_type,
      }));

      const { subject, html } = buildRenewalEmail(userName, renewalRows, days);

      // Pick the biggest renewal for the WhatsApp template — the
      // template has a single (service, days_left, monthly_cost) shape
      // so we surface the headline one. The email + Telegram cover
      // the full list. Aborts the WhatsApp send entirely when there's
      // nothing meaningful (e.g. all £0).
      const biggest = [...renewalRows].sort((a, b) => b.amount - a.amount)[0];
      const monthly =
        (biggest.billing_cycle ?? '').toLowerCase() === 'annual' ||
        (biggest.billing_cycle ?? '').toLowerCase() === 'yearly'
          ? biggest.amount / 12
          : biggest.amount;
      const waVars = renewalTemplateVars({
        service: biggest.provider_name,
        daysLeft: days,
        monthlyCost: monthly,
      });

      const telegramText =
        renewalRows.length === 1
          ? `📅 *${biggest.provider_name}* renews in ${days} days — £${biggest.amount.toFixed(2)}/${biggest.billing_cycle ?? 'month'}.\n\nReply if you want me to draft a cancellation or switch letter.`
          : `📅 *${renewalRows.length} renewals* coming up in ${days} days:\n\n${renewalRows
              .map((r) => `• ${r.provider_name} — £${r.amount.toFixed(2)}/${r.billing_cycle ?? 'month'}`)
              .join('\n')}\n\nReply 'cancel <name>' if you want to drop one.`;

      const dispatch = await sendNotification(supabase, {
        userId,
        event: 'renewal_reminder',
        email: { subject, html },
        telegram: { text: telegramText },
        whatsapp: {
          templateName: waVars.templateName,
          templateParameters: waVars.parameters,
        },
        push: {
          title: 'Renewal coming up',
          body: `${biggest.provider_name} renews in ${days} days (£${biggest.amount.toFixed(2)})`,
        },
      });

      const sent = dispatch.delivered.length > 0;

      if (sent) {
        await supabase.from('tasks').insert({
          user_id: userId,
          type: 'renewal_reminder',
          title: `Renewal reminder: ${subs.length} subs in ${days} days`,
          description: reminderKey,
          status: 'completed',
        });
        totalSent++;
      }

      results.push({ email: user.email, window: days, renewals: subs.length, sent });
    }
  }

  console.log(`renewal-reminders: sent=${totalSent}`);

  return NextResponse.json({ ok: true, sent: totalSent, results });
}
