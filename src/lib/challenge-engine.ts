import { createClient } from '@supabase/supabase-js';
import { normaliseMerchantName } from './merchant-normalise';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ChallengeTemplate {
  id: string;
  name: string;
  description: string | null;
  type: 'spending' | 'action';
  category: string | null;
  duration_days: number | null;
  reward_points: number;
  difficulty: 'easy' | 'medium' | 'hard';
  verification_rule: { keywords?: string[]; action?: string };
  icon: string | null;
  active: boolean;
}

export interface UserChallenge {
  id: string;
  user_id: string;
  template_id: string;
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  started_at: string;
  completed_at: string | null;
  failed_at: string | null;
  progress: Record<string, unknown>;
  template?: ChallengeTemplate;
}

export interface ChallengeProgress {
  status: 'active' | 'completed' | 'failed';
  progress: number; // 0-100
  daysRemaining: number | null;
  message: string;
}

// ── Functions ──────────────────────────────────────────────────────────────────

/**
 * Returns all active templates that the user has NOT started or completed.
 */
export async function getAvailableChallenges(userId: string): Promise<ChallengeTemplate[]> {
  const admin = getAdmin();

  // Get template IDs the user has already started (active or completed)
  const { data: userChallenges } = await admin
    .from('user_challenges')
    .select('template_id, status')
    .eq('user_id', userId)
    .in('status', ['active', 'completed']);

  const usedTemplateIds = new Set(
    (userChallenges || []).map((uc) => uc.template_id)
  );

  const { data: templates, error } = await admin
    .from('challenge_templates')
    .select('*')
    .eq('active', true)
    .order('reward_points', { ascending: true });

  if (error) throw new Error(error.message);

  return (templates || []).filter((t) => !usedTemplateIds.has(t.id));
}

/**
 * Start a challenge for a user. Returns the created user_challenge record.
 */
export async function startChallenge(
  userId: string,
  templateId: string
): Promise<UserChallenge> {
  const admin = getAdmin();

  // Check template exists and is active
  const { data: template, error: tErr } = await admin
    .from('challenge_templates')
    .select('*')
    .eq('id', templateId)
    .eq('active', true)
    .single();

  if (tErr || !template) {
    throw new Error('Challenge template not found or inactive');
  }

  // Check user hasn't already started this challenge (active)
  const { data: existing } = await admin
    .from('user_challenges')
    .select('id')
    .eq('user_id', userId)
    .eq('template_id', templateId)
    .eq('status', 'active')
    .limit(1);

  if (existing && existing.length > 0) {
    throw new Error('You already have this challenge active');
  }

  const { data: challenge, error } = await admin
    .from('user_challenges')
    .insert({
      user_id: userId,
      template_id: templateId,
      status: 'active',
      started_at: new Date().toISOString(),
      progress: {},
    })
    .select('*')
    .single();

  if (error) throw new Error(error.message);

  return { ...challenge, template } as UserChallenge;
}

/**
 * Check progress for a challenge.
 * - Spending challenges: look for disqualifying transactions since started_at
 * - Action challenges: check if the action was completed
 */
export async function checkChallengeProgress(
  userId: string,
  challengeId: string
): Promise<ChallengeProgress> {
  const admin = getAdmin();

  const { data: uc, error } = await admin
    .from('user_challenges')
    .select('*, template:challenge_templates(*)')
    .eq('id', challengeId)
    .eq('user_id', userId)
    .single();

  if (error || !uc) throw new Error('Challenge not found');

  const template = uc.template as ChallengeTemplate;
  const startedAt = new Date(uc.started_at);
  const now = new Date();

  // Already resolved
  if (uc.status === 'completed') {
    return { status: 'completed', progress: 100, daysRemaining: 0, message: 'Challenge completed!' };
  }
  if (uc.status === 'failed') {
    return { status: 'failed', progress: 0, daysRemaining: 0, message: 'Challenge failed.' };
  }

  // ── Spending challenges ─────────────────────────────────────────────────
  if (template.type === 'spending') {
    const keywords = template.verification_rule.keywords || [];
    const durationDays = template.duration_days || 7;
    const endDate = new Date(startedAt.getTime() + durationDays * 24 * 60 * 60 * 1000);
    const daysElapsed = Math.floor((now.getTime() - startedAt.getTime()) / (24 * 60 * 60 * 1000));
    const daysRemaining = Math.max(0, Math.ceil((endDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));

    // If no keywords, this is a meta-challenge (Stay Under Budget, Save 100).
    // These are verified by the cron and can only be completed manually or by cron.
    if (keywords.length === 0) {
      const progress = Math.min(100, Math.round((daysElapsed / durationDays) * 100));
      if (now >= endDate) {
        return { status: 'completed', progress: 100, daysRemaining: 0, message: 'Duration completed! Awaiting verification.' };
      }
      return {
        status: 'active',
        progress,
        daysRemaining,
        message: `Day ${Math.min(daysElapsed + 1, durationDays)} of ${durationDays}`,
      };
    }

    // Check for disqualifying transactions
    const { data: transactions } = await admin
      .from('bank_transactions')
      .select('description, amount, timestamp')
      .eq('user_id', userId)
      .gte('timestamp', startedAt.toISOString())
      .lte('timestamp', endDate.toISOString());

    const disqualifying = (transactions || []).filter((tx) => {
      const normalised = normaliseMerchantName(tx.description || '').toLowerCase();
      const raw = (tx.description || '').toLowerCase();
      return keywords.some((kw) => normalised.includes(kw) || raw.includes(kw));
    });

    if (disqualifying.length > 0) {
      // Mark as failed
      await admin
        .from('user_challenges')
        .update({
          status: 'failed',
          failed_at: now.toISOString(),
          progress: { disqualifying_transaction: disqualifying[0].description },
        })
        .eq('id', challengeId);

      return {
        status: 'failed',
        progress: 0,
        daysRemaining: 0,
        message: `Failed: transaction detected at ${disqualifying[0].description}`,
      };
    }

    // Still going
    if (now >= endDate) {
      // Duration elapsed, no disqualifying transactions -- complete it
      await completeChallenge(userId, challengeId);
      return { status: 'completed', progress: 100, daysRemaining: 0, message: 'Challenge completed! Points awarded.' };
    }

    const progress = Math.min(99, Math.round((daysElapsed / durationDays) * 100));
    return {
      status: 'active',
      progress,
      daysRemaining,
      message: `Day ${Math.min(daysElapsed + 1, durationDays)} of ${durationDays}`,
    };
  }

  // ── Action challenges ───────────────────────────────────────────────────
  const action = template.verification_rule.action;
  let actionCompleted = false;

  switch (action) {
    case 'cancel_subscription': {
      const { count } = await admin
        .from('subscriptions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('status', 'cancelled')
        .gte('updated_at', startedAt.toISOString());
      actionCompleted = (count || 0) > 0;
      break;
    }
    case 'generate_complaint': {
      const { count } = await admin
        .from('tasks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'complaint_letter')
        .gte('created_at', startedAt.toISOString());
      actionCompleted = (count || 0) > 0;
      break;
    }
    case 'referral_signup': {
      const { count } = await admin
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('referrer_id', userId)
        .gte('created_at', startedAt.toISOString());
      actionCompleted = (count || 0) > 0;
      break;
    }
    case 'connect_bank': {
      const { count } = await admin
        .from('bank_connections')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      actionCompleted = (count || 0) > 0;
      break;
    }
    case 'create_budget': {
      const { count } = await admin
        .from('money_hub_budgets')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId);
      actionCompleted = (count || 0) > 0;
      break;
    }
    case 'review_subscriptions': {
      // Manual -- user can mark as complete
      return {
        status: 'active',
        progress: 0,
        daysRemaining: null,
        message: 'Visit your Subscriptions page and review all active subscriptions, then mark as complete.',
      };
    }
    case 'switch_deal': {
      const { count } = await admin
        .from('deal_clicks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', startedAt.toISOString());
      actionCompleted = (count || 0) > 0;
      break;
    }
    default:
      break;
  }

  if (actionCompleted) {
    await completeChallenge(userId, challengeId);
    return { status: 'completed', progress: 100, daysRemaining: null, message: 'Action completed! Points awarded.' };
  }

  return { status: 'active', progress: 0, daysRemaining: null, message: 'Complete the action to finish this challenge.' };
}

/**
 * Mark a challenge as completed and award loyalty points.
 * Awards variable points based on the challenge template's reward_points.
 */
export async function completeChallenge(userId: string, challengeId: string): Promise<void> {
  const admin = getAdmin();

  const { data: uc } = await admin
    .from('user_challenges')
    .select('status, template:challenge_templates(reward_points, name)')
    .eq('id', challengeId)
    .eq('user_id', userId)
    .single();

  if (!uc || uc.status !== 'active') return;

  const template = (Array.isArray(uc.template) ? uc.template[0] : uc.template) as { reward_points: number; name: string };
  const points = template.reward_points;

  await admin
    .from('user_challenges')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      progress: { completed: true },
    })
    .eq('id', challengeId);

  // Record the point event
  await admin.from('point_events').insert({
    user_id: userId,
    event_type: 'challenge_completed',
    points,
    description: `Completed challenge: ${template.name}`,
    metadata: { challenge_id: challengeId, challenge_name: template.name },
  });

  // Update user points balance
  const { data: current } = await admin
    .from('user_points')
    .select('balance, lifetime_earned')
    .eq('user_id', userId)
    .maybeSingle();

  const newBalance = (current?.balance || 0) + points;
  const newLifetime = (current?.lifetime_earned || 0) + points;

  await admin.from('user_points').upsert({
    user_id: userId,
    balance: newBalance,
    lifetime_earned: newLifetime,
    last_points_earned_at: new Date().toISOString(),
    expiry_warning_sent: false,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
}

/**
 * Mark a challenge as abandoned.
 */
export async function abandonChallenge(userId: string, challengeId: string): Promise<void> {
  const admin = getAdmin();

  await admin
    .from('user_challenges')
    .update({
      status: 'abandoned',
      progress: { abandoned: true },
    })
    .eq('id', challengeId)
    .eq('user_id', userId);
}

/**
 * Get all user challenges with template data.
 */
export async function getUserChallenges(userId: string): Promise<UserChallenge[]> {
  const admin = getAdmin();

  const { data, error } = await admin
    .from('user_challenges')
    .select('*, template:challenge_templates(*)')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(error.message);

  return (data || []) as UserChallenge[];
}
