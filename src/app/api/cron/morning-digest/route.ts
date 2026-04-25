import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { detectPriceIncreases } from '@/lib/price-increase-detector';
import { sendMorningDigest, type MorningDigestPriceAlert, type MorningDigestRenewal } from '@/lib/email/morning-digest';
import { canSendEmail, markEmailSent } from '@/lib/email-rate-limit';
import { sendNotification } from '@/lib/notifications/dispatch';

export const maxDuration = 60;

// Government and tax payment merchants — price changes aren't consumer disputes.
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
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface UserDigestData {
  email: string;
  userName: string;
  tier: string;
  priceAlerts: MorningDigestPriceAlert[];
  renewals: MorningDigestRenewal[];
}

/**
 * Combined morning digest cron — runs daily at 8am.
 *
 * Replaces two separate crons (price-increases + renewal-reminders) so each user
 * receives at most ONE email per morning instead of two.
 *
 * 1. Detect price increases per user with bank connections → insert new alerts to DB.
 * 2. Find subscriptions renewing in 7, 14, or 30 days.
 * 3. Per user: if they have either/both, send ONE combined email.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const today = new Date().toISOString().split('T')[0];

  // ── Step 1: Price increases ──────────────────────────────────────────────────

  const userDigests = new Map<string, UserDigestData>();

  const { data: connections } = await supabase
    .from('bank_connections')
    .select('user_id')
    .eq('status', 'active')
    .is('archived_at', null);

  const bankUserIds = [...new Set((connections || []).map((c) => c.user_id))];

  let totalAlertsCreated = 0;

  for (const userId of bankUserIds) {
    try {
      const increases = await detectPriceIncreases(userId);
      if (increases.length === 0) continue;

      // Fetch ALL existing alerts regardless of status — dismissed/actioned means
      // the user already saw this merchant and made a decision. Don't re-alert.
      const { data: existingAlerts } = await supabase
        .from('price_increase_alerts')
        .select('merchant_normalized')
        .eq('user_id', userId)
        .in('status', ['active', 'dismissed', 'actioned']);

      const existingMerchants = new Set(
        (existingAlerts || []).map((a) => a.merchant_normalized),
      );

      const newAlerts: MorningDigestPriceAlert[] = [];

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

        if (!insertError) {
          totalAlertsCreated++;
          newAlerts.push({
            merchantNormalized: increase.merchantNormalized,
            oldAmount: increase.oldAmount,
            newAmount: increase.newAmount,
            increasePct: increase.increasePct,
            annualImpact: increase.annualImpact,
          });
        }
      }

      if (newAlerts.length > 0) {
        if (!userDigests.has(userId)) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('email, full_name, first_name, subscription_tier')
            .eq('id', userId)
            .single();

          if (profile?.email) {
            userDigests.set(userId, {
              email: profile.email,
              userName: profile.first_name || profile.full_name?.split(' ')[0] || 'there',
              tier: profile.subscription_tier || 'free',
              priceAlerts: [],
              renewals: [],
            });
          }
        }
        const digest = userDigests.get(userId);
        if (digest) digest.priceAlerts = newAlerts;
      }
    } catch (err) {
      console.error(`morning-digest: price increase error for ${userId}:`, err);
    }
  }

  // ── Step 2: Renewal reminders ────────────────────────────────────────────────

  const windows = [7, 14, 30];

  for (const days of windows) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const dateStr = targetDate.toISOString().split('T')[0];

    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);

    const { data: renewingSubs } = await supabase
      .from('subscriptions')
      .select('user_id, provider_name, amount, category, next_billing_date, billing_cycle, contract_type, provider_type')
      .is('dismissed_at', null)
      .eq('status', 'active')
      .not('next_billing_date', 'is', null)
      .gte('next_billing_date', dateStr)
      .lt('next_billing_date', nextDay.toISOString().split('T')[0]);

    if (!renewingSubs || renewingSubs.length === 0) continue;

    // Group by user
    const byUser = new Map<string, typeof renewingSubs>();
    for (const sub of renewingSubs) {
      if (!byUser.has(sub.user_id)) byUser.set(sub.user_id, []);
      byUser.get(sub.user_id)!.push(sub);
    }

    for (const [userId, subs] of byUser.entries()) {
      // Dedup: skip if a renewal reminder was already sent for this window+date.
      // Uses the same tasks key format as the old renewal-reminders cron so
      // there's no double-send if both routes run on the same day.
      const reminderKey = `renewal_${days}d_${dateStr}`;
      const { data: alreadySent } = await supabase
        .from('tasks')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'renewal_reminder')
        .eq('description', reminderKey)
        .maybeSingle();

      if (alreadySent) continue;

      if (!userDigests.has(userId)) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, full_name, first_name, subscription_tier')
          .eq('id', userId)
          .single();

        if (profile?.email) {
          userDigests.set(userId, {
            email: profile.email,
            userName: profile.first_name || profile.full_name?.split(' ')[0] || 'there',
            tier: profile.subscription_tier || 'free',
            priceAlerts: [],
            renewals: [],
          });
        }
      }

      const digest = userDigests.get(userId);
      if (!digest) continue;

      for (const sub of subs) {
        // Skip duplicates across windows (a sub might appear in both 7d and 14d windows)
        const alreadyAdded = digest.renewals.some((r) => r.provider_name === sub.provider_name);
        if (!alreadyAdded) {
          digest.renewals.push({
            provider_name: sub.provider_name,
            amount: parseFloat(String(sub.amount)),
            category: sub.category,
            next_billing_date: sub.next_billing_date,
            billing_cycle: sub.billing_cycle,
            contract_type: sub.contract_type,
            provider_type: sub.provider_type,
            daysUntilRenewal: days,
          });
        }
      }

      // Record the renewal window as sent so we don't re-send for this window tomorrow
      await supabase.from('tasks').insert({
        user_id: userId,
        type: 'renewal_reminder',
        title: `Renewal reminder: ${subs.length} subs in ${days} days`,
        description: reminderKey,
        status: 'completed',
      });
    }
  }

  // ── Step 3: Send combined digest per user ────────────────────────────────────

  let emailsSent = 0;
  const errors: string[] = [];

  for (const [userId, digest] of userDigests.entries()) {
    try {
      const isPaid = digest.tier === 'essential' || digest.tier === 'pro';

      // Price increase emails are Essential/Pro only; renewals go to all paid tiers too.
      // If user only has price alerts but is free, skip.
      const hasSendableContent =
        (digest.priceAlerts.length > 0 && isPaid) || digest.renewals.length > 0;

      if (!hasSendableContent) continue;

      const rateCheck = await canSendEmail(supabase, userId, 'morning_digest');
      if (!rateCheck.allowed) continue;

      const alertsToSend = isPaid ? digest.priceAlerts : [];
      const sent = await sendMorningDigest(digest.email, digest.userName, alertsToSend, digest.renewals);

      if (sent) {
        emailsSent++;
        await markEmailSent(
          supabase,
          userId,
          'morning_digest',
          `Morning digest: ${alertsToSend.length} price alert(s), ${digest.renewals.length} renewal(s) — ${today}`,
        );

        // Also fire Telegram/push for price increases if user has those channels
        if (alertsToSend.length > 0 && isPaid) {
          const headline =
            alertsToSend.length === 1
              ? `💸 *${alertsToSend[0].merchantNormalized}* went up £${(alertsToSend[0].newAmount - alertsToSend[0].oldAmount).toFixed(2)} (+${alertsToSend[0].increasePct}%)`
              : `💸 *${alertsToSend.length} price increases* detected on your bills`;
          const telegramText = `${headline}\n\n${alertsToSend.map((i) => `• ${i.merchantNormalized}: £${i.oldAmount} → £${i.newAmount} (+${i.increasePct}%)`).join('\n')}\n\nOpen Paybacker → Dashboard → Price increase alerts to action.`;

          await sendNotification(supabase, {
            userId,
            event: 'price_increase',
            telegram: { text: telegramText },
            push: { title: 'Price hike detected', body: headline.replace(/\*/g, '') },
          });
        }
      }
    } catch (err) {
      errors.push(`Error sending digest for ${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    users_with_data: userDigests.size,
    alerts_created: totalAlertsCreated,
    emails_sent: emailsSent,
    errors: errors.length > 0 ? errors : undefined,
  });
}
