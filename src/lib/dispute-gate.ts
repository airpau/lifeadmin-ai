/**
 * Dispute / complaint letter gate — count-based free-tier model.
 *
 * Free users get FREE_LETTER_LIMIT lifetime letters (no monthly reset)
 * before being prompted to upgrade. Paid tiers and active onboarding
 * trials are always allowed.
 *
 * Source of truth: `profiles.free_letters_used` (integer). The legacy
 * `free_letter_used` / `free_letter_expires_at` columns are retained
 * for backward compatibility but no longer consulted for gating.
 *
 * The legacy `usage_logs` monthly counter is still used for scan
 * tracking (`scan_run` action). Letter gating no longer touches it.
 */

import { createClient } from '@supabase/supabase-js';

export const FREE_LETTER_LIMIT = 3;

export interface ProfileGateShape {
  subscription_tier: string;
  free_letters_used: number;
}

/**
 * Synchronous gate check given a profile object. Returns true when the
 * user can create another free letter (or is on a paid tier, where the
 * limit doesn't apply).
 */
export function canCreateFreeDisputeLetter(profile: ProfileGateShape): boolean {
  if (profile.subscription_tier !== 'free') return true;
  return (profile.free_letters_used ?? 0) < FREE_LETTER_LIMIT;
}

/**
 * Number of free letters this user has left. Returns `null` for paid
 * tiers (unlimited). For free tier returns 0..FREE_LETTER_LIMIT.
 */
export function freeLettersRemaining(profile: ProfileGateShape): number | null {
  if (profile.subscription_tier !== 'free') return null;
  return Math.max(0, FREE_LETTER_LIMIT - (profile.free_letters_used ?? 0));
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export interface LetterGateResult {
  allowed: boolean;
  used: number;
  limit: number | null;
  tier: string;
  upgradeRequired: boolean;
  lettersRemaining: number | null;
}

/**
 * Async server-side gate. Reads the profile (subscription_tier +
 * free_letters_used + onboarding-trial flags) and decides whether
 * letter generation is allowed. Mirrors the trial override used by
 * `getEffectiveTier` so an active onboarding trial behaves as Pro.
 */
export async function checkFreeLetterGate(userId: string): Promise<LetterGateResult> {
  const admin = getAdmin();
  const { data: profile } = await admin
    .from('profiles')
    .select('subscription_tier, free_letters_used, trial_ends_at, trial_converted_at, trial_expired_at')
    .eq('id', userId)
    .single();

  const storedTier = (profile?.subscription_tier as string) ?? 'free';
  const onboardingTrialActive = !!profile?.trial_ends_at
    && new Date(profile.trial_ends_at) > new Date()
    && !profile?.trial_converted_at
    && !profile?.trial_expired_at;
  const effectiveTier = onboardingTrialActive ? 'pro' : storedTier;
  const used = profile?.free_letters_used ?? 0;

  if (effectiveTier !== 'free') {
    return {
      allowed: true,
      used,
      limit: null,
      tier: effectiveTier,
      upgradeRequired: false,
      lettersRemaining: null,
    };
  }

  const allowed = used < FREE_LETTER_LIMIT;
  return {
    allowed,
    used,
    limit: FREE_LETTER_LIMIT,
    tier: effectiveTier,
    upgradeRequired: !allowed,
    lettersRemaining: Math.max(0, FREE_LETTER_LIMIT - used),
  };
}

/**
 * Increment the lifetime free-letter counter. No-op semantics for
 * paid tiers are tolerated — we still record the bump so the counter
 * reflects total letters generated across all tiers, which is fine
 * for analytics. The gate only consults the column when the user is
 * on free, so paid users are never affected.
 *
 * Also flips the legacy `free_letter_used` boolean to `true` so any
 * code still reading the old flag (now no-op) stays consistent.
 */
export async function incrementFreeLetterUsage(userId: string): Promise<void> {
  const admin = getAdmin();
  const { data: profile } = await admin
    .from('profiles')
    .select('free_letters_used')
    .eq('id', userId)
    .single();
  const current = profile?.free_letters_used ?? 0;
  await admin
    .from('profiles')
    .update({
      free_letters_used: current + 1,
      free_letter_used: true,
    })
    .eq('id', userId);
}
