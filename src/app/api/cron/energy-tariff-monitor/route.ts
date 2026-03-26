import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface TariffData {
  provider: string;
  tariff_name: string;
  tariff_type: string;
  fuel_type: string;
  annual_cost_estimate: number | null;
  monthly_cost_estimate: number | null;
  standing_charge_pence: number | null;
  unit_rate_pence: number | null;
  exit_fee: number | null;
  term_months: number | null;
}

async function researchCurrentTariffs(): Promise<TariffData[]> {
  const perplexityKey = process.env.PERPLEXITY_API_KEY;
  if (!perplexityKey) return [];

  try {
    const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    const res = await fetch('https://api.perplexity.ai/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${perplexityKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'sonar',
        messages: [{
          role: 'user',
          content: `What are the cheapest UK energy tariffs available today (${today})? I need the top 8 cheapest dual fuel (gas + electricity) tariffs for a typical UK household (medium usage, 3-bed semi). For each tariff provide: provider name, tariff name, whether it's fixed or variable, estimated annual cost in pounds, estimated monthly cost, standing charge in pence/day, unit rate in pence/kWh, exit fee if any, and contract term in months. Include Ofgem price cap rate for comparison. Return ONLY a JSON array of objects with keys: provider, tariff_name, tariff_type (fixed/variable), annual_cost, monthly_cost, standing_charge_pence, unit_rate_pence, exit_fee, term_months. No other text.`,
        }],
      }),
    });

    if (!res.ok) return [];
    const data = await res.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Extract JSON from response
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]);
    return parsed.map((t: any) => ({
      provider: t.provider || 'Unknown',
      tariff_name: t.tariff_name || 'Unknown',
      tariff_type: t.tariff_type || 'variable',
      fuel_type: 'dual',
      annual_cost_estimate: t.annual_cost ? Math.round(t.annual_cost) : null,
      monthly_cost_estimate: t.monthly_cost ? Math.round(t.monthly_cost) : null,
      standing_charge_pence: t.standing_charge_pence || null,
      unit_rate_pence: t.unit_rate_pence || null,
      exit_fee: t.exit_fee || 0,
      term_months: t.term_months || null,
    }));
  } catch {
    return [];
  }
}

function buildAlertEmail(
  userName: string,
  currentProvider: string,
  currentAnnualCost: number,
  cheapestTariffs: TariffData[],
  daysUntilEnd: number | null,
): string {
  const potentialSaving = cheapestTariffs[0]?.annual_cost_estimate
    ? currentAnnualCost - cheapestTariffs[0].annual_cost_estimate
    : 0;

  const urgencyBanner = daysUntilEnd !== null && daysUntilEnd <= 30
    ? `<div style="background: #dc2626; color: white; padding: 12px 20px; border-radius: 8px; margin-bottom: 20px; font-weight: bold;">
        Your ${currentProvider} contract ends in ${daysUntilEnd} day${daysUntilEnd !== 1 ? 's' : ''}. Act now to avoid rolling onto an expensive variable tariff.
      </div>`
    : '';

  const tariffRows = cheapestTariffs.slice(0, 5).map(t => `
    <tr>
      <td style="padding: 10px 12px; border-bottom: 1px solid #1e293b; color: #e2e8f0;">${t.provider}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #1e293b; color: #94a3b8;">${t.tariff_name}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #1e293b; color: #94a3b8;">${t.tariff_type}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #1e293b; color: #34d399; font-weight: bold;">${t.annual_cost_estimate ? `£${t.annual_cost_estimate}` : 'N/A'}/yr</td>
    </tr>
  `).join('');

  return `
    <div style="font-family: 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 40px; border-radius: 16px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <span style="font-size: 24px; font-weight: bold; color: white;">Pay<span style="color: #34d399;">backer</span></span>
      </div>

      ${urgencyBanner}

      <h1 style="color: white; font-size: 22px; margin-bottom: 8px;">Energy Tariff Alert</h1>
      <p style="color: #94a3b8; font-size: 15px; line-height: 1.6;">
        Hi ${userName}, we've checked the latest UK energy tariffs and found ${potentialSaving > 0 ? `you could save up to <strong style="color: #34d399;">£${Math.round(potentialSaving)}/year</strong> by switching from ${currentProvider}.` : `some competitive rates worth comparing against your ${currentProvider} tariff.`}
      </p>

      <div style="background: #162544; border-radius: 12px; padding: 20px; margin: 24px 0;">
        <p style="color: #34d399; font-weight: bold; margin: 0 0 4px;">Your current energy cost</p>
        <p style="color: white; font-size: 28px; font-weight: bold; margin: 0;">£${Math.round(currentAnnualCost)}<span style="color: #94a3b8; font-size: 14px; font-weight: normal;">/year</span></p>
        <p style="color: #94a3b8; font-size: 13px; margin: 4px 0 0;">${currentProvider}</p>
      </div>

      <h2 style="color: white; font-size: 16px; margin-bottom: 12px;">Cheapest tariffs available now</h2>
      <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
        <thead>
          <tr style="border-bottom: 2px solid #1e3a5f;">
            <th style="padding: 8px 12px; text-align: left; color: #64748b;">Provider</th>
            <th style="padding: 8px 12px; text-align: left; color: #64748b;">Tariff</th>
            <th style="padding: 8px 12px; text-align: left; color: #64748b;">Type</th>
            <th style="padding: 8px 12px; text-align: left; color: #64748b;">Annual</th>
          </tr>
        </thead>
        <tbody>
          ${tariffRows}
        </tbody>
      </table>

      <div style="text-align: center; margin: 28px 0;">
        <a href="https://paybacker.co.uk/deals/energy" style="display: inline-block; background: #34d399; color: #0f172a; font-weight: bold; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-size: 15px;">
          Compare Energy Deals
        </a>
      </div>

      <p style="color: #64748b; font-size: 12px; text-align: center;">
        Paybacker checks energy tariffs daily so you never overpay. Prices are estimates for typical UK medium usage.
      </p>
    </div>
  `;
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();

  // 1. Research current tariffs via Perplexity
  const tariffs = await researchCurrentTariffs();

  if (tariffs.length === 0) {
    return NextResponse.json({ skipped: true, reason: 'No tariff data retrieved' });
  }

  // 2. Store tariffs in database
  const today = new Date().toISOString().split('T')[0];
  for (const t of tariffs) {
    await admin.from('energy_tariffs').insert({
      ...t,
      source: 'perplexity',
      valid_from: today,
    });
  }

  // 3. Find users with energy subscriptions
  const { data: energySubs } = await admin
    .from('subscriptions')
    .select('user_id, provider_name, amount, billing_cycle, annual_cost, contract_end_date, current_tariff')
    .eq('status', 'active')
    .eq('provider_type', 'energy')
    .is('dismissed_at', null);

  if (!energySubs || energySubs.length === 0) {
    return NextResponse.json({ success: true, tariffs_stored: tariffs.length, alerts_sent: 0 });
  }

  // Sort tariffs by annual cost (cheapest first)
  const cheapest = tariffs
    .filter(t => t.annual_cost_estimate && t.annual_cost_estimate > 0)
    .sort((a, b) => (a.annual_cost_estimate || 9999) - (b.annual_cost_estimate || 9999));

  let alertsSent = 0;

  // 4. Check each user's energy cost against cheapest available
  for (const sub of energySubs) {
    const userAnnualCost = sub.annual_cost
      ? parseFloat(String(sub.annual_cost))
      : sub.billing_cycle === 'monthly'
        ? parseFloat(String(sub.amount)) * 12
        : sub.billing_cycle === 'quarterly'
          ? parseFloat(String(sub.amount)) * 4
          : parseFloat(String(sub.amount));

    if (!userAnnualCost || userAnnualCost <= 0) continue;

    // Only alert if cheapest tariff is at least 5% cheaper
    const cheapestAnnual = cheapest[0]?.annual_cost_estimate || 0;
    if (cheapestAnnual <= 0 || cheapestAnnual >= userAnnualCost * 0.95) continue;

    // Check contract end date proximity
    let daysUntilEnd: number | null = null;
    if (sub.contract_end_date) {
      daysUntilEnd = Math.ceil(
        (new Date(sub.contract_end_date).getTime() - Date.now()) / (24 * 60 * 60 * 1000)
      );
    }

    // Don't spam: check if we already sent an alert this week
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { count: recentAlerts } = await admin
      .from('tasks')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', sub.user_id)
      .eq('type', 'energy_tariff_alert')
      .gte('created_at', weekAgo);

    if ((recentAlerts || 0) > 0) continue;

    // Get user email and name
    const { data: profile } = await admin
      .from('profiles')
      .select('email, first_name, full_name, subscription_tier')
      .eq('id', sub.user_id)
      .single();

    if (!profile?.email) continue;

    // Only send to Essential/Pro users (free users get one-time scan only)
    if (!profile.subscription_tier || profile.subscription_tier === 'free') continue;

    const userName = profile.first_name || profile.full_name?.split(' ')[0] || 'there';

    // Send alert email
    try {
      await resend.emails.send({
        from: FROM_EMAIL,
        replyTo: REPLY_TO,
        to: profile.email,
        subject: `Energy alert: save up to £${Math.round(userAnnualCost - cheapestAnnual)}/year by switching from ${sub.provider_name}`,
        html: buildAlertEmail(userName, sub.provider_name, userAnnualCost, cheapest, daysUntilEnd),
      });

      // Log the alert to prevent duplicates
      await admin.from('tasks').insert({
        user_id: sub.user_id,
        type: 'energy_tariff_alert',
        title: `Energy tariff alert: ${sub.provider_name}`,
        description: `Cheaper tariffs available. Current: £${Math.round(userAnnualCost)}/yr. Cheapest: £${cheapestAnnual}/yr (${cheapest[0]?.provider} ${cheapest[0]?.tariff_name}). Potential saving: £${Math.round(userAnnualCost - cheapestAnnual)}/yr.`,
        provider_name: sub.provider_name,
        disputed_amount: userAnnualCost - cheapestAnnual,
        status: 'pending_review',
      });

      alertsSent++;
    } catch (err: any) {
      console.error(`[energy-tariff] Failed to send alert to ${profile.email}:`, err.message);
    }
  }

  return NextResponse.json({
    success: true,
    tariffs_stored: tariffs.length,
    cheapest_annual: cheapest[0]?.annual_cost_estimate || null,
    cheapest_provider: cheapest[0]?.provider || null,
    energy_users_checked: energySubs.length,
    alerts_sent: alertsSent,
  });
}
