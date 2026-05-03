import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWeeklyDigestEmail } from '@/lib/email/weekly-money-digest';
import { canSendEmail } from '@/lib/email-rate-limit';
import { isRealSpend, sumRealSpend, groupRealSpend } from '@/lib/spending';
import { whatsappFanoutForCron } from '@/lib/pocket-agent/whatsapp-fanout';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CATEGORY_LABELS: Record<string, string> = {
  mortgage: 'Mortgage', loans: 'Loans & Finance', credit: 'Credit Cards',
  council_tax: 'Council Tax', energy: 'Energy', water: 'Water',
  broadband: 'Broadband', mobile: 'Mobile', streaming: 'Streaming',
  fitness: 'Fitness', groceries: 'Groceries', eating_out: 'Eating Out',
  fuel: 'Fuel', shopping: 'Shopping', insurance: 'Insurance',
  transport: 'Transport', software: 'Software', bills: 'Bills',
  other: 'Other',
};

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();
  const now = new Date();

  // This week: last 7 days
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  // Last week: 14 to 7 days ago
  const lastWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  // Renewals: next 14 days
  const renewalCutoff = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

  // Find all users with bank connections (they have transaction data)
  const { data: bankUsers } = await admin
    .from('bank_connections')
    .select('user_id')
    .eq('status', 'active')
    .is('archived_at', null);

  if (!bankUsers || bankUsers.length === 0) {
    return NextResponse.json({ success: true, sent: 0, reason: 'No users with bank connections' });
  }

  const userIds = [...new Set(bankUsers.map(b => b.user_id))];
  let sent = 0;
  let skipped = 0;

  for (const userId of userIds) {
    try {
      // Check if already sent this week
      const { count: recentDigest } = await admin
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'weekly_money_digest')
        .gte('created_at', weekStart.toISOString());

      if ((recentDigest || 0) > 0) {
        skipped++;
        continue;
      }

      // Global daily email rate limit
      const rateCheck = await canSendEmail(admin, userId, 'weekly_money_digest');
      if (!rateCheck.allowed) {
        skipped++;
        continue;
      }

      // Get user profile
      const { data: profile } = await admin
        .from('profiles')
        .select('email, first_name, full_name, subscription_tier')
        .eq('id', userId)
        .single();

      if (!profile?.email) continue;

      // Only send to paid users (Essential/Pro)
      const tier = profile.subscription_tier || 'free';
      if (tier === 'free') {
        skipped++;
        continue;
      }

      const userName = profile.first_name || profile.full_name?.split(' ')[0] || 'there';

      // This week's transactions. Pull user_category alongside category
      // because Yapily/TrueLayer writes the auto-category into
      // user_category — the `category` column is null on every row
      // ingest writes today, which is why every digest used to show
      // "Other 100%". See lib/spending.ts for the resolution rule.
      const { data: thisWeekTx } = await admin
        .from('bank_transactions')
        .select('amount, description, merchant_name, category, user_category, timestamp')
        .eq('user_id', userId)
        .gte('timestamp', weekStart.toISOString())
        .lt('amount', 0);

      // Last week's transactions (for comparison) — same shape so the
      // exclusion filter applies to both halves of the +/- vs last
      // week comparison.
      const { data: lastWeekTx } = await admin
        .from('bank_transactions')
        .select('amount, description, merchant_name, category, user_category')
        .eq('user_id', userId)
        .gte('timestamp', lastWeekStart.toISOString())
        .lt('timestamp', weekStart.toISOString())
        .lt('amount', 0);

      // Real spend only — strips self-transfers, credit-card bill
      // repayments, loan principal, and investments. The earlier
      // implementation summed every debit and reported £20,733 for
      // a week that had ~£10k of internal transfers in it.
      const weekSpend = sumRealSpend(thisWeekTx || []);
      const lastWeekSpend = sumRealSpend(lastWeekTx || []);
      const realThisWeek = (thisWeekTx || []).filter(isRealSpend);

      // Skip if no spending data this week (after exclusions — a user
      // whose only debits were internal transfers shouldn't get a
      // digest).
      if (weekSpend === 0 && realThisWeek.length === 0) {
        skipped++;
        continue;
      }

      const categoryTotals = groupRealSpend(thisWeekTx || []);

      const topCategories = Object.entries(categoryTotals)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([cat, total]) => ({
          category: CATEGORY_LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1),
          total,
          percentage: weekSpend > 0 ? (total / weekSpend) * 100 : 0,
        }));

      // Upcoming renewals (next 14 days)
      const { data: renewals } = await admin
        .from('subscriptions')
        .select('provider_name, amount, next_billing_date')
        .eq('user_id', userId)
        .eq('status', 'active')
        .is('dismissed_at', null)
        .gte('next_billing_date', now.toISOString().split('T')[0])
        .lte('next_billing_date', renewalCutoff.toISOString().split('T')[0])
        .order('next_billing_date', { ascending: true });

      const upcomingRenewals = (renewals || []).map(r => ({
        provider: r.provider_name,
        amount: parseFloat(String(r.amount)) || 0,
        date: r.next_billing_date,
        daysUntil: Math.ceil((new Date(r.next_billing_date).getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
      }));

      // Budget alerts
      const { data: budgets } = await admin
        .from('budgets')
        .select('category, monthly_limit')
        .eq('user_id', userId);

      // Get current month spending for budget comparison — same
      // exclusions apply (a user whose budget category is "loans"
      // shouldn't have their loan principal counted).
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data: monthTx } = await admin
        .from('bank_transactions')
        .select('amount, description, merchant_name, category, user_category')
        .eq('user_id', userId)
        .gte('timestamp', monthStart)
        .lt('amount', 0);

      const monthCategorySpend = groupRealSpend(monthTx || []);

      const budgetAlerts = (budgets || [])
        .map(b => {
          const limit = parseFloat(String(b.monthly_limit));
          const spent = monthCategorySpend[b.category] || 0;
          return {
            category: CATEGORY_LABELS[b.category] || b.category,
            limit,
            spent,
            percentage: limit > 0 ? (spent / limit) * 100 : 0,
          };
        })
        .filter(b => b.percentage >= 50); // Only show budgets at 50%+

      // Total saved (from cancelled subs)
      const { data: cancelledSubs } = await admin
        .from('subscriptions')
        .select('money_saved')
        .eq('user_id', userId)
        .eq('status', 'cancelled');

      const totalSaved = (cancelledSubs || []).reduce(
        (sum, s) => sum + (parseFloat(String(s.money_saved)) || 0), 0
      );

      // Send the email
      const success = await sendWeeklyDigestEmail(
        profile.email,
        userName,
        {
          weekSpend,
          lastWeekSpend,
          topCategories,
          upcomingRenewals,
          budgetAlerts,
          totalSaved,
          // Use the post-exclusion count so the headline matches the
          // actual spend total (52 raw debits → 35 real outgoings,
          // 17 self-transfers / loan principal hidden). Without this
          // we'd say "£800 across 52 transactions" which is incoherent.
          transactionCount: realThisWeek.length,
        },
        tier,
      );

      if (success) {
        // Log to prevent duplicates
        await admin.from('tasks').insert({
          user_id: userId,
          type: 'weekly_money_digest',
          title: `Weekly digest: £${Math.round(weekSpend)} spent`,
          description: `Top categories: ${topCategories.map(c => c.category).join(', ')}. ${upcomingRenewals.length} upcoming renewals.`,
          status: 'completed',
        });
        sent++;
      }
    } catch (err: any) {
      console.error(`[weekly-digest] Error for user ${userId}:`, err.message);
    }
  }

  // ─── WhatsApp fan-out (added 2026-04-29) ───
  //
  // Same content as the email digest, just routed through the
  // channel-agnostic dispatcher. Uses the recovery-this-week +
  // lifetime-recovery shape (paybacker_recovery_total_weekly).
  // Inside the 24h service window the dispatcher substitutes
  // free-form text — so the typical Pocket Agent user pays £0.
  // Outside the window it requires marketing opt-in.
  const waResult = await whatsappFanoutForCron({
    supabase: admin,
    alertType: 'weekly_recovery',
    userIds,
    logLabel: 'weekly-recovery',
    buildVars: async (userId) => {
      // Lifetime recovery = sum of money_saved across all
      // cancelled subs + verified savings for the user. Same
      // sources the email digest uses for the totalSaved figure.
      const [{ data: cancelledSubs }, { data: verified }] = await Promise.all([
        admin
          .from('subscriptions')
          .select('money_saved, updated_at')
          .eq('user_id', userId)
          .eq('status', 'cancelled'),
        admin
          .from('verified_savings')
          .select('amount_saved, created_at')
          .eq('user_id', userId),
      ]);

      const lifetime =
        (cancelledSubs ?? []).reduce(
          (s, r) => s + (parseFloat(String(r.money_saved)) || 0),
          0,
        ) +
        (verified ?? []).reduce(
          (s, r) => s + (parseFloat(String(r.amount_saved)) || 0),
          0,
        );

      // Recovery this week = same set, filtered to the past 7d.
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const thisWeek =
        (cancelledSubs ?? [])
          .filter((r) => r.updated_at && new Date(r.updated_at) >= weekAgo)
          .reduce((s, r) => s + (parseFloat(String(r.money_saved)) || 0), 0) +
        (verified ?? [])
          .filter((r) => r.created_at && new Date(r.created_at) >= weekAgo)
          .reduce((s, r) => s + (parseFloat(String(r.amount_saved)) || 0), 0);

      // No recovery this week AND no lifetime — skip silently.
      if (thisWeek === 0 && lifetime === 0) return null;

      return {
        amount_this_week: `£${thisWeek.toFixed(2)}`,
        lifetime_amount: `£${lifetime.toFixed(2)}`,
      };
    },
  });

  console.log(
    `[weekly-money-digest] WhatsApp fanout: attempted=${waResult.attempted} sent=${waResult.sent} skipped=${waResult.skipped.length} errors=${waResult.errors.length}`,
  );

  return NextResponse.json({
    success: true,
    sent,
    skipped,
    total_users: userIds.length,
    whatsapp: {
      attempted: waResult.attempted,
      sent: waResult.sent,
      skipped: waResult.skipped.length,
      errors: waResult.errors.length,
    },
  });
}
