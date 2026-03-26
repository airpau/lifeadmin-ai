import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  getAvailableChallenges,
  getUserChallenges,
  startChallenge,
  checkChallengeProgress,
  completeChallenge,
  abandonChallenge,
} from '@/lib/challenge-engine';

/**
 * GET /api/challenges
 * Returns available, active, and completed challenges for the current user.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const [available, userChallenges] = await Promise.all([
      getAvailableChallenges(user.id),
      getUserChallenges(user.id),
    ]);

    const active = userChallenges.filter((uc) => uc.status === 'active');
    const completed = userChallenges.filter((uc) => uc.status === 'completed');
    const failed = userChallenges.filter((uc) => uc.status === 'failed');

    // Check progress for all active challenges
    const activeWithProgress = await Promise.all(
      active.map(async (uc) => {
        try {
          const progress = await checkChallengeProgress(user.id, uc.id);
          return { ...uc, progressInfo: progress };
        } catch {
          return { ...uc, progressInfo: null };
        }
      })
    );

    return NextResponse.json({
      available,
      active: activeWithProgress,
      completed,
      failed,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/challenges
 * Start a new challenge: { templateId }
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { templateId } = body;

    if (!templateId) {
      return NextResponse.json({ error: 'templateId is required' }, { status: 400 });
    }

    const challenge = await startChallenge(user.id, templateId);
    return NextResponse.json({ success: true, challenge });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

/**
 * PATCH /api/challenges
 * Update a challenge: { challengeId, action: 'complete' | 'abandon' }
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { challengeId, action } = body;

    if (!challengeId || !action) {
      return NextResponse.json({ error: 'challengeId and action are required' }, { status: 400 });
    }

    if (action === 'complete') {
      await completeChallenge(user.id, challengeId);
    } else if (action === 'abandon') {
      await abandonChallenge(user.id, challengeId);
    } else {
      return NextResponse.json({ error: 'Invalid action. Use "complete" or "abandon".' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
