/**
 * Claude API rate limiting using Supabase usage_logs.
 *
 * Time-bucketed keys stored in the year_month column:
 *   - free tier:  YYYY-MM-DD        (daily bucket,  limit = 3 calls/day)
 *   - paid tiers: YYYY-MM-DD-HH     (hourly bucket, limit = 20 calls/hour)
 *
 * action = 'claude_call' differentiates these rows from other usage actions.
 */

import { createClient } from '@supabase/supabase-js';

const FREE_DAILY_LIMIT = 3;
const PAID_HOURLY_LIMIT = 20;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getTimeKey(tier: string): string {
  const now = new Date();
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  if (tier === 'free') return day;
  return `${day}-${String(now.getHours()).padStart(2, '0')}`;
}

function getLimit(tier: string): number {
  if (tier === 'free') return FREE_DAILY_LIMIT;
  return PAID_HOURLY_LIMIT;
}

/**
 * Fetch a user's subscription tier from their profile.
 *
 * Trusts `profile.subscription_tier` per CLAUDE.md — demotion is
 * webhook-driven only. Transitional Stripe states (past_due, unpaid,
 * incomplete) do NOT demote — the webhook writes 'canceled' on an
 * actual termination. Previously we demoted on anything other than
 * active/trialing, which silently flipped past_due Pro users to Free.
 */
export async function getUserTier(userId: string): Promise<string> {
  const admin = getAdmin();
  const { data } = await admin
    .from('profiles')
    .select('subscription_tier, subscription_status')
    .eq('id', userId)
    .single();

  const tier = (data?.subscription_tier as string) ?? 'free';
  const status = data?.subscription_status ?? 'free';
  const terminated = ['canceled', 'cancelled', 'expired', 'incomplete_expired'].includes(status);
  return terminated ? 'free' : tier;
}

/**
 * Check whether a user is within their Claude API rate limit.
 * Call this BEFORE making a Claude API call.
 *
 * @param userId - authenticated user ID
 * @param tier   - subscription tier ('free' | 'essential' | 'pro')
 */
export async function checkClaudeRateLimit(
  userId: string,
  tier: string
): Promise<{ allowed: boolean; remaining: number }> {
  const admin = getAdmin();
  const timeKey = getTimeKey(tier);
  const limit = getLimit(tier);

  const { data } = await admin
    .from('usage_logs')
    .select('count')
    .eq('user_id', userId)
    .eq('action', 'claude_call')
    .eq('year_month', timeKey)
    .single();

  const used = (data?.count as number) ?? 0;
  return { allowed: used < limit, remaining: Math.max(0, limit - used) };
}

/**
 * Record a Claude API call for rate limiting.
 * Call this immediately AFTER a successful Claude API call.
 *
 * @param userId - authenticated user ID
 * @param tier   - subscription tier ('free' | 'essential' | 'pro')
 */
export async function recordClaudeCall(userId: string, tier: string): Promise<void> {
  const admin = getAdmin();
  const timeKey = getTimeKey(tier);

  await admin.rpc('increment_usage', {
    p_user_id: userId,
    p_action: 'claude_call',
    p_year_month: timeKey,
  });
}

/**
 * Log a Claude API call to the console with key telemetry.
 * Call before the API call with estimated token counts.
 */
export function logClaudeCall(params: {
  userId: string;
  route: string;
  model: string;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
}): void {
  const inputCost = (params.estimatedInputTokens / 1_000_000) * costPerMToken(params.model, 'input');
  const outputCost = (params.estimatedOutputTokens / 1_000_000) * costPerMToken(params.model, 'output');
  const totalCost = (inputCost + outputCost).toFixed(4);

  console.log(
    `[Claude API] user=${params.userId} route=${params.route} model=${params.model} ` +
    `~input=${params.estimatedInputTokens}tok ~output=${params.estimatedOutputTokens}tok ~cost=$${totalCost}`
  );
}

function costPerMToken(model: string, type: 'input' | 'output'): number {
  if (model.includes('haiku')) {
    return type === 'input' ? 0.80 : 4.00;
  }
  if (model.includes('sonnet')) {
    return type === 'input' ? 3.00 : 15.00;
  }
  if (model.includes('opus')) {
    return type === 'input' ? 15.00 : 75.00;
  }
  return type === 'input' ? 3.00 : 15.00;
}
