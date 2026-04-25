import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { detectPriceIncreases } from '@/lib/price-increase-detector';

export const maxDuration = 60;

// Government and tax merchants — price variations aren't consumer disputes.
const GOVT_MERCHANT_PATTERNS = [
  'hmrc',
  'council tax',
  'city council',
  'county council',
  'district council',
  'borough council',
  'hm revenue',
  'dvla',
  'gov.uk',
];

function isGovtMerchant(normalized: string): boolean {
  const lower = normalized.toLowerCase();
  return GOVT_MERCHANT_PATTERNS.some((p) => lower.includes(p));
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Price increase detection — inserts alerts to DB only.
 * Email delivery is handled by /api/cron/morning-digest (combined digest).
 *
 * Can still be called manually to force a detection run without sending email.
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

      // Fetch ALL existing alerts (any status) — dismissed/actioned means the user
      // already acted on this merchant. Never re-create a dismissed alert.
      const { data: existingAlerts } = await supabase
        .from('price_increase_alerts')
        .select('merchant_normalized')
        .eq('user_id', userId)
        .in('status', ['active', 'dismissed', 'actioned']);

      const existingMerchants = new Set(
        (existingAlerts || []).map(a => a.merchant_normalized)
      );

      for (const increase of increases) {
        // Skip already-alerted merchants (any status) and government payments
        if (existingMerchants.has(increase.merchantNormalized)) continue;
        if (isGovtMerchant(increase.merchantNormalized)) continue;

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
      }
      // Email delivery is handled by /api/cron/morning-digest (combined digest).
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
