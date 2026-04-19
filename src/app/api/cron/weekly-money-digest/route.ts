import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendWeeklyDigestEmail } from '@/lib/email/weekly-money-digest';
import { canSendEmail } from '@/lib/email-rate-limit';

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
    .eq('status', 'active');

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

      // This week's transactions
      const { data: thisWeekTx } = await admin
        .from('bank_transactions')
        .select('amount, description, category, timestamp')
        .eq('user_id', userId)
        .gte('timestamp', weekStart.toISOString())
        .lt('amount', 0);

      // Last week's transactions (for comparison)
      const { data: lastWeekTx } = await admin
        .from('bank_transactions')
        .select('amount')
        .eq('user_id', userId)
        .gte('timestamp', lastWeekStart.toISOString())
        .lt('timestamp', weekStart.toISOString())
        .lt('amount', 0);

      const weekSpend = (thisWeekTx || []).reduce((sum, tx) => sum + Math.abs(parseFloat(String(tx.amount))), 0);
      const lastWeekSpend = (lastWeekTx || []).reduce((sum, tx) => sum + Math.abs(parseFloat(String(tx.amount))), 0);

      // Skip if no spending data this week
      if (weekSpend === 0 && (thisWeekTx || []).length === 0) {
        skipped++;
        continue;
      }

      // Category breakdown
      const categoryTotals: Record<string, number> = {};
      for (const tx of (thisWeekTx || [])) {
        const cat = tx.category?.toLowerCase() || 'other';
        categoryTotals[cat] = (categoryTotals[cat] || 0) + Math.abs(parseFloat(String(tx.amount)));
      }

      const topCategories = Object.entries(categoryTotals)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([cat, total]) => ({
          category: CATEGORY_LABELS[cat] || cat.charAt(0).toUpperCase() + cat.slice(1),
          total,
          percentage: weekSpend > 0 ? (total / weekSpend) * 100 : 0,
        }));

      // All tracked subscriptions (active + detected + pending — not just 'active')
      // pending_cancellation = user has requested cancellation but sub is still live
      const TRACKED_STATUSES = ['active', 'pending_cancellation'];

      const { data: allTrackedSubs } = await admin
        .from('subscriptions')
        .select('amount, billing_cycle')
        .eq('user_id', userId)
        .in('status', TRACKED_STATUSES)
        .is('dismissed_at', null);

      const subscriptionCount = (allTrackedSubs || []).length;

      function toMonthly(amount: number, cycle: string | null): number {
        switch (cycle) {
          case 'annual':      return amount / 12;
          case 'semi_annual': return amount / 6;
          case 'quarterly':   return amount / 3;
          case 'weekly':      return (amount * 52) / 12;
          case 'biweekly':    return (amount * 26) / 12;
          default:            return amount; // monthly or unrecognised
        }
      }

      const monthlyOutgoings = (allTrackedSubs || []).reduce((sum, s) => {
        const raw = parseFloat(String(s.amount)) || 0;
        return sum + toMonthly(raw, s.billing_cycle ?? null);
      }, 0);

      // Upcoming renewals (next 14 days) — active-only to avoid false alerts
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

      // Get current month spending for budget comparison
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
      const { data: monthTx } = await admin
        .from('bank_transactions')
        .select('amount, category')
        .eq('user_id', userId)
        .gte('timestamp', monthStart)
        .lt('amount', 0);

      const monthCategorySpend: Record<string, number> = {};
      for (const tx of (monthTx || [])) {
        const cat = tx.category?.toLowerCase() || 'other';
        monthCategorySpend[cat] = (monthCategorySpend[cat] || 0) + Math.abs(parseFloat(String(tx.amount)));
      }

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
          transactionCount: (thisWeekTx || []).length,
          subscriptionCount,
          monthlyOutgoings,
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

  return NextResponse.json({ success: true, sent, skipped, total_users: userIds.length });
}
