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
 * Daily contract end date alert cron.
 * 
 * 1. Finds subscriptions with contract_end_date approaching
 * 2. Creates contract_renewal_alerts (email + in_app) with dedup
 * 3. Sends tiered email alerts at 60/30/14/7/3 days before end
 * 4. Matches with best affiliate deals via find_best_deal_for_subscription()
 * 5. Creates in-app alerts for the subscriptions page
 * 
 * Schedule: Daily at 7am — configured in vercel.json
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const now = new Date();
  const alertWindows = [60, 30, 14, 7, 3]; // Days before contract end
  let emailsSent = 0;
  let inAppCreated = 0;

  // Find all active subscriptions with contract_end_date set and alerts enabled
  const { data: allSubs } = await supabase
    .from('subscriptions')
    .select('id, user_id, provider_name, amount, category, billing_cycle, contract_end_date, contract_start_date, contract_term_months, auto_renews, current_tariff, alerts_enabled, alert_before_days')
    .eq('status', 'active')
    .is('dismissed_at', null)
    .not('contract_end_date', 'is', null)
    .eq('alerts_enabled', true);

  if (!allSubs || allSubs.length === 0) {
    return NextResponse.json({ ok: true, emailsSent: 0, inAppCreated: 0, reason: 'No subscriptions with contract end dates' });
  }

  // Group by user
  const userSubs = new Map<string, typeof allSubs>();
  for (const sub of allSubs) {
    if (!userSubs.has(sub.user_id)) userSubs.set(sub.user_id, []);
    userSubs.get(sub.user_id)!.push(sub);
  }

  for (const [userId, subs] of userSubs.entries()) {
    // Get user profile
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name, first_name')
      .eq('id', userId)
      .single();

    if (!profile?.email) continue;

    const userName = profile.first_name || profile.full_name?.split(' ')[0] || 'there';

    for (const sub of subs) {
      const endDate = new Date(sub.contract_end_date);
      const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

      // Skip if contract already expired
      if (daysLeft < 0) continue;

      // Check which alert windows apply
      for (const window of alertWindows) {
        // Only fire alert if we're within ±1 day of the window
        if (Math.abs(daysLeft - window) > 1) continue;

        // Also respect user's alert_before_days preference
        if (daysLeft > (sub.alert_before_days || 30) && window !== 60 && window !== 30) continue;

        const alertType = `${window}d_before`;

        // Check for existing alert (dedup)
        const { data: existing } = await supabase
          .from('contract_renewal_alerts')
          .select('id')
          .eq('subscription_id', sub.id)
          .eq('user_id', userId)
          .eq('alert_type', alertType)
          .maybeSingle();

        if (existing) continue;

        // Try to find a better deal
        let dealData: { deal_id: string | null; saving_monthly: number | null; saving_annual: number | null; deal_provider: string | null; deal_price: number | null; deal_url: string | null } = {
          deal_id: null, saving_monthly: null, saving_annual: null, deal_provider: null, deal_price: null, deal_url: null
        };

        try {
          const { data: deal } = await supabase.rpc('find_best_deal_for_subscription', {
            p_subscription_id: sub.id,
          });
          if (deal && deal.length > 0) {
            const best = deal[0];
            dealData = {
              deal_id: best.deal_id || null,
              saving_monthly: best.monthly_saving || null,
              saving_annual: best.annual_saving || null,
              deal_provider: best.deal_provider || null,
              deal_price: best.deal_price || null,
              deal_url: best.deal_url || null,
            };
          }
        } catch (e) {
          // Deal matching is non-critical, continue without it
          console.error(`Deal matching failed for sub ${sub.id}:`, e);
        }

        // Calculate monthly amount for display
        const monthlyAmount = sub.billing_cycle === 'yearly'
          ? sub.amount / 12
          : sub.billing_cycle === 'quarterly'
            ? sub.amount / 3
            : sub.amount;

        // Create email alert record
        const { error: emailAlertErr } = await supabase
          .from('contract_renewal_alerts')
          .insert({
            subscription_id: sub.id,
            user_id: userId,
            provider_name: sub.provider_name,
            category: sub.category,
            contract_end_date: sub.contract_end_date,
            current_amount: monthlyAmount,
            alert_type: alertType,
            alert_channel: 'email',
            status: 'pending',
            matched_deal_id: dealData.deal_id,
            potential_saving_monthly: dealData.saving_monthly,
            potential_saving_annual: dealData.saving_annual,
          });

        if (emailAlertErr) {
          console.error(`Failed to create email alert for ${sub.provider_name}:`, emailAlertErr);
          continue;
        }

        // Create in-app alert record
        const { error: inAppErr } = await supabase
          .from('contract_renewal_alerts')
          .insert({
            subscription_id: sub.id,
            user_id: userId,
            provider_name: sub.provider_name,
            category: sub.category,
            contract_end_date: sub.contract_end_date,
            current_amount: monthlyAmount,
            alert_type: alertType,
            alert_channel: 'in_app',
            status: 'sent',
            matched_deal_id: dealData.deal_id,
            potential_saving_monthly: dealData.saving_monthly,
            potential_saving_annual: dealData.saving_annual,
          });

        if (!inAppErr) inAppCreated++;

        // Send email
        const rateCheck = await canSendEmail(supabase, userId, 'contract_end_alert');
        if (!rateCheck.allowed) {
          // Update alert status to rate_limited
          await supabase
            .from('contract_renewal_alerts')
            .update({ status: 'rate_limited' })
            .eq('subscription_id', sub.id)
            .eq('user_id', userId)
            .eq('alert_type', alertType)
            .eq('alert_channel', 'email');
          continue;
        }

        const sent = await sendContractEndAlert(
          profile.email,
          userName,
          [{
            provider_name: sub.provider_name,
            amount: monthlyAmount,
            category: sub.category,
            contract_end_date: sub.contract_end_date,
            auto_renews: sub.auto_renews !== false,
            current_tariff: sub.current_tariff,
            deal_provider: dealData.deal_provider,
            deal_price: dealData.deal_price,
            potential_saving_monthly: dealData.saving_monthly,
            deal_url: dealData.deal_url,
          }],
          daysLeft
        );

        if (sent) {
          // Update alert status to sent
          await supabase
            .from('contract_renewal_alerts')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('subscription_id', sub.id)
            .eq('user_id', userId)
            .eq('alert_type', alertType)
            .eq('alert_channel', 'email');
          // Record in tasks so global rate limiter counts this send
          await supabase.from('tasks').insert({
            user_id: userId,
            type: 'contract_end_alert',
            title: `Contract end alert: ${sub.provider_name} (${daysLeft}d)`,
            status: 'completed',
          });
          emailsSent++;
        }
      }
    }
  }

  console.log(`[contract-expiry] emails=${emailsSent}, in_app=${inAppCreated}`);
  return NextResponse.json({ ok: true, emailsSent, inAppCreated });
}
