import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendRenewalReminder } from '@/lib/email/renewal-reminders';
import { canSendEmail } from '@/lib/email-rate-limit';

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
      .or('category.is.null,category.not.in.(council_tax,tax,shopping,transport,gambling)')
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

      // Get user info
      const { data: user } = await supabase
        .from('profiles')
        .select('email, full_name, first_name')
        .eq('id', userId)
        .single();

      if (!user?.email) continue;

      // Global daily email rate limit
      const rateCheck = await canSendEmail(supabase, userId, 'renewal_reminder');
      if (!rateCheck.allowed) continue;

      const userName = user.first_name || user.full_name?.split(' ')[0] || 'there';

      const sent = await sendRenewalReminder(
        user.email,
        userName,
        subs.map(s => ({
          provider_name: s.provider_name,
          amount: parseFloat(String(s.amount)),
          category: s.category,
          next_billing_date: s.next_billing_date,
          billing_cycle: s.billing_cycle,
          contract_type: s.contract_type,
          provider_type: s.provider_type,
        })),
        days
      );

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
