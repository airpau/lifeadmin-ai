import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import { buildMorningDigestEmail, DigestPriceAlert, DigestRenewal } from '@/lib/email/morning-digest';
import { markEmailSent } from '@/lib/email-rate-limit';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// Subscription/provider types that are scheduled payments, not cancellable subs.
// These still appear in renewal reminders but don't get "find better deals" CTA.
const PAYMENT_CONTRACT_TYPES = new Set(['loan', 'mortgage', 'lease']);
const PAYMENT_PROVIDER_TYPES = new Set(['loan', 'mortgage', 'credit_card']);
const PAYMENT_CATEGORIES = new Set(['loan', 'mortgage', 'credit_card', 'finance', 'debt']);

function isScheduledPayment(r: DigestRenewal): boolean {
  if (r.contract_type && PAYMENT_CONTRACT_TYPES.has(r.contract_type.toLowerCase())) return true;
  if (r.provider_type && PAYMENT_PROVIDER_TYPES.has(r.provider_type.toLowerCase())) return true;
  if (r.category && PAYMENT_CATEGORIES.has(r.category.toLowerCase())) return true;
  return false;
}

/**
 * Morning digest cron — combines price increase alerts and renewal reminders
 * into ONE email per user.
 *
 * Schedule: Daily at 9am UTC (configured in vercel.json).
 * Runs AFTER the price-increases cron at 8am UTC, which detects increases and
 * stores them in price_increase_alerts without sending email.
 *
 * Price alerts: Essential/Pro users only.
 * Renewal reminders: all users with upcoming renewals.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const todayStr = new Date().toISOString().split('T')[0];

  // ── 1. Price increase alerts created today ─────────────────────────────────
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);

  const { data: todaysAlerts } = await supabase
    .from('price_increase_alerts')
    .select('user_id, merchant_normalized, old_amount, new_amount, increase_pct, annual_impact')
    .eq('status', 'active')
    .gte('created_at', todayStart.toISOString());

  // Group price alerts by user
  const userPriceAlerts = new Map<string, DigestPriceAlert[]>();
  for (const row of todaysAlerts || []) {
    if (!userPriceAlerts.has(row.user_id)) userPriceAlerts.set(row.user_id, []);
    userPriceAlerts.get(row.user_id)!.push({
      merchantNormalized: row.merchant_normalized,
      oldAmount: parseFloat(String(row.old_amount)),
      newAmount: parseFloat(String(row.new_amount)),
      increasePct: parseFloat(String(row.increase_pct)),
      annualImpact: parseFloat(String(row.annual_impact)),
    });
  }

  // ── 2. Upcoming renewals (7, 14, 30 day windows) ──────────────────────────
  const userRenewals = new Map<string, DigestRenewal[]>();

  for (const days of [7, 14, 30]) {
    const target = new Date();
    target.setDate(target.getDate() + days);
    const dateStr = target.toISOString().split('T')[0];
    const nextDayStr = new Date(target.getTime() + 86_400_000).toISOString().split('T')[0];

    const { data: subs } = await supabase
      .from('subscriptions')
      .select('user_id, provider_name, amount, category, next_billing_date, billing_cycle, contract_type, provider_type')
      .is('dismissed_at', null)
      .eq('status', 'active')
      .not('next_billing_date', 'is', null)
      .gte('next_billing_date', dateStr)
      .lt('next_billing_date', nextDayStr);

    for (const sub of subs || []) {
      if (!userRenewals.has(sub.user_id)) userRenewals.set(sub.user_id, []);
      userRenewals.get(sub.user_id)!.push({
        provider_name: sub.provider_name,
        amount: parseFloat(String(sub.amount)),
        category: sub.category,
        next_billing_date: sub.next_billing_date,
        billing_cycle: sub.billing_cycle,
        contract_type: sub.contract_type,
        provider_type: sub.provider_type,
        daysUntil: days,
      });
    }
  }

  // ── 3. Union of all affected user IDs ─────────────────────────────────────
  const allUserIds = new Set([...userPriceAlerts.keys(), ...userRenewals.keys()]);

  if (allUserIds.size === 0) {
    return NextResponse.json({ ok: true, sent: 0, skipped: 0 });
  }

  // ── 4. Batch-load profiles ─────────────────────────────────────────────────
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, email, full_name, first_name, subscription_tier')
    .in('id', [...allUserIds]);

  const profileMap = new Map(
    (profiles || []).map(p => [p.id, p])
  );

  // ── 5. Check which users already got a morning digest today ───────────────
  const { data: sentToday } = await supabase
    .from('tasks')
    .select('user_id')
    .in('user_id', [...allUserIds])
    .eq('type', 'morning_digest')
    .eq('description', todayStr);

  const alreadySentIds = new Set((sentToday || []).map(r => r.user_id));

  // ── 6. Send one email per user ────────────────────────────────────────────
  let totalSent = 0;
  let totalSkipped = 0;
  const errors: string[] = [];

  for (const userId of allUserIds) {
    if (alreadySentIds.has(userId)) { totalSkipped++; continue; }

    const profile = profileMap.get(userId);
    if (!profile?.email) { totalSkipped++; continue; }

    const isPaid = profile.subscription_tier === 'essential'
                || profile.subscription_tier === 'pro';

    // Price alerts: paid users only
    const priceAlerts = isPaid ? (userPriceAlerts.get(userId) || []) : [];
    // Renewals: all users
    const renewals = userRenewals.get(userId) || [];

    if (priceAlerts.length === 0 && renewals.length === 0) { totalSkipped++; continue; }

    const userName = profile.first_name || profile.full_name?.split(' ')[0] || 'there';

    // Tag each renewal with isScheduledPayment so the template can decide CTA
    const enrichedRenewals = renewals.map(r => ({ ...r, _isPayment: isScheduledPayment(r) }));
    void enrichedRenewals; // used implicitly via DigestRenewal fields in template

    try {
      const { subject, html } = buildMorningDigestEmail(userName, priceAlerts, renewals);

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

      // Log so the rate limiter knows a marketing email was sent today
      await markEmailSent(supabase, userId, 'morning_digest',
        `Morning digest: ${priceAlerts.length} price alerts, ${renewals.length} renewals`);

      // Also write the per-day dedup record
      await supabase.from('tasks').insert({
        user_id: userId,
        type: 'morning_digest',
        title: `Morning digest: ${priceAlerts.length} price alerts, ${renewals.length} renewals`,
        description: todayStr,
        status: 'completed',
      });

      totalSent++;
    } catch (err) {
      errors.push(`Error for ${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  console.log(`morning-digest: sent=${totalSent} skipped=${totalSkipped} errors=${errors.length}`);

  return NextResponse.json({
    ok: true,
    sent: totalSent,
    skipped: totalSkipped,
    errors: errors.length > 0 ? errors : undefined,
  });
}
