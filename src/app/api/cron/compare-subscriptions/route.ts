import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { compareAllSubscriptions, saveComparisons } from '@/lib/comparison-engine';

export const maxDuration = 120;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Weekly subscription comparison cron.
 * Schedule: Wednesday 7am -- configured in vercel.json
 *
 * For each user with active subscriptions:
 * 1. Run compareAllSubscriptions to find cheaper deals
 * 2. Save results to subscription_comparisons table
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();

  try {
    // Get all distinct user IDs with active subscriptions
    const { data: userRows, error: userError } = await admin
      .from('subscriptions')
      .select('user_id')
      .eq('status', 'active')
      .is('dismissed_at', null);

    if (userError) throw userError;
    if (!userRows || userRows.length === 0) {
      return NextResponse.json({ message: 'No active subscriptions found', processed: 0 });
    }

    // Deduplicate user IDs
    const userIds = [...new Set(userRows.map(r => r.user_id))];

    let totalUsersProcessed = 0;
    let totalComparisonsFound = 0;
    let totalSavingsFound = 0;

    for (const userId of userIds) {
      try {
        const result = await compareAllSubscriptions(userId);

        // Save comparisons to DB
        for (const [subId, comparisons] of Object.entries(result.comparisons)) {
          const currentPrice = comparisons[0]?.currentPrice || 0;
          await saveComparisons(subId, currentPrice, comparisons);
        }

        totalUsersProcessed++;
        totalComparisonsFound += result.count;
        totalSavingsFound += result.totalAnnualSaving;
      } catch (err) {
        console.error(`Error comparing subscriptions for user ${userId}:`, err);
      }
    }

    return NextResponse.json({
      message: 'Subscription comparison complete',
      usersProcessed: totalUsersProcessed,
      totalUsers: userIds.length,
      comparisonsFound: totalComparisonsFound,
      totalPotentialSaving: totalSavingsFound,
    });
  } catch (err) {
    console.error('Compare subscriptions cron error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
