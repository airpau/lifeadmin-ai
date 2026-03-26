import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { checkChallengeProgress, completeChallenge } from '@/lib/challenge-engine';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Daily challenge verification cron.
 * Schedule: Daily at 9am -- configured in vercel.json
 *
 * For all active spending challenges:
 * 1. Check if disqualifying transactions appeared since started_at
 * 2. Mark as failed if so
 * 3. Mark as completed if duration has elapsed without failure
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = getAdmin();

  // Get all active challenges
  const { data: activeChallenges, error } = await admin
    .from('user_challenges')
    .select('id, user_id, template_id, started_at, template:challenge_templates(type, duration_days)')
    .eq('status', 'active');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!activeChallenges || activeChallenges.length === 0) {
    return NextResponse.json({ message: 'No active challenges to verify', checked: 0 });
  }

  let checked = 0;
  let completed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const uc of activeChallenges) {
    try {
      const rawTemplate = uc.template;
      const template = (Array.isArray(rawTemplate) ? rawTemplate[0] : rawTemplate) as { type: string; duration_days: number | null } | null;

      // Only auto-verify spending challenges with duration
      if (template?.type !== 'spending') continue;

      const result = await checkChallengeProgress(uc.user_id, uc.id);
      checked++;

      if (result.status === 'completed') {
        completed++;
      } else if (result.status === 'failed') {
        failed++;
      }

      // For spending challenges with no keywords (Stay Under Budget, Save 100),
      // check if duration has elapsed and auto-complete
      if (result.status === 'active' && result.daysRemaining === 0) {
        await completeChallenge(uc.user_id, uc.id);
        completed++;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Challenge ${uc.id}: ${msg}`);
    }
  }

  return NextResponse.json({
    message: 'Challenge verification complete',
    total_active: activeChallenges.length,
    checked,
    completed,
    failed,
    errors: errors.length > 0 ? errors : undefined,
  });
}
