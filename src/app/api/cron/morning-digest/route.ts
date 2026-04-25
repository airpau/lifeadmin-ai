import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { canSendEmail, markEmailSent } from '@/lib/email-rate-limit';
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface PriceAlert {
  merchant_name: string;
  old_amount: number;
  new_amount: number;
  increase_pct: number;
  annual_impact: number;
}

interface UpcomingRenewal {
  provider_name: string;
  amount: number;
  category: string | null;
  next_billing_date: string;
  billing_cycle: string;
  daysUntil: number;
}

function buildDigestEmail(
  userName: string,
  priceAlerts: PriceAlert[],
  renewals: UpcomingRenewal[],
): { subject: string; html: string } {
  const totalItems = priceAlerts.length + renewals.length;

  let subject: string;
  if (priceAlerts.length > 0 && renewals.length > 0) {
    subject = `${totalItems} thing${totalItems === 1 ? '' : 's'} need your attention today`;
  } else if (priceAlerts.length > 0) {
    const totalExtra = priceAlerts.reduce((s, a) => s + a.annual_impact, 0);
    subject = priceAlerts.length === 1
      ? `Price increase detected: ${priceAlerts[0].merchant_name} went up ${priceAlerts[0].increase_pct}%`
      : `${priceAlerts.length} price increases detected — £${totalExtra.toFixed(0)} extra per year`;
  } else {
    subject = renewals.length === 1
      ? `Heads up: ${renewals[0].provider_name} renews in ${renewals[0].daysUntil} days`
      : `Heads up: ${renewals.length} renewals coming up`;
  }

  const priceSection = priceAlerts.length === 0 ? '' : `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="padding-bottom:12px;">
          <span style="display:inline-block; background:#fff7ed; border:1px solid #fde68a; color:#b45309; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; padding:4px 10px; border-radius:4px;">Price increases</span>
        </td>
      </tr>
      ${priceAlerts.map(alert => `
      <tr>
        <td style="padding-bottom:8px;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbf5; border:1px solid #fde68a; border-radius:8px;">
            <tr>
              <td style="padding:16px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td><span style="color:#0a1628; font-size:15px; font-weight:600;">${alert.merchant_name}</span></td>
                    <td align="right"><span style="color:#b45309; font-size:14px; font-weight:700;">+${alert.increase_pct}%</span></td>
                  </tr>
                  <tr>
                    <td style="padding-top:4px;"><span style="color:#6b7280; font-size:13px;">Was &pound;${Number(alert.old_amount).toFixed(2)} &rarr; now &pound;${Number(alert.new_amount).toFixed(2)}</span></td>
                    <td align="right" style="padding-top:4px;"><span style="color:#b45309; font-size:12px; font-weight:600;">+&pound;${Number(alert.annual_impact).toFixed(2)}/yr</span></td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding-top:10px;">
                      <a href="https://paybacker.co.uk/dashboard/complaints?company=${encodeURIComponent(alert.merchant_name)}" style="color:#059669; font-size:13px; text-decoration:underline;">Write complaint letter &rarr;</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </td>
      </tr>`).join('')}
    </table>`;

  const renewalSection = renewals.length === 0 ? '' : `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        <td style="padding-bottom:12px;">
          <span style="display:inline-block; background:#eff6ff; border:1px solid #bfdbfe; color:#1d4ed8; font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; padding:4px 10px; border-radius:4px;">Upcoming renewals</span>
        </td>
      </tr>
      <tr>
        <td>
          <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb; border-radius:8px; border-collapse:collapse;">
            ${renewals.map((r, i) => `
            <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f9fafb'};">
              <td style="padding:12px 16px; border-bottom:${i < renewals.length - 1 ? '1px solid #e5e7eb' : 'none'};">
                <div style="color:#0a1628; font-size:14px; font-weight:600;">${r.provider_name}</div>
                <div style="color:#6b7280; font-size:12px; margin-top:2px;">in ${r.daysUntil} days &middot; ${new Date(r.next_billing_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</div>
              </td>
              <td align="right" style="padding:12px 16px; border-bottom:${i < renewals.length - 1 ? '1px solid #e5e7eb' : 'none'};">
                <div style="color:#0a1628; font-size:15px; font-weight:700;">&pound;${r.amount.toFixed(2)}</div>
                <div style="color:#6b7280; font-size:11px;">/${r.billing_cycle}</div>
              </td>
            </tr>`).join('')}
          </table>
        </td>
      </tr>
    </table>`;

  const introText = priceAlerts.length > 0 && renewals.length > 0
    ? `We spotted ${priceAlerts.length} price ${priceAlerts.length === 1 ? 'increase' : 'increases'} and ${renewals.length} upcoming ${renewals.length === 1 ? 'renewal' : 'renewals'} on your account.`
    : priceAlerts.length > 0
      ? `We spotted ${priceAlerts.length === 1 ? 'a price increase' : `${priceAlerts.length} price increases`} on your recurring payments.`
      : `You have ${renewals.length} ${renewals.length === 1 ? 'subscription renewing' : 'subscriptions renewing'} soon.`;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Your morning digest</title></head>
<body style="margin:0; padding:0; background:#f3f4f6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#0a1628; border-radius:12px 12px 0 0; padding:20px 32px;">
            <span style="color:#ffffff; font-size:22px; font-weight:800; letter-spacing:-0.5px;">Pay<span style="color:#34d399;">backer</span></span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff; padding:32px 32px 24px;">

            <p style="color:#0a1628; font-size:16px; line-height:1.6; margin:0 0 28px;">
              Hi ${userName},<br><br>${introText}
            </p>

            ${priceSection}
            ${renewalSection}

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
              <tr>
                <td style="background:#0a1628; border-radius:8px; padding:14px 28px;">
                  <a href="https://paybacker.co.uk/dashboard" style="color:#ffffff; font-size:14px; font-weight:700; text-decoration:none;">Open Dashboard &rarr;</a>
                </td>
              </tr>
            </table>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb; border-top:1px solid #e5e7eb; border-radius:0 0 12px 12px; padding:20px 32px; text-align:center;">
            <p style="color:#6b7280; font-size:12px; line-height:1.6; margin:0;">
              Paybacker LTD &middot; <a href="https://paybacker.co.uk" style="color:#6b7280;">paybacker.co.uk</a>
              &middot; <a href="https://paybacker.co.uk/dashboard/profile" style="color:#6b7280;">Manage preferences</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, html };
}

/**
 * Morning digest cron — sends ONE combined email per user covering:
 * - Price increase alerts detected today (inserted by price-increases cron at 7:30am UTC)
 * - Subscriptions renewing within 7, 14, or 30 days
 *
 * Schedule: 8:00am UTC (9:00am BST) — configured in vercel.json
 * This runs 30 minutes after price-increases so new alerts are available to collect.
 * renewal-reminders cron is removed from vercel.json — this replaces its email.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  let totalSent = 0;
  const errors: string[] = [];

  // ─── Step 1: Today's price increase alerts per user ──────────────────────
  const { data: priceRows } = await supabase
    .from('price_increase_alerts')
    .select('user_id, merchant_name, old_amount, new_amount, increase_pct, annual_impact')
    .eq('status', 'active')
    .gte('created_at', today.toISOString());

  const priceByUser = new Map<string, PriceAlert[]>();
  for (const row of priceRows ?? []) {
    if (!priceByUser.has(row.user_id)) priceByUser.set(row.user_id, []);
    priceByUser.get(row.user_id)!.push(row as PriceAlert);
  }

  // ─── Step 2: Upcoming renewals per user (7, 14, 30 day windows) ─────────
  // Process urgent windows first so each provider appears only once at its nearest due date.
  const renewalByUser = new Map<string, UpcomingRenewal[]>();

  for (const days of [7, 14, 30]) {
    const target = new Date();
    target.setDate(target.getDate() + days);
    const dateStr = target.toISOString().split('T')[0];
    const nextDayStr = new Date(target.getTime() + 86400000).toISOString().split('T')[0];

    const { data: subs } = await supabase
      .from('subscriptions')
      .select('user_id, provider_name, amount, category, next_billing_date, billing_cycle')
      .is('dismissed_at', null)
      .eq('status', 'active')
      .not('next_billing_date', 'is', null)
      .gte('next_billing_date', dateStr)
      .lt('next_billing_date', nextDayStr);

    for (const sub of subs ?? []) {
      if (!renewalByUser.has(sub.user_id)) renewalByUser.set(sub.user_id, []);
      const existing = renewalByUser.get(sub.user_id)!;
      if (!existing.some(r => r.provider_name === sub.provider_name)) {
        existing.push({
          provider_name: sub.provider_name,
          amount: parseFloat(String(sub.amount)),
          category: sub.category,
          next_billing_date: sub.next_billing_date,
          billing_cycle: sub.billing_cycle,
          daysUntil: days,
        });
      }
    }
  }

  // ─── Step 3: Users with anything to report ───────────────────────────────
  const allUserIds = [...new Set([...priceByUser.keys(), ...renewalByUser.keys()])];
  if (allUserIds.length === 0) {
    return NextResponse.json({ users_checked: 0, emails_sent: 0 });
  }

  // ─── Step 4: Profiles ─────────────────────────────────────────────────────
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, first_name, subscription_tier')
    .in('id', allUserIds);

  const profileMap = new Map((profiles ?? []).map(p => [p.id, p]));

  // ─── Step 5: One digest email per user ───────────────────────────────────
  for (const userId of allUserIds) {
    try {
      const profile = profileMap.get(userId);
      if (!profile?.email) continue;

      const isPaid = profile.subscription_tier === 'essential' || profile.subscription_tier === 'pro';
      if (!isPaid) continue;

      const rateCheck = await canSendEmail(supabase, userId, 'morning_digest');
      if (!rateCheck.allowed) continue;

      // Per-day dedup: skip if digest already sent today
      const { data: alreadySent } = await supabase
        .from('tasks')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'morning_digest')
        .eq('description', `digest_${todayStr}`)
        .maybeSingle();
      if (alreadySent) continue;

      const priceAlerts = priceByUser.get(userId) ?? [];
      const renewals = renewalByUser.get(userId) ?? [];
      if (priceAlerts.length === 0 && renewals.length === 0) continue;

      const userName = profile.first_name || profile.full_name?.split(' ')[0] || 'there';
      const { subject, html } = buildDigestEmail(userName, priceAlerts, renewals);

      const { error } = await resend.emails.send({
        from: FROM_EMAIL,
        to: profile.email,
        replyTo: REPLY_TO,
        subject,
        html,
      });

      if (error) {
        errors.push(`Resend error for ${userId}: ${error.message}`);
        continue;
      }

      await markEmailSent(supabase, userId, 'morning_digest', subject);
      // Also store dedup key so we never send twice in one day
      await supabase.from('tasks').insert({
        user_id: userId,
        type: 'morning_digest',
        title: subject,
        description: `digest_${todayStr}`,
        status: 'completed',
      });
      totalSent++;
    } catch (err) {
      errors.push(`Error for ${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    users_checked: allUserIds.length,
    emails_sent: totalSent,
    errors: errors.length > 0 ? errors : undefined,
  });
}
