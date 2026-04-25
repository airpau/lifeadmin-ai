import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { detectPriceIncreases } from '@/lib/price-increase-detector';
import { sendMorningDigest } from '@/lib/email/morning-digest';
import { canSendEmail, markEmailSent } from '@/lib/email-rate-limit';
import type { DigestPriceAlert, DigestRenewal } from '@/lib/email/morning-digest';
import { sendNotification } from '@/lib/notifications/dispatch';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Government and HMRC payments that vary for legitimate reasons (tax code
// changes, rate updates). Re-alerting every morning after dismissal would
// be harmful — these are excluded from price-increase detection entirely.
const GOVERNMENT_MERCHANT_BLOCKLIST = new Set([
  'HMRC',
  'DVLA',
  'Council Tax',
  'Test Valley Council Tax',
  'Winchester City Council Tax',
  'LB Hounslow Council Tax',
]);

function isGovernmentMerchant(merchantNormalized: string): boolean {
  if (GOVERNMENT_MERCHANT_BLOCKLIST.has(merchantNormalized)) return true;
  const lower = merchantNormalized.toLowerCase();
  return lower.includes('hmrc') || lower.includes('council tax') || lower.includes('dvla') || lower.includes('ndds');
}

const PAYMENT_CONTRACT_TYPES = new Set(['loan', 'mortgage', 'lease']);
const PAYMENT_PROVIDER_TYPES = new Set(['loan', 'mortgage', 'credit_card']);
const PAYMENT_CATEGORIES = new Set(['loan', 'mortgage', 'credit_card', 'finance', 'debt']);

function isScheduledPayment(sub: {
  contract_type?: string | null;
  provider_type?: string | null;
  category?: string | null;
}): boolean {
  if (sub.contract_type && PAYMENT_CONTRACT_TYPES.has(sub.contract_type.toLowerCase())) return true;
  if (sub.provider_type && PAYMENT_PROVIDER_TYPES.has(sub.provider_type.toLowerCase())) return true;
  if (sub.category && PAYMENT_CATEGORIES.has(sub.category.toLowerCase())) return true;
  return false;
}

/**
 * Consolidated morning digest cron — replaces the separate price-increases
 * and renewal-reminders crons that were racing each other at 8am, causing
 * users to receive two emails.
 *
 * For each user:
 * 1. Detect new price increases (skipping dismissed/active + government merchants)
 * 2. Find subscriptions renewing in 7, 14, or 30 days
 * 3. Send ONE combined email with both sections (if anything to report)
 *
 * Schedule: Daily at 8am — configured in vercel.json
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // === STEP 1: COLLECT PRICE INCREASES PER USER ===
  const { data: connections } = await supabase
    .from('bank_connections')
    .select('user_id')
    .eq('status', 'active')
    .is('archived_at', null);

  const bankUserIds = [...new Set((connections || []).map((c: { user_id: string }) => c.user_id))];

  // Map: userId → new price increases to include in email
  const priceIncreasesByUser = new Map<string, DigestPriceAlert[]>();
  let totalAlertsCreated = 0;

  for (const userId of bankUserIds) {
    try {
      const detected = await detectPriceIncreases(userId);
      if (detected.length === 0) continue;

      // Skip merchants that already have an alert (active OR dismissed) — dismissed
      // alerts were re-created daily because the old cron only checked status='active'.
      const { data: existingAlerts } = await supabase
        .from('price_increase_alerts')
        .select('merchant_normalized')
        .eq('user_id', userId)
        .in('status', ['active', 'dismissed']);

      const skipMerchants = new Set((existingAlerts || []).map((a: { merchant_normalized: string }) => a.merchant_normalized));

      const newIncreases = detected.filter(
        i => !skipMerchants.has(i.merchantNormalized) && !isGovernmentMerchant(i.merchantNormalized)
      );

      if (newIncreases.length === 0) continue;

      // Insert new alert rows — batch
      const insertRows = newIncreases.map(i => ({
        user_id: userId,
        merchant_name: i.merchantName,
        merchant_normalized: i.merchantNormalized,
        old_amount: i.oldAmount,
        new_amount: i.newAmount,
        increase_pct: i.increasePct,
        annual_impact: i.annualImpact,
        old_date: i.oldDate,
        new_date: i.newDate,
        status: 'active',
      }));

      const { error: insertError } = await supabase
        .from('price_increase_alerts')
        .insert(insertRows);

      if (insertError) {
        console.error(`price_increase_alerts insert failed for ${userId}:`, insertError.message);
        continue;
      }

      totalAlertsCreated += newIncreases.length;
      priceIncreasesByUser.set(userId, newIncreases.map(i => ({
        merchantNormalized: i.merchantNormalized,
        oldAmount: i.oldAmount,
        newAmount: i.newAmount,
        increasePct: i.increasePct,
        annualImpact: i.annualImpact,
      })));
    } catch (err) {
      console.error(`Price detection error for ${userId}:`, err instanceof Error ? err.message : String(err));
    }
  }

  // === STEP 2: COLLECT RENEWALS PER USER ===
  // Map: userId → { renewals: DigestRenewal[], reminderKeys: string[] }
  const renewalsByUser = new Map<string, { renewals: DigestRenewal[]; reminderKeys: string[] }>();

  for (const days of [7, 14, 30]) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + days);
    const dateStr = targetDate.toISOString().split('T')[0];
    const nextDay = new Date(targetDate);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextDayStr = nextDay.toISOString().split('T')[0];

    const { data: renewingSubs } = await supabase
      .from('subscriptions')
      .select('user_id, provider_name, amount, category, next_billing_date, billing_cycle, contract_type, provider_type')
      .is('dismissed_at', null)
      .eq('status', 'active')
      .not('next_billing_date', 'is', null)
      .gte('next_billing_date', dateStr)
      .lt('next_billing_date', nextDayStr);

    if (!renewingSubs || renewingSubs.length === 0) continue;

    // Group by user
    const byUser = new Map<string, typeof renewingSubs>();
    for (const sub of renewingSubs) {
      if (!byUser.has(sub.user_id)) byUser.set(sub.user_id, []);
      byUser.get(sub.user_id)!.push(sub);
    }

    for (const [userId, subs] of byUser) {
      // Check if we already sent a reminder for this window today
      const reminderKey = `renewal_${days}d_${dateStr}`;
      const { data: alreadySent } = await supabase
        .from('tasks')
        .select('id')
        .eq('user_id', userId)
        .eq('type', 'renewal_reminder')
        .eq('description', reminderKey)
        .maybeSingle();

      if (alreadySent) continue;

      // Accumulate into per-user map
      if (!renewalsByUser.has(userId)) {
        renewalsByUser.set(userId, { renewals: [], reminderKeys: [] });
      }
      const entry = renewalsByUser.get(userId)!;
      entry.reminderKeys.push(reminderKey);
      for (const sub of subs) {
        entry.renewals.push({
          provider_name: sub.provider_name,
          amount: parseFloat(String(sub.amount)),
          category: sub.category,
          next_billing_date: sub.next_billing_date,
          billing_cycle: sub.billing_cycle,
          daysUntil: days,
          contract_type: sub.contract_type,
          provider_type: sub.provider_type,
        });
      }
    }
  }

  // === STEP 3: SEND ONE EMAIL PER USER ===
  const allUserIds = new Set([...priceIncreasesByUser.keys(), ...renewalsByUser.keys()]);
  let totalEmailsSent = 0;
  const errors: string[] = [];

  for (const userId of allUserIds) {
    try {
      const rateCheck = await canSendEmail(supabase, userId, 'morning_digest');
      if (!rateCheck.allowed) continue;

      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name, first_name, subscription_tier')
        .eq('id', userId)
        .single();

      if (!profile?.email) continue;

      const isPaid = profile.subscription_tier === 'essential' || profile.subscription_tier === 'pro';
      const userName = profile.first_name || profile.full_name?.split(' ')[0] || 'there';

      // Only paid users receive price increase emails
      const priceAlerts = isPaid ? (priceIncreasesByUser.get(userId) ?? []) : [];
      const renewalEntry = renewalsByUser.get(userId);
      const renewals: DigestRenewal[] = renewalEntry?.renewals ?? [];

      if (priceAlerts.length === 0 && renewals.length === 0) continue;

      // Also fan out via Telegram/push for price increases (paid users)
      if (priceAlerts.length > 0) {
        const headline = priceAlerts.length === 1
          ? `💸 *${priceAlerts[0].merchantNormalized}* went up £${(priceAlerts[0].newAmount - priceAlerts[0].oldAmount).toFixed(2)} (+${priceAlerts[0].increasePct}%)`
          : `💸 *${priceAlerts.length} price increases detected* on your bills`;
        const telegramText = `${headline}\n\n${priceAlerts.map(i => `• ${i.merchantNormalized}: £${i.oldAmount} → £${i.newAmount} (+${i.increasePct}%)`).join('\n')}\n\nOpen Paybacker to action these.`;

        // Send telegram/push but NOT email — email goes via the digest below
        await sendNotification(supabase, {
          userId,
          event: 'price_increase',
          telegram: { text: telegramText },
          push: { title: 'Price hike detected', body: headline.replace(/\*/g, '') },
        });
      }

      const sent = await sendMorningDigest(profile.email, userName, priceAlerts, renewals);

      if (sent) {
        totalEmailsSent++;
        await markEmailSent(supabase, userId, 'morning_digest',
          `Morning digest: ${priceAlerts.length} price increase${priceAlerts.length === 1 ? '' : 's'}, ${renewals.length} renewal${renewals.length === 1 ? '' : 's'}`
        );

        // Record renewal dedup keys so this window isn't re-sent
        if (renewalEntry?.reminderKeys.length) {
          for (const reminderKey of renewalEntry.reminderKeys) {
            const dayMatch = reminderKey.match(/renewal_(\d+)d_/);
            const days = dayMatch ? parseInt(dayMatch[1]) : 0;
            await supabase.from('tasks').insert({
              user_id: userId,
              type: 'renewal_reminder',
              title: `Renewal reminder: ${renewals.filter(r => r.daysUntil === days).length} in ${days} days`,
              description: reminderKey,
              status: 'completed',
            });
          }
        }
      }
    } catch (err) {
      errors.push(`${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    users_checked: allUserIds.size,
    alerts_created: totalAlertsCreated,
    emails_sent: totalEmailsSent,
    errors: errors.length > 0 ? errors : undefined,
  });
}
