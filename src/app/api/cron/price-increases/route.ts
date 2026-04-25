import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { detectPriceIncreases } from '@/lib/price-increase-detector';
import { sendNotification } from '@/lib/notifications/dispatch';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Daily price increase detection cron.
 * Schedule: Daily at 7:30am UTC -- configured in vercel.json
 * Runs 30 min before morning-digest so new alerts are ready to collect.
 *
 * For each user with an active bank connection:
 * 1. Run detectPriceIncreases to find recurring payments that went up
 * 2. Check for duplicates (same merchant+user already has an active OR dismissed alert)
 * 3. Insert new alerts into price_increase_alerts
 * 4. Send Telegram/push notification (email is handled by morning-digest at 8am UTC)
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // Get all users with active bank connections
  const { data: connections, error: connError } = await supabase
    .from('bank_connections')
    .select('user_id')
    .eq('status', 'active')
    .is('archived_at', null);

  if (connError || !connections || connections.length === 0) {
    return NextResponse.json({ message: 'No active bank connections', alerts_created: 0 });
  }

  // Deduplicate user IDs
  const userIds = [...new Set(connections.map(c => c.user_id))];

  let totalAlertsCreated = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    try {
      const increases = await detectPriceIncreases(userId);
      if (increases.length === 0) continue;

      // Get existing alerts for this user (active OR dismissed) to prevent duplicates.
      // Dismissed merchants must never be re-inserted — the user explicitly dismissed them.
      const { data: existingAlerts } = await supabase
        .from('price_increase_alerts')
        .select('merchant_normalized, status')
        .eq('user_id', userId)
        .in('status', ['active', 'dismissed']);

      const existingMerchants = new Set(
        (existingAlerts || []).map(a => a.merchant_normalized)
      );

      // Get user profile for tier (email is handled by morning-digest)
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, first_name, subscription_tier')
        .eq('id', userId)
        .single();

      const userName = profile?.full_name || profile?.first_name || 'there';

      // Collect all new increases for this user, then send ONE consolidated email
      const newIncreases: typeof increases = [];

      for (const increase of increases) {
        // Skip if already alerted for this merchant
        if (existingMerchants.has(increase.merchantNormalized)) continue;

        // Insert alert
        const { error: insertError } = await supabase
          .from('price_increase_alerts')
          .insert({
            user_id: userId,
            merchant_name: increase.merchantName,
            merchant_normalized: increase.merchantNormalized,
            old_amount: increase.oldAmount,
            new_amount: increase.newAmount,
            increase_pct: increase.increasePct,
            annual_impact: increase.annualImpact,
            old_date: increase.oldDate,
            new_date: increase.newDate,
            status: 'active',
          });

        if (insertError) {
          errors.push(`Insert failed for ${userId}/${increase.merchantNormalized}: ${insertError.message}`);
          continue;
        }

        totalAlertsCreated++;
        newIncreases.push(increase);
      }

      // Route Telegram/push via the unified dispatcher.
      // Email for price increases is sent by the morning-digest cron (8am UTC)
      // so it can be combined with renewal reminders into one email.
      if (newIncreases.length > 0) {
        const headline = newIncreases.length === 1
          ? `💸 *${newIncreases[0].merchantNormalized}* went up £${(newIncreases[0].newAmount - newIncreases[0].oldAmount).toFixed(2)} (+${newIncreases[0].increasePct}%)`
          : `💸 *${newIncreases.length} price increases detected* on your bills`;
        const telegramText = `${headline}\n\n${newIncreases.map(i => `• ${i.merchantNormalized}: £${i.oldAmount} → £${i.newAmount} (+${i.increasePct}%)`).join('\n')}\n\nOpen Paybacker → Dashboard → Price increase alerts to action.`;

        await sendNotification(supabase, {
          userId,
          event: 'price_increase',
          telegram: { text: telegramText },
          push: { title: 'Price hike detected', body: headline.replace(/\*/g, '') },
        });
      }
    } catch (err) {
      errors.push(`Error processing user ${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    users_checked: userIds.length,
    alerts_created: totalAlertsCreated,
    errors: errors.length > 0 ? errors : undefined,
  });
}
