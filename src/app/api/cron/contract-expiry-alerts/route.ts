import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendContractEndAlert } from '@/lib/email/contract-end-alerts';
import { canSendEmail } from '@/lib/email-rate-limit';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Daily contract expiry alert cron — 8am.
 *
 * Covers contracts uploaded to the Contract Vault (contract_extractions) that
 * have an explicit contract_end_date. The existing contract-expiry cron covers
 * the subscriptions table; this one fills the gap for vault-uploaded contracts.
 *
 * Deduplication via contract_expiry_alerts: alerts are only sent once per
 * threshold window (30d / 14d / 7d) per contract.
 *
 * Schedule: Daily at 8am — configured in vercel.json
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  let emailsSent = 0;
  let alertsCreated = 0;

  // 1. Find contract_extractions with upcoming contract_end_date
  const { data: extractions } = await supabase
    .from('contract_extractions')
    .select('id, user_id, provider_name, contract_type, contract_end_date, monthly_cost, subscription_id, dispute_id')
    .not('contract_end_date', 'is', null)
    .gte('contract_end_date', now.toISOString().split('T')[0])
    .lte('contract_end_date', thirtyDays.toISOString().split('T')[0]);

  // 2. Find subscriptions with upcoming contract_end_date not already covered
  //    by the existing contract-expiry cron (we look for ones linked to a contract_extraction)
  const { data: linkedSubs } = await supabase
    .from('subscriptions')
    .select('id, user_id, provider_name, category, contract_end_date, amount, billing_cycle, auto_renews, current_tariff')
    .not('contract_end_date', 'is', null)
    .eq('status', 'active')
    .is('dismissed_at', null)
    .gte('contract_end_date', now.toISOString().split('T')[0])
    .lte('contract_end_date', thirtyDays.toISOString().split('T')[0]);

  // Combine sources, dedup by user+provider+endDate
  type AlertSource = {
    userId: string;
    providerName: string;
    contractEndDate: string;
    contractExtractionId: string | null;
    subscriptionId: string | null;
    monthlyCost: number | null;
    category: string | null;
    autoRenews: boolean;
  };

  const sources: AlertSource[] = [];

  for (const ext of (extractions || [])) {
    if (!ext.provider_name || !ext.contract_end_date) continue;
    sources.push({
      userId: ext.user_id,
      providerName: ext.provider_name,
      contractEndDate: ext.contract_end_date,
      contractExtractionId: ext.id,
      subscriptionId: ext.subscription_id || null,
      monthlyCost: ext.monthly_cost ? parseFloat(String(ext.monthly_cost)) : null,
      category: ext.contract_type || null,
      autoRenews: false,
    });
  }

  for (const sub of (linkedSubs || [])) {
    if (!sub.provider_name || !sub.contract_end_date) continue;
    // Skip if already captured from contract_extractions for this subscription
    if (sources.some(s => s.subscriptionId === sub.id)) continue;

    const monthlyAmount = sub.billing_cycle === 'yearly'
      ? sub.amount / 12
      : sub.billing_cycle === 'quarterly'
        ? sub.amount / 3
        : sub.amount;

    sources.push({
      userId: sub.user_id,
      providerName: sub.provider_name,
      contractEndDate: sub.contract_end_date,
      contractExtractionId: null,
      subscriptionId: sub.id,
      monthlyCost: monthlyAmount ? parseFloat(String(monthlyAmount)) : null,
      category: sub.category || null,
      autoRenews: sub.auto_renews !== false,
    });
  }

  if (sources.length === 0) {
    return NextResponse.json({ ok: true, emailsSent: 0, alertsCreated: 0, reason: 'No contracts expiring within 30 days' });
  }

  // Group by user
  const byUser = new Map<string, AlertSource[]>();
  for (const src of sources) {
    if (!byUser.has(src.userId)) byUser.set(src.userId, []);
    byUser.get(src.userId)!.push(src);
  }

  for (const [userId, contracts] of byUser.entries()) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name, first_name')
      .eq('id', userId)
      .single();

    if (!profile?.email) continue;
    const userName = profile.first_name || profile.full_name?.split(' ')[0] || 'there';

    for (const contract of contracts) {
      const endDate = new Date(contract.contractEndDate);
      const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft < 0) continue;

      // Determine which alert threshold applies
      const threshold: 30 | 14 | 7 | null =
        daysLeft <= 7 ? 7 :
        daysLeft <= 14 ? 14 :
        daysLeft <= 30 ? 30 : null;

      if (!threshold) continue;
      const alertCol = `alert_${threshold}d_sent_at` as 'alert_30d_sent_at' | 'alert_14d_sent_at' | 'alert_7d_sent_at';

      // Find or create the alert record
      const query = supabase
        .from('contract_expiry_alerts')
        .select('id, alert_30d_sent_at, alert_14d_sent_at, alert_7d_sent_at');

      if (contract.contractExtractionId) {
        query.eq('contract_extraction_id', contract.contractExtractionId);
      } else if (contract.subscriptionId) {
        query.eq('subscription_id', contract.subscriptionId);
      }

      const { data: existing } = await query.maybeSingle();

      // If alert for this threshold already sent, skip
      if (existing && existing[alertCol]) continue;

      if (!existing) {
        // Create the alert record
        const { error: insertError } = await supabase
          .from('contract_expiry_alerts')
          .insert({
            user_id: userId,
            contract_extraction_id: contract.contractExtractionId,
            subscription_id: contract.subscriptionId,
            provider_name: contract.providerName,
            contract_end_date: contract.contractEndDate,
          });

        if (insertError) {
          console.error(`Failed to create contract_expiry_alert for ${contract.providerName}:`, insertError);
          continue;
        }
        alertsCreated++;
      }

      // Check email rate limit
      const rateCheck = await canSendEmail(supabase, userId, 'contract_expiry_alert');
      if (!rateCheck.allowed) continue;

      // Send email
      const sent = await sendContractEndAlert(
        profile.email,
        userName,
        [{
          provider_name: contract.providerName,
          amount: contract.monthlyCost || 0,
          category: contract.category,
          contract_end_date: contract.contractEndDate,
          auto_renews: contract.autoRenews,
          current_tariff: null,
          deal_provider: null,
          deal_price: null,
          potential_saving_monthly: null,
          deal_url: null,
        }],
        daysLeft
      );

      if (sent) {
        // Mark this threshold as sent
        const updateFilter = supabase
          .from('contract_expiry_alerts')
          .update({ [alertCol]: new Date().toISOString(), updated_at: new Date().toISOString() });

        if (contract.contractExtractionId) {
          await updateFilter.eq('contract_extraction_id', contract.contractExtractionId);
        } else if (contract.subscriptionId) {
          await updateFilter.eq('subscription_id', contract.subscriptionId);
        }

        emailsSent++;
      }
    }
  }

  console.log(`[contract-expiry-alerts] emailsSent=${emailsSent}, alertsCreated=${alertsCreated}`);
  return NextResponse.json({ ok: true, emailsSent, alertsCreated });
}
