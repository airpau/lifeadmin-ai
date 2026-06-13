import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { buildContractEndEmail } from '@/lib/email/contract-end-alerts';
import { canSendEmail, markEmailSent } from '@/lib/email-rate-limit';
import { sendNotification } from '@/lib/notifications/dispatch';
import { isPayrollLike } from '@/lib/subscriptions/payroll-filter';
import { buildRenewalDigest, formatRenewalAmount, tierWindowDays } from '@/lib/subscriptions/renewal-digest';

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

  // Combine sources, dedup by user+provider+endDate.
  //
  // We carry the RAW amount + billing cycle (not a pre-squashed monthly
  // figure) so the digest can render the amount honestly with its real
  // cycle, and derive a monthly equivalent purely for value-tiering.
  type AlertSource = {
    userId: string;
    providerName: string;
    contractEndDate: string;
    contractExtractionId: string | null;
    subscriptionId: string | null;
    rawAmount: number | null;
    billingCycle: string | null;
    category: string | null;
    autoRenews: boolean;
  };

  const sources: AlertSource[] = [];

  for (const ext of (extractions || [])) {
    if (!ext.provider_name || !ext.contract_end_date) continue;
    // Skip payroll / salary / wages rows mis-detected as contracts.
    if (isPayrollLike({ provider_name: ext.provider_name, category: ext.contract_type })) continue;
    sources.push({
      userId: ext.user_id,
      providerName: ext.provider_name,
      contractEndDate: ext.contract_end_date,
      contractExtractionId: ext.id,
      subscriptionId: ext.subscription_id || null,
      // contract_extractions stores a monthly_cost (already per-month).
      rawAmount: ext.monthly_cost != null ? parseFloat(String(ext.monthly_cost)) : null,
      billingCycle: 'monthly',
      category: ext.contract_type || null,
      autoRenews: false,
    });
  }

  for (const sub of (linkedSubs || [])) {
    if (!sub.provider_name || !sub.contract_end_date) continue;
    // Skip payroll / salary / wages rows mis-detected as subscriptions.
    if (isPayrollLike(sub)) continue;
    // Skip if already captured from contract_extractions for this subscription
    if (sources.some(s => s.subscriptionId === sub.id)) continue;

    sources.push({
      userId: sub.user_id,
      providerName: sub.provider_name,
      contractEndDate: sub.contract_end_date,
      contractExtractionId: null,
      subscriptionId: sub.id,
      rawAmount: sub.amount != null ? parseFloat(String(sub.amount)) : null,
      billingCycle: sub.billing_cycle ?? null,
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

  let digestsSent = 0;

  for (const [userId, contracts] of byUser.entries()) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('email, full_name, first_name')
      .eq('id', userId)
      .single();

    if (!profile?.email) continue;
    const userName = profile.first_name || profile.full_name?.split(' ')[0] || 'there';

    // ---- 1. Decide which of this user's contracts are DUE today ----
    // Each contract gets exactly ONE value-tiered warning, and is then
    // marked digest_sent_at so it never re-alerts. Collect all due ones so
    // they go out in a SINGLE digest rather than one message each.
    type DueItem = {
      src: AlertSource;
      daysLeft: number;
      amount: ReturnType<typeof formatRenewalAmount>;
    };
    const due: DueItem[] = [];

    for (const contract of contracts) {
      const endDate = new Date(contract.contractEndDate);
      const daysLeft = Math.ceil((endDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (daysLeft < 0) continue;

      const amount = formatRenewalAmount(contract.rawAmount, contract.billingCycle);
      const window = tierWindowDays(amount.monthly);
      if (daysLeft > window) continue; // not yet inside this contract's tier window

      // Find or create the dedup row, then check digest_sent_at.
      const query = supabase
        .from('contract_expiry_alerts')
        .select('id, digest_sent_at');
      if (contract.contractExtractionId) {
        query.eq('contract_extraction_id', contract.contractExtractionId);
      } else if (contract.subscriptionId) {
        query.eq('subscription_id', contract.subscriptionId);
      }
      const { data: existing } = await query.maybeSingle();

      if (existing?.digest_sent_at) continue; // already alerted once

      if (!existing) {
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

      due.push({ src: contract, daysLeft, amount });
    }

    if (due.length === 0) continue;

    // Most-urgent first so the numbered list leads with the soonest renewal.
    due.sort((a, b) => a.daysLeft - b.daysLeft);

    // Email rate limit (only email is rate-limited; telegram/whatsapp/push
    // route through the dispatcher which respects channel prefs + quiet hours).
    const rateCheck = await canSendEmail(supabase, userId, 'contract_expiry_alert');
    if (!rateCheck.allowed) continue;

    // ---- 2. Build ONE digest across all due contracts ----
    const { subject, html } = buildContractEndEmail(
      userName,
      due.map((d) => ({
        provider_name: d.src.providerName,
        amount: d.amount.monthly, // email card shows monthly equivalent
        category: d.src.category,
        contract_end_date: d.src.contractEndDate,
        auto_renews: d.src.autoRenews,
        current_tariff: null,
        deal_provider: null,
        deal_price: null,
        potential_saving_monthly: null,
        deal_url: null,
      })),
      due[0].daysLeft, // urgency styling keyed off the soonest renewal
    );

    const digest = buildRenewalDigest(
      due.map((d) => ({
        providerName: d.src.providerName,
        amountDisplay: d.amount.display,
        daysLeft: d.daysLeft,
      })),
    );

    // WhatsApp template variables reject raw newlines (Twilio 21656), so the
    // single-line digest is wrapped in the approved single-var
    // paybacker_pocket_agent_reply template — same out-of-window pattern the
    // morning brief uses. The dispatcher resolves the template + respects the
    // user's channel prefs and quiet hours.
    const dispatch = await sendNotification(supabase, {
      userId,
      event: 'contract_expiry',
      email: { subject, html, to: profile.email },
      telegram: { text: digest.telegram },
      whatsapp: {
        templateName: 'paybacker_pocket_agent_reply',
        templateParameters: [digest.whatsapp],
      },
      push: {
        title: due.length === 1
          ? `${due[0].src.providerName} contract ending`
          : `${due.length} renewals coming up`,
        body: due.length === 1
          ? `Ends in ${due[0].daysLeft} days`
          : `Soonest in ${due[0].daysLeft} days — tap to review`,
      },
    });

    const sent = dispatch.delivered.length > 0;
    if (!sent) continue;

    // Log the digest as an outbound WhatsApp turn so the Pocket Agent can
    // resolve "CANCEL 1" / "CANCEL <provider>" against it in its
    // conversation history. Proactive dispatcher sends are NOT auto-logged,
    // so without this the agent would have no record of what "1" refers to.
    if (dispatch.delivered.includes('whatsapp')) {
      const { data: waSession } = await supabase
        .from('whatsapp_sessions')
        .select('whatsapp_phone')
        .eq('user_id', userId)
        .eq('is_active', true)
        .maybeSingle();
      if (waSession?.whatsapp_phone) {
        await supabase.from('whatsapp_message_log').insert({
          user_id: userId,
          whatsapp_phone: waSession.whatsapp_phone,
          direction: 'outbound',
          message_type: 'template',
          template_name: 'paybacker_pocket_agent_reply',
          message_text: digest.telegram, // newline copy — clearest number→provider map for the agent
        }).then(undefined, (e) => console.warn('[contract-expiry-alerts] digest log failed', e));
      }
    }

    // Mark every contract in this digest so it never re-alerts.
    const stamp = new Date().toISOString();
    for (const d of due) {
      const upd = supabase
        .from('contract_expiry_alerts')
        .update({ digest_sent_at: stamp, updated_at: stamp });
      if (d.src.contractExtractionId) {
        await upd.eq('contract_extraction_id', d.src.contractExtractionId);
      } else if (d.src.subscriptionId) {
        await upd.eq('subscription_id', d.src.subscriptionId);
      }
    }

    if (dispatch.delivered.includes('email')) {
      await markEmailSent(supabase, userId, 'contract_expiry_alert', `Renewal digest: ${due.length} contract${due.length === 1 ? '' : 's'}`);
      emailsSent++;
    }
    digestsSent++;
  }

  console.log(`[contract-expiry-alerts] digestsSent=${digestsSent}, emailsSent=${emailsSent}, alertsCreated=${alertsCreated}`);
  return NextResponse.json({ ok: true, digestsSent, emailsSent, alertsCreated });
}
