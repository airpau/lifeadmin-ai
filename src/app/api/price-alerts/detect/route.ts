import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { detectPriceIncreases } from '@/lib/price-increase-detector';

function getAdmin() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * POST /api/price-alerts/detect
 * Run price increase detection on demand for the authenticated user.
 * Called by the dashboard when bank data exists but no alerts are stored yet.
 * Deduplicates against existing active alerts before inserting.
 * Returns all active alerts after detection.
 */
export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();

  // Run detection — reads last 6 months of bank_transactions for this user
  const increases = await detectPriceIncreases(user.id);

  if (increases.length > 0) {
    // Fetch existing active alerts to prevent duplicate inserts
    const { data: existing } = await admin
      .from('price_increase_alerts')
      .select('merchant_normalized')
      .eq('user_id', user.id)
      .eq('status', 'active');

    const existingMerchants = new Set((existing || []).map((a: { merchant_normalized: string }) => a.merchant_normalized));
    const newAlerts = increases.filter(i => !existingMerchants.has(i.merchantNormalized));

    if (newAlerts.length > 0) {
      await admin.from('price_increase_alerts').insert(
        newAlerts.map(i => ({
          user_id: user.id,
          merchant_name: i.merchantName,
          merchant_normalized: i.merchantNormalized,
          old_amount: i.oldAmount,
          new_amount: i.newAmount,
          increase_pct: i.increasePct,
          annual_impact: i.annualImpact,
          old_date: i.oldDate,
          new_date: i.newDate,
          status: 'active',
        }))
      );
    }
  }

  // Return all active alerts sorted by annual impact
  const { data: alerts } = await admin
    .from('price_increase_alerts')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('annual_impact', { ascending: false });

  return NextResponse.json({ alerts: alerts || [] });
}
