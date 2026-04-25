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

// Government and fixed-obligation payments that never warrant a price dispute.
// Normalized merchant names containing any of these terms are skipped.
const GOV_BLOCKLIST_TERMS = [
  'hmrc', 'hm revenue', 'hm customs',
  'council tax', 'government gateway',
  'dvla', 'driver vehicle',
  'nhs ', 'nhs dental', 'nhs prescription',
  'tv licence', 'tv license', 'bbc tv',
  'student loan', 'student loans company',
  'child maintenance',
  'universal credit', 'housing benefit',
];

function isGovPayment(merchantNormalized: string): boolean {
  const lower = merchantNormalized.toLowerCase();
  return GOV_BLOCKLIST_TERMS.some(term => lower.includes(term));
}

/**
 * Daily price increase detection cron.
 * Schedule: Daily at 8am (after bank sync at 3am) -- configured in vercel.json
 *
 * For each user with an active bank connection:
 * 1. Run detectPriceIncreases to find recurring payments that went up
 * 2. Skip government/fixed-obligation payments (HMRC, council tax, etc.)
 * 3. Check for duplicates — skip if active OR dismissed alert already exists
 * 4. Insert new alerts into price_increase_alerts
 * 5. Send Telegram/push notifications (email is handled by morning-digest at 9am)
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

      // Get existing active OR dismissed alerts — don't re-alert on dismissed merchants
      const { data: existingAlerts } = await supabase
        .from('price_increase_alerts')
        .select('merchant_normalized')
        .eq('user_id', userId)
        .in('status', ['active', 'dismissed']);

      const existingMerchants = new Set(
        (existingAlerts || []).map(a => a.merchant_normalized)
      );

      // Collect all new increases for this user
      const newIncreases: typeof increases = [];

      for (const increase of increases) {
        // Skip government / fixed-obligation payments
        if (isGovPayment(increase.merchantNormalized)) continue;
        // Skip if active or dismissed alert already exists for this merchant
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

      // Send Telegram/push immediately. Email is consolidated into the
      // morning-digest cron that runs at 9am UTC so users get one email,
      // not two separate ones for price alerts + renewal reminders.
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
