import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { sendChurnEmail } from '@/lib/email/churn-prevention';
import { canSendEmail } from '@/lib/email-rate-limit';

export const runtime = 'nodejs';
export const maxDuration = 60;

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
  const results = { inactive_7d: 0, inactive_14d: 0, pre_renewal: 0, skipped: 0 };

  // Get all users with subscription tier
  const { data: users } = await admin
    .from('profiles')
    .select('id, email, first_name, full_name, subscription_tier, updated_at, created_at')
    .not('email', 'is', null);

  if (!users || users.length === 0) {
    return NextResponse.json({ success: true, ...results });
  }

  // Get already-sent churn emails (prevent duplicates)
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data: recentChurnEmails } = await admin
    .from('onboarding_emails')
    .select('user_id, email_key')
    .like('email_key', 'churn_%')
    .gte('created_at', weekAgo);

  const recentlySent = new Set(
    (recentChurnEmails || []).map(r => `${r.user_id}:${r.email_key}`)
  );

  for (const user of users) {
    const userId = user.id;
    const email = user.email;
    const firstName = user.first_name || user.full_name?.split(' ')[0] || 'there';
    const tier = user.subscription_tier || 'free';
    const daysSinceCreated = Math.floor((now.getTime() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24));

    // Skip users created less than 7 days ago (they're in the onboarding sequence)
    if (daysSinceCreated < 7) {
      results.skipped++;
      continue;
    }

    // Check last activity (latest bank_transaction, task, or subscription update)
    const { data: lastActivity } = await admin
      .from('bank_transactions')
      .select('timestamp')
      .eq('user_id', userId)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: lastTask } = await admin
      .from('tasks')
      .select('created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Use the most recent activity timestamp
    const lastActiveDate = [
      lastActivity?.timestamp,
      lastTask?.created_at,
      user.updated_at,
    ]
      .filter(Boolean)
      .map(d => new Date(d!).getTime())
      .sort((a, b) => b - a)[0];

    const daysSinceActive = lastActiveDate
      ? Math.floor((now.getTime() - lastActiveDate) / (1000 * 60 * 60 * 24))
      : daysSinceCreated;

    // Global daily email rate limit
    const rateCheck = await canSendEmail(admin, userId, 'churn_reengagement');
    if (!rateCheck.allowed) {
      results.skipped++;
      continue;
    }

    // --- 7-day inactive re-engagement ---
    if (daysSinceActive >= 7 && daysSinceActive < 14) {
      const key = `churn_inactive_7d`;
      if (!recentlySent.has(`${userId}:${key}`)) {
        // Get user's data for the email
        const { count: subCount } = await admin
          .from('subscriptions')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('status', 'active')
          .is('dismissed_at', null);

        const { data: subs } = await admin
          .from('subscriptions')
          .select('amount, billing_cycle, contract_end_date')
          .eq('user_id', userId)
          .eq('status', 'active')
          .is('dismissed_at', null);

        const monthlySpend = (subs || []).reduce((sum, s) => {
          const amt = parseFloat(String(s.amount)) || 0;
          if (s.billing_cycle === 'yearly') return sum + amt / 12;
          if (s.billing_cycle === 'quarterly') return sum + amt / 3;
          return sum + amt;
        }, 0);

        const thirtyDays = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        const expiringContracts = (subs || []).filter(s =>
          s.contract_end_date &&
          new Date(s.contract_end_date) >= now &&
          new Date(s.contract_end_date) <= thirtyDays
        ).length;

        const sent = await sendChurnEmail(email, firstName, 'inactive_7d', {
          activeSubscriptions: subCount || 0,
          monthlySpend,
          expiringContracts,
        });

        if (sent) {
          await admin.from('onboarding_emails').insert({ user_id: userId, email_key: key });
          results.inactive_7d++;
        }
        continue; // One email per user per run
      }
    }

    // --- 14-day inactive re-engagement ---
    if (daysSinceActive >= 14) {
      const key = `churn_inactive_14d`;
      if (!recentlySent.has(`${userId}:${key}`)) {
        const sent = await sendChurnEmail(email, firstName, 'inactive_14d');
        if (sent) {
          await admin.from('onboarding_emails').insert({ user_id: userId, email_key: key });
          results.inactive_14d++;
        }
        continue;
      }
    }

    // --- Pre-renewal value summary (3 days before renewal, paid users only) ---
    if (tier !== 'free') {
      // Check Stripe renewal date
      const { data: profile } = await admin
        .from('profiles')
        .select('stripe_subscription_id')
        .eq('id', userId)
        .single();

      if (profile?.stripe_subscription_id) {
        // We don't have the renewal date directly - use a task-based approach
        // Check if we've already sent a pre-renewal email recently
        const monthAgo = new Date(now.getTime() - 28 * 24 * 60 * 60 * 1000).toISOString();
        const key = `churn_pre_renewal`;
        const { count: recentPreRenewal } = await admin
          .from('onboarding_emails')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('email_key', key)
          .gte('created_at', monthAgo);

        if ((recentPreRenewal || 0) === 0) {
          // Get user stats for the value summary
          const { count: lettersCount } = await admin
            .from('tasks')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('type', 'complaint_letter');

          const { count: subsCount } = await admin
            .from('subscriptions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'active')
            .is('dismissed_at', null);

          const { data: cancelledSubs } = await admin
            .from('subscriptions')
            .select('money_saved')
            .eq('user_id', userId)
            .eq('status', 'cancelled');

          const totalSaved = (cancelledSubs || []).reduce(
            (sum, s) => sum + (parseFloat(String(s.money_saved)) || 0), 0
          );

          const sent = await sendChurnEmail(email, firstName, 'pre_renewal', {
            tier: tier.charAt(0).toUpperCase() + tier.slice(1),
            totalSaved,
            lettersGenerated: lettersCount || 0,
            subsTracked: subsCount || 0,
          });

          if (sent) {
            await admin.from('onboarding_emails').insert({ user_id: userId, email_key: key });
            results.pre_renewal++;
          }
        }
      }
    }
  }

  return NextResponse.json({ success: true, ...results });
}
