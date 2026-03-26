import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { detectPriceIncreases } from '@/lib/price-increase-detector';
import { sendPriceIncreaseAlert } from '@/lib/email/price-increase-alerts';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Daily price increase detection cron.
 * Schedule: Daily at 8am (after bank sync at 3am) -- configured in vercel.json
 *
 * For each user with an active bank connection:
 * 1. Run detectPriceIncreases to find recurring payments that went up
 * 2. Check for duplicates (same merchant+user already has an active alert)
 * 3. Insert new alerts into price_increase_alerts
 * 4. Send email notification to Essential/Pro users
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
    .eq('status', 'active');

  if (connError || !connections || connections.length === 0) {
    return NextResponse.json({ message: 'No active bank connections', alerts_created: 0 });
  }

  // Deduplicate user IDs
  const userIds = [...new Set(connections.map(c => c.user_id))];

  let totalAlertsCreated = 0;
  let totalEmailsSent = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    try {
      const increases = await detectPriceIncreases(userId);
      if (increases.length === 0) continue;

      // Get existing active alerts for this user to prevent duplicates
      const { data: existingAlerts } = await supabase
        .from('price_increase_alerts')
        .select('merchant_normalized')
        .eq('user_id', userId)
        .eq('status', 'active');

      const existingMerchants = new Set(
        (existingAlerts || []).map(a => a.merchant_normalized)
      );

      // Get user profile for email and tier
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name, first_name, subscription_tier')
        .eq('id', userId)
        .single();

      const isPaid = profile?.subscription_tier === 'essential' || profile?.subscription_tier === 'pro';
      const userName = profile?.full_name || profile?.first_name || 'there';

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

        // Send email to Essential/Pro users only
        if (isPaid && profile?.email) {
          const sent = await sendPriceIncreaseAlert(profile.email, userName, increase);
          if (sent) totalEmailsSent++;
        }
      }
    } catch (err) {
      errors.push(`Error processing user ${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    users_checked: userIds.length,
    alerts_created: totalAlertsCreated,
    emails_sent: totalEmailsSent,
    errors: errors.length > 0 ? errors : undefined,
  });
}
