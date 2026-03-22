import { createClient } from '@supabase/supabase-js';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Generate a unique referral code for a user.
 * Format: PB-XXXX (short, memorable, easy to share)
 */
export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/1/I confusion
  let code = 'PB-';
  for (let i = 0; i < 5; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

/**
 * Get or create a referral code for a user.
 */
export async function getOrCreateReferralCode(userId: string): Promise<string> {
  const supabase = getAdmin();

  // Check if user already has a code
  const { data: profile } = await supabase
    .from('profiles')
    .select('referral_code')
    .eq('id', userId)
    .single();

  if (profile?.referral_code) return profile.referral_code;

  // Generate unique code
  let code = generateReferralCode();
  let attempts = 0;
  while (attempts < 5) {
    const { data: existing } = await supabase
      .from('profiles')
      .select('id')
      .eq('referral_code', code)
      .maybeSingle();

    if (!existing) break;
    code = generateReferralCode();
    attempts++;
  }

  // Save to profile
  await supabase.from('profiles').update({ referral_code: code }).eq('id', userId);
  return code;
}

/**
 * Process a referral when a new user signs up with a referral code.
 */
export async function processReferral(
  referralCode: string,
  newUserId: string,
  newUserEmail: string
): Promise<{ success: boolean; referrerId?: string }> {
  const supabase = getAdmin();

  // Find the referrer
  const { data: referrer } = await supabase
    .from('profiles')
    .select('id')
    .eq('referral_code', referralCode.toUpperCase())
    .single();

  if (!referrer) return { success: false };

  // Don't allow self-referral
  if (referrer.id === newUserId) return { success: false };

  // Mark the new user as referred
  await supabase.from('profiles').update({ referred_by: referrer.id }).eq('id', newUserId);

  // Create referral record
  await supabase.from('referrals').insert({
    referrer_id: referrer.id,
    referral_code: referralCode.toUpperCase(),
    referred_email: newUserEmail,
    referred_user_id: newUserId,
    status: 'signed_up',
    converted_at: new Date().toISOString(),
  });

  // Award points to referrer
  const { awardPoints } = await import('@/lib/loyalty');
  await awardPoints(referrer.id, 'referral_signup', { referred_email: newUserEmail });

  return { success: true, referrerId: referrer.id };
}

/**
 * Process when a referred user subscribes to a paid plan.
 */
export async function processReferralSubscription(userId: string): Promise<void> {
  const supabase = getAdmin();

  // Check if this user was referred
  const { data: profile } = await supabase
    .from('profiles')
    .select('referred_by')
    .eq('id', userId)
    .single();

  if (!profile?.referred_by) return;

  // Update referral status
  await supabase.from('referrals')
    .update({ status: 'subscribed' })
    .eq('referred_user_id', userId)
    .eq('status', 'signed_up');

  // Award bonus points to referrer
  const { awardPoints } = await import('@/lib/loyalty');
  await awardPoints(profile.referred_by, 'referral_paid', { referred_user_id: userId });
}

/**
 * Get referral stats for a user.
 */
export async function getReferralStats(userId: string): Promise<{
  code: string;
  shareUrl: string;
  totalReferred: number;
  totalSubscribed: number;
  referrals: Array<{ email: string; status: string; created_at: string }>;
}> {
  const supabase = getAdmin();
  const code = await getOrCreateReferralCode(userId);

  const { data: referrals } = await supabase
    .from('referrals')
    .select('referred_email, status, created_at')
    .eq('referrer_id', userId)
    .order('created_at', { ascending: false });

  const list = referrals || [];

  return {
    code,
    shareUrl: `https://paybacker.co.uk?ref=${code}`,
    totalReferred: list.length,
    totalSubscribed: list.filter(r => r.status === 'subscribed').length,
    referrals: list.map(r => ({
      email: r.referred_email ? r.referred_email.replace(/(.{2}).*(@.*)/, '$1***$2') : 'Unknown',
      status: r.status,
      created_at: r.created_at,
    })),
  };
}
