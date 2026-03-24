import { createClient } from '@supabase/supabase-js';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Generate a unique referral code for a user.
 * Format: PB-XXXXXXXX (8 chars, no O/0/1/I confusion)
 */
export function generateReferralCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'PB-';
  for (let i = 0; i < 8; i++) {
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
  while (attempts < 10) {
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
 * Send "Your friend joined!" email to the referrer via Resend.
 */
async function sendReferralSignupEmail(referrerId: string, referredEmail: string): Promise<void> {
  try {
    const supabase = getAdmin();
    const { data: referrer } = await supabase
      .from('profiles')
      .select('email, first_name, full_name')
      .eq('id', referrerId)
      .single();

    if (!referrer?.email) return;

    const name = referrer.first_name || referrer.full_name?.split(' ')[0] || 'there';
    const maskedEmail = referredEmail.replace(/(.{2}).*(@.*)/, '$1***$2');

    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: process.env.FROM_EMAIL || 'hello@paybacker.co.uk',
      to: referrer.email,
      subject: 'Your friend joined Paybacker - you earned 100 points!',
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;">
  <div style="background:#0f172a;padding:20px 32px;border-bottom:1px solid #1e293b;">
    <span style="font-size:22px;font-weight:800;color:#fff;">Pay<span style="color:#f59e0b;">backer</span></span>
  </div>
  <div style="background:linear-gradient(180deg,#0f172a 0%,#1a1f35 100%);padding:32px;">
    <div style="font-size:36px;text-align:center;margin-bottom:12px;">📣</div>
    <h1 style="color:#fff;font-size:22px;margin:0 0 12px;text-align:center;">Your friend joined!</h1>
    <p style="color:#94a3b8;font-size:14px;line-height:1.7;text-align:center;">Hi ${name}, great news - ${maskedEmail} signed up to Paybacker using your referral link.</p>
    <div style="background:#f59e0b22;border:1px solid #f59e0b44;border-radius:12px;padding:16px;text-align:center;margin:20px 0;">
      <span style="color:#f59e0b;font-weight:700;font-size:24px;">+100 points</span>
      <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Added to your loyalty balance</p>
    </div>
    <p style="color:#94a3b8;font-size:14px;text-align:center;">Earn <strong style="color:#f59e0b;">200 more points</strong> when they upgrade to a paid plan.</p>
    <div style="text-align:center;margin-top:20px;">
      <a href="https://paybacker.co.uk/dashboard/rewards" style="display:inline-block;background:#f59e0b;color:#0f172a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">View Your Rewards</a>
    </div>
  </div>
  <div style="background:#0f172a;padding:20px 32px;border-top:1px solid #1e293b;">
    <div style="color:#475569;font-size:11px;">Paybacker LTD - paybacker.co.uk</div>
  </div>
</div></body></html>`,
    });
  } catch (e) {
    console.error('[referrals] Signup email failed:', e);
  }
}

/**
 * Send "Your referral upgraded!" email to the referrer via Resend.
 */
async function sendReferralPaidEmail(referrerId: string): Promise<void> {
  try {
    const supabase = getAdmin();
    const { data: referrer } = await supabase
      .from('profiles')
      .select('email, first_name, full_name')
      .eq('id', referrerId)
      .single();

    if (!referrer?.email) return;

    const name = referrer.first_name || referrer.full_name?.split(' ')[0] || 'there';

    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);

    await resend.emails.send({
      from: process.env.FROM_EMAIL || 'hello@paybacker.co.uk',
      to: referrer.email,
      subject: 'Your referral upgraded - you earned 200 points!',
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;">
  <div style="background:#0f172a;padding:20px 32px;border-bottom:1px solid #1e293b;">
    <span style="font-size:22px;font-weight:800;color:#fff;">Pay<span style="color:#f59e0b;">backer</span></span>
  </div>
  <div style="background:linear-gradient(180deg,#0f172a 0%,#1a1f35 100%);padding:32px;">
    <div style="font-size:36px;text-align:center;margin-bottom:12px;">🌟</div>
    <h1 style="color:#fff;font-size:22px;margin:0 0 12px;text-align:center;">Your referral upgraded!</h1>
    <p style="color:#94a3b8;font-size:14px;line-height:1.7;text-align:center;">Hi ${name}, someone you referred has upgraded to a paid plan.</p>
    <div style="background:#f59e0b22;border:1px solid #f59e0b44;border-radius:12px;padding:16px;text-align:center;margin:20px 0;">
      <span style="color:#f59e0b;font-weight:700;font-size:24px;">+200 points</span>
      <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Bonus added to your loyalty balance</p>
    </div>
    <div style="text-align:center;margin-top:20px;">
      <a href="https://paybacker.co.uk/dashboard/rewards" style="display:inline-block;background:#f59e0b;color:#0f172a;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;">View Your Rewards</a>
    </div>
  </div>
  <div style="background:#0f172a;padding:20px 32px;border-top:1px solid #1e293b;">
    <div style="color:#475569;font-size:11px;">Paybacker LTD - paybacker.co.uk</div>
  </div>
</div></body></html>`,
    });
  } catch (e) {
    console.error('[referrals] Paid email failed:', e);
  }
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

  // Check if already referred (prevent double processing)
  const { data: existingRef } = await supabase
    .from('referrals')
    .select('id')
    .eq('referred_user_id', newUserId)
    .maybeSingle();

  if (existingRef) return { success: false };

  // Mark the new user as referred
  await supabase.from('profiles').update({ referred_by: referrer.id }).eq('id', newUserId);

  // Create referral record
  await supabase.from('referrals').insert({
    referrer_id: referrer.id,
    referral_code: referralCode.toUpperCase(),
    referred_email: newUserEmail,
    referred_user_id: newUserId,
    status: 'signed_up',
    signup_at: new Date().toISOString(),
    converted_at: new Date().toISOString(),
    points_awarded_signup: true,
  });

  // Award points to referrer
  const { awardPoints } = await import('@/lib/loyalty');
  await awardPoints(referrer.id, 'referral_signup', { referred_email: newUserEmail });

  // Send notification email (non-blocking)
  sendReferralSignupEmail(referrer.id, newUserEmail).catch(() => {});

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

  // Check if already awarded (prevent double)
  const { data: refRecord } = await supabase
    .from('referrals')
    .select('id, points_awarded_paid')
    .eq('referred_user_id', userId)
    .eq('status', 'signed_up')
    .maybeSingle();

  if (!refRecord || refRecord.points_awarded_paid) return;

  // Update referral status
  await supabase.from('referrals')
    .update({
      status: 'subscribed',
      converted_at: new Date().toISOString(),
      points_awarded_paid: true,
    })
    .eq('id', refRecord.id);

  // Award bonus points to referrer
  const { awardPoints } = await import('@/lib/loyalty');
  await awardPoints(profile.referred_by, 'referral_paid', { referred_user_id: userId });

  // Send notification email (non-blocking)
  sendReferralPaidEmail(profile.referred_by).catch(() => {});
}

/**
 * Get referral stats for a user.
 */
export async function getReferralStats(userId: string): Promise<{
  code: string;
  shareUrl: string;
  joinUrl: string;
  totalReferred: number;
  totalSignedUp: number;
  totalSubscribed: number;
  pendingUpgrades: number;
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
    shareUrl: `https://paybacker.co.uk/join?ref=${code}`,
    joinUrl: `https://paybacker.co.uk/join?ref=${code}`,
    totalReferred: list.length,
    totalSignedUp: list.filter(r => r.status === 'signed_up' || r.status === 'subscribed').length,
    totalSubscribed: list.filter(r => r.status === 'subscribed').length,
    pendingUpgrades: list.filter(r => r.status === 'signed_up').length,
    referrals: list.map(r => ({
      email: r.referred_email ? r.referred_email.replace(/(.{2}).*(@.*)/, '$1***$2') : 'Unknown',
      status: r.status,
      created_at: r.created_at,
    })),
  };
}
