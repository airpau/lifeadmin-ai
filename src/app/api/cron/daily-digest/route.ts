import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { detectPriceIncreases } from '@/lib/price-increase-detector';
import { findDealOpportunities } from '@/lib/email/deal-alerts';
import { updateUserOpportunityScore } from '@/lib/opportunity-scoring';
import { buildDailyDigestEmail } from '@/lib/email/daily-digest';
import { canSendEmail, markEmailSent } from '@/lib/email-rate-limit';
import { sendNotification } from '@/lib/notifications/dispatch';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Daily digest cron — consolidates price increases, deal opportunities, and
 * targeted savings alerts into ONE email per user per day.
 *
 * Replaces three separate crons:
 *   - deal-alerts (Mon 9am)
 *   - targeted-deals (Wed+Fri 9am)
 *   - price-increases (daily 8am)
 *
 * Schedule: daily at 8:00 UTC — after bank sync completes (3am, 6am)
 * so price-increase detection sees fresh transactions.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const now = new Date();

  // ── Fetch eligible users ──────────────────────────────────────────────
  // Users with active bank connections OR active subscriptions.
  // Using a union query via profiles + left join to avoid N+1.
  const { data: userRows, error: userError } = await supabase
    .from('profiles')
    .select('id, email, full_name, first_name, subscription_tier')
    .not('email', 'is', null);

  if (userError || !userRows || userRows.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, reason: 'No eligible users' });
  }

  // Filter to users who have either bank connections or subscriptions.
  // We do this in batches to keep the query simple.
  const userIds = userRows.map((u) => u.id);
  const batchSize = 200;
  const eligibleUserIds = new Set<string>();

  for (let i = 0; i < userIds.length; i += batchSize) {
    const batch = userIds.slice(i, i + batchSize);

    const [connRes, subRes] = await Promise.all([
      supabase.from('bank_connections').select('user_id').eq('status', 'active').is('archived_at', null).in('user_id', batch),
      supabase.from('subscriptions').select('user_id').eq('status', 'active').is('dismissed_at', null).in('user_id', batch),
    ]);

    for (const c of connRes.data || []) eligibleUserIds.add(c.user_id);
    for (const s of subRes.data || []) eligibleUserIds.add(s.user_id);
  }

  // ── Cooldown windows for deal + score sections ────────────────────────
  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  // ── Main loop ─────────────────────────────────────────────────────────
  let sent = 0;
  let skipped = 0;
  let noContent = 0;
  const errors: string[] = [];

  for (const user of userRows) {
    if (!eligibleUserIds.has(user.id)) {
      skipped++;
      continue;
    }

    try {
      // 1) Rate limit check
      const rateCheck = await canSendEmail(supabase, user.id, 'daily_digest');
      if (!rateCheck.allowed) {
        skipped++;
        continue;
      }

      // 2) Price increases (always run — time-sensitive)
      const increases = await detectPriceIncreases(user.id);
      const { data: existingAlerts } = await supabase
        .from('price_increase_alerts')
        .select('merchant_normalized')
        .eq('user_id', user.id)
        .in('status', ['active', 'dismissed', 'actioned']);

      const existingMerchants = new Set(
        (existingAlerts || []).map((a) => a.merchant_normalized)
      );

      const newIncreases = [];
      for (const inc of increases) {
        if (existingMerchants.has(inc.merchantNormalized)) continue;

        // Insert new alert
        const { error: insertErr } = await supabase
          .from('price_increase_alerts')
          .insert({
            user_id: user.id,
            merchant_name: inc.merchantName,
            merchant_normalized: inc.merchantNormalized,
            old_amount: inc.oldAmount,
            new_amount: inc.newAmount,
            increase_pct: inc.increasePct,
            annual_impact: inc.annualImpact,
            old_date: inc.oldDate,
            new_date: inc.newDate,
            category: inc.category,
            status: 'active',
          });

        if (insertErr) {
          errors.push(`Price alert insert failed for ${user.id}: ${insertErr.message}`);
          continue;
        }
        newIncreases.push(inc);
      }

      // 3) Deal opportunities (weekly cadence baked into daily digest)
      // Only include if user hasn't had deal content in last 3 days.
      const { data: recentDealContent } = await supabase
        .from('tasks')
        .select('id')
        .eq('user_id', user.id)
        .in('type', ['deal_alert_email', 'daily_digest'])
        .gte('created_at', threeDaysAgo.toISOString())
        .maybeSingle();

      // Fetch subscriptions once — used by both deal opportunities and total spend
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('provider_name, amount, category, billing_cycle')
        .eq('user_id', user.id)
        .is('dismissed_at', null)
        .eq('status', 'active');

      let dealAlerts: ReturnType<typeof findDealOpportunities> = [];
      if (!recentDealContent && subs && subs.length > 0) {
        dealAlerts = findDealOpportunities(
          subs.map((s) => ({
            provider_name: s.provider_name,
            amount: parseFloat(String(s.amount)),
            category: s.category,
            billing_cycle: s.billing_cycle,
          }))
        );
      }

      // 4) Opportunity score (targeted section — cooldown by tier)
      const score = await updateUserOpportunityScore(user.id, supabase);

      // Tier-based cooldown for score section
      let cooldownDays = 7;
      if (score.tier === 'critical') cooldownDays = 2;
      else if (score.tier === 'high') cooldownDays = 3;
      else if (score.tier === 'medium') cooldownDays = 7;

      const cooldownDate = new Date(now);
      cooldownDate.setDate(cooldownDate.getDate() - cooldownDays);

      const { data: recentTargeted } = await supabase
        .from('tasks')
        .select('id')
        .eq('user_id', user.id)
        .in('type', ['targeted_deal_email', 'daily_digest'])
        .gte('created_at', cooldownDate.toISOString())
        .maybeSingle();

      const includeScore = !recentTargeted && score.tier !== 'low';

      // 5) Compute total monthly spend for the score section intro text
      const totalMonthly = (subs || []).reduce((sum, s) => {
        const amt = parseFloat(String(s.amount)) || 0;
        if (s.billing_cycle === 'yearly') return sum + amt / 12;
        if (s.billing_cycle === 'quarterly') return sum + amt / 3;
        return sum + amt;
      }, 0);

      // 6) Build email if any section has content
      const emailData = buildDailyDigestEmail(
        user.first_name || user.full_name?.split(' ')[0] || 'there',
        newIncreases,
        dealAlerts,
        includeScore ? score : null,
        totalMonthly
      );

      if (!emailData) {
        noContent++;
        continue;
      }

      // 6) Send via unified dispatcher
      const isPaid = user.subscription_tier === 'essential' || user.subscription_tier === 'pro';

      // Telegram/WhatsApp text — short summary
      const lines: string[] = [];
      if (newIncreases.length > 0) {
        lines.push(`💸 *${newIncreases.length} price increase${newIncreases.length === 1 ? '' : 's'} detected*`);
        newIncreases.slice(0, 3).forEach((i) =>
          lines.push(`• ${i.merchantNormalized}: £${i.oldAmount.toFixed(2)} → £${i.newAmount.toFixed(2)} (+${i.increasePct}%)`)
        );
      }
      if (dealAlerts.length > 0) {
        lines.push(`💡 *${dealAlerts.length} switching deal${dealAlerts.length === 1 ? '' : 's'} found*`);
      }
      if (includeScore && score.topOpportunities.length > 0) {
        lines.push(`🎯 *Opportunity score: ${score.total}* — ${score.topOpportunities[0].provider}: ${score.topOpportunities[0].reason}`);
      }
      lines.push(`\nOpen Paybacker → Dashboard → Deals to action.`);
      const telegramText = lines.join('\n');

      const result = await sendNotification(supabase, {
        userId: user.id,
        event: 'daily_digest',
        email: isPaid ? { subject: emailData.subject, html: emailData.html } : undefined,
        telegram: { text: telegramText },
        push: {
          title: 'Daily digest ready',
          body: newIncreases.length > 0
            ? `${newIncreases.length} price increase${newIncreases.length === 1 ? '' : 's'} detected`
            : dealAlerts.length > 0
              ? `${dealAlerts.length} switching deal${dealAlerts.length === 1 ? '' : 's'} found`
              : 'Your daily Paybacker digest is ready',
        },
      });

      if (result.delivered.includes('email')) {
        await markEmailSent(
          supabase,
          user.id,
          'daily_digest',
          `Daily digest: ${newIncreases.length} price ↑, ${dealAlerts.length} deals, ${includeScore ? `score ${score.total}` : 'no score'}`
        );
        sent++;
      } else if (result.delivered.length > 0) {
        // Delivered on non-email channel — still log it
        await markEmailSent(
          supabase,
          user.id,
          'daily_digest',
          `Daily digest (non-email): ${newIncreases.length} price ↑, ${dealAlerts.length} deals`
        );
        sent++;
      } else {
        skipped++;
      }
    } catch (err: any) {
      errors.push(`User ${user.id}: ${err.message}`);
      console.error(`Daily digest error for ${user.id}:`, err);
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    skipped,
    no_content: noContent,
    total_users: userRows.length,
    eligible_users: eligibleUserIds.size,
    errors: errors.length > 0 ? errors : undefined,
  });
}
