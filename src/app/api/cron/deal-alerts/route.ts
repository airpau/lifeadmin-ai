import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { findDealOpportunities, sendDealAlertEmail } from '@/lib/email/deal-alerts';
import { canSendEmail } from '@/lib/email-rate-limit';
import { sendNotification } from '@/lib/notifications/dispatch';
import { isAlertEnabled } from '@/lib/whatsapp/notification-prefs';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Weekly deal alert cron — sends personalised deal emails to users with tracked subscriptions.
 *
 * Logic:
 * 1. Fetch all users who have subscriptions tracked
 * 2. For each user, analyse their subscriptions for deal opportunities
 * 3. Send personalised email with top 5 switching opportunities
 * 4. Track that we sent the email (prevent duplicates within same week)
 *
 * Schedule: Weekly (Monday 9am) — configured in vercel.json
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // Get all users with active subscriptions
  const { data: users } = await supabase
    .from('profiles')
    .select('id, email, full_name, first_name, subscription_tier')
    .not('email', 'is', null);

  if (!users || users.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: 'No users' });
  }

  // Check what deal alert emails were sent this week already
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  let sent = 0;
  let skipped = 0;
  const results: Array<{ email: string; alerts: number; sent: boolean; reason?: string }> = [];

  for (const user of users) {
    try {
      // Check if we already sent a deal alert to this user this week
      const { data: recentAlert } = await supabase
        .from('tasks')
        .select('id')
        .eq('user_id', user.id)
        .eq('type', 'deal_alert_email')
        .gte('created_at', weekAgo.toISOString())
        .limit(1)
        .maybeSingle();

      if (recentAlert) {
        skipped++;
        results.push({ email: user.email, alerts: 0, sent: false, reason: 'Already sent this week' });
        continue;
      }

      // Global daily email rate limit
      const rateCheck = await canSendEmail(supabase, user.id, 'deal_alert_email');
      if (!rateCheck.allowed) {
        skipped++;
        results.push({ email: user.email, alerts: 0, sent: false, reason: rateCheck.reason });
        continue;
      }

      // Fetch user's subscriptions
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('provider_name, amount, category, billing_cycle')
        .eq('user_id', user.id)
        .is('dismissed_at', null)
        .eq('status', 'active');

      if (!subs || subs.length === 0) {
        skipped++;
        results.push({ email: user.email, alerts: 0, sent: false, reason: 'No subscriptions' });
        continue;
      }

      // Find deal opportunities
      const alerts = findDealOpportunities(subs.map(s => ({
        provider_name: s.provider_name,
        amount: parseFloat(String(s.amount)),
        category: s.category,
        billing_cycle: s.billing_cycle,
      })));

      if (alerts.length === 0) {
        skipped++;
        results.push({ email: user.email, alerts: 0, sent: false, reason: 'No deal opportunities' });
        continue;
      }

      // Calculate total monthly spend
      const totalMonthly = subs.reduce((sum, s) => {
        const amt = parseFloat(String(s.amount)) || 0;
        if (s.billing_cycle === 'yearly') return sum + amt / 12;
        if (s.billing_cycle === 'quarterly') return sum + amt / 3;
        return sum + amt;
      }, 0);

      const userName = user.first_name || user.full_name?.split(' ')[0] || 'there';

      // Send the email
      const emailSent = await sendDealAlertEmail(user.email, userName, alerts, totalMonthly);

      if (emailSent) {
        // Log it in tasks table to prevent re-sending
        await supabase.from('tasks').insert({
          user_id: user.id,
          type: 'deal_alert_email',
          title: `Deal alert: ${alerts.length} opportunities`,
          description: `Sent deal alert email with ${alerts.length} switching opportunities. Top: ${alerts[0].currentProvider} (${alerts[0].category})`,
          status: 'completed',
        });
        sent++;
        results.push({ email: user.email, alerts: alerts.length, sent: true });

        // Pocket Agent buzz with the headline deal — uses the
        // already-approved paybacker_better_deal_found WhatsApp
        // template and the deal_alert event default for Telegram/push.
        try {
          const allowed = await isAlertEnabled(supabase, user.id, 'whatsapp_better_deal');
          const top = alerts[0];
          // Rough heuristic — assume an average 20% switching saving.
          // We don't quote a real comparison, so this is the conservative
          // "save up to" framing already used on the marketing page.
          const annualSaving = Math.max(
            0,
            Math.round((top.currentAmount ?? 0) * 12 * 0.2),
          );
          if (annualSaving > 0) {
            const switchUrl = `https://paybacker.co.uk/dashboard/deals`;
            await sendNotification(supabase, {
              userId: user.id,
              event: 'deal_alert',
              telegram: {
                text:
                  `🪄 *Better deal found*\n\n` +
                  `${top.category}: switch from ${top.currentProvider} and save ~£${annualSaving}/year.\n\n` +
                  `${switchUrl}`,
              },
              whatsapp: allowed
                ? {
                    templateName: 'paybacker_better_deal_found',
                    templateParameters: [
                      String(top.category ?? 'a bill'),
                      String(annualSaving),
                      switchUrl,
                    ],
                  }
                : undefined,
              push: {
                title: 'Better deal found',
                body: `${top.category}: save ~£${annualSaving}/year`,
                deepLink: '/dashboard/deals',
              },
            });
          }
        } catch (err) {
          console.error(`[deal-alerts][${user.id}] pocket-agent buzz failed:`, err);
        }
      } else {
        results.push({ email: user.email, alerts: alerts.length, sent: false, reason: 'Send failed' });
      }
    } catch (err: any) {
      console.error(`Deal alert error for ${user.email}:`, err.message);
      results.push({ email: user.email, alerts: 0, sent: false, reason: err.message });
    }
  }

  console.log(`deal-alerts: sent=${sent} skipped=${skipped} total_users=${users.length}`);

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    total_users: users.length,
    results,
  });
}
