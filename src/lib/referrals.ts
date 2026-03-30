import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2024-12-18.acacia' as any });
}

/**
 * Apply a 1-month free discount to a user's Stripe subscription.
 * Creates a one-time 100% off coupon and applies it as a credit.
 */
async function applyFreeMonthReward(userId: string, reason: string): Promise<boolean> {
  const stripe = getStripe();
  if (!stripe) return false;

  const supabase = getAdmin();
  const { data: profile } = await supabase
    .from('profiles')
    .select('stripe_customer_id, stripe_subscription_id, subscription_tier')
    .eq('id', userId)
    .single();

  if (!profile?.stripe_subscription_id) return false;

  try {
    // Get the subscription to find the current price
    const subscription = await stripe.subscriptions.retrieve(profile.stripe_subscription_id);
    if (subscription.status !== 'active' && subscription.status !== 'trialing') return false;

    const priceAmount = subscription.items.data[0]?.price?.unit_amount || 499; // fallback to £4.99

    // Create a one-time coupon for the exact subscription amount
    const coupon = await stripe.coupons.create({
      amount_off: priceAmount,
      currency: 'gbp',
      duration: 'once',
      name: `Referral reward: ${reason}`,
      max_redemptions: 1,
    });

    // Apply the coupon to the subscription
    await stripe.subscriptions.update(profile.stripe_subscription_id, {
      coupon: coupon.id,
    });

    // Log the reward
    await supabase.from('business_log').insert({
      category: 'progress',
      title: `Referral reward applied: ${reason}`,
      content: `User ${userId} received 1 free month (£${(priceAmount / 100).toFixed(2)} credit) via Stripe coupon ${coupon.id}. Reason: ${reason}`,
      created_by: 'system',
    });

    return true;
  } catch (err: any) {
    console.error(`[referrals] Stripe reward failed for ${userId}:`, err.message);
    return false;
  }
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
    const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key_for_build_only');

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Paybacker <noreply@paybacker.co.uk>',
      replyTo: 'support@paybacker.co.uk',
      to: referrer.email,
      subject: 'Your friend joined Paybacker!',
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0A1628;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#0f172a;border-radius:16px;overflow:hidden;">
  <div style="background:#162544;padding:24px 32px;border-bottom:1px solid #1e3a5f;text-align:center;">
    <span style="font-size:22px;font-weight:800;color:#fff;">Pay<span style="color:#34d399;">backer</span></span>
  </div>
  <div style="padding:32px;">
    <h1 style="color:#fff;font-size:22px;margin:0 0 12px;text-align:center;">Your friend joined!</h1>
    <p style="color:#94a3b8;font-size:14px;line-height:1.7;text-align:center;">Hi ${name}, great news. ${maskedEmail} signed up to Paybacker using your referral link.</p>
    <div style="background:#34d39922;border:1px solid #34d39944;border-radius:12px;padding:16px;text-align:center;margin:20px 0;">
      <span style="color:#34d399;font-weight:700;font-size:20px;">+100 loyalty points</span>
      <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Added to your rewards balance</p>
    </div>
    <p style="color:#e2e8f0;font-size:14px;text-align:center;font-weight:600;">When they upgrade to a paid plan, you BOTH get 1 free month.</p>
    <p style="color:#94a3b8;font-size:13px;text-align:center;">Plus 200 bonus loyalty points for you.</p>
    <div style="text-align:center;margin-top:24px;">
      <a href="https://paybacker.co.uk/dashboard/rewards" style="display:inline-block;background:#34d399;color:#0f172a;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:700;">View Your Rewards</a>
    </div>
  </div>
  <div style="padding:20px 32px;border-top:1px solid #1e3a5f;text-align:center;">
    <p style="color:#475569;font-size:11px;margin:0;">Paybacker LTD · ICO Registered · paybacker.co.uk</p>
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
    const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key_for_build_only');

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Paybacker <noreply@paybacker.co.uk>',
      replyTo: 'support@paybacker.co.uk',
      to: referrer.email,
      subject: 'Your referral upgraded. You both get 1 free month!',
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#0A1628;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#0f172a;border-radius:16px;overflow:hidden;">
  <div style="background:#162544;padding:24px 32px;border-bottom:1px solid #1e3a5f;text-align:center;">
    <span style="font-size:22px;font-weight:800;color:#fff;">Pay<span style="color:#34d399;">backer</span></span>
  </div>
  <div style="padding:32px;">
    <h1 style="color:#fff;font-size:22px;margin:0 0 12px;text-align:center;">Your referral upgraded!</h1>
    <p style="color:#94a3b8;font-size:14px;line-height:1.7;text-align:center;">Hi ${name}, someone you referred has upgraded to a paid plan. As a thank you, you both get a reward.</p>
    <div style="background:#34d39922;border:1px solid #34d39944;border-radius:12px;padding:20px;text-align:center;margin:20px 0;">
      <span style="color:#34d399;font-weight:700;font-size:22px;">1 Free Month Applied</span>
      <p style="color:#94a3b8;font-size:13px;margin:8px 0 0;">Your next billing cycle will be free. The discount has been applied to your Stripe subscription automatically.</p>
    </div>
    <div style="background:#162544;border:1px solid #1e3a5f;border-radius:12px;padding:16px;text-align:center;margin:20px 0;">
      <span style="color:#FB923C;font-weight:700;font-size:18px;">+200 bonus points</span>
      <p style="color:#94a3b8;font-size:12px;margin:4px 0 0;">Added to your loyalty rewards</p>
    </div>
    <p style="color:#94a3b8;font-size:14px;text-align:center;">Keep sharing your referral link to earn more free months.</p>
    <div style="text-align:center;margin-top:24px;">
      <a href="https://paybacker.co.uk/dashboard/rewards" style="display:inline-block;background:#34d399;color:#0f172a;padding:14px 28px;border-radius:12px;text-decoration:none;font-weight:700;">View Your Rewards</a>
    </div>
  </div>
  <div style="padding:20px 32px;border-top:1px solid #1e3a5f;text-align:center;">
    <p style="color:#475569;font-size:11px;margin:0;">Paybacker LTD · ICO Registered · paybacker.co.uk</p>
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

  // Apply 1 free month to BOTH parties via Stripe
  await Promise.all([
    applyFreeMonthReward(profile.referred_by, 'Referrer reward: friend subscribed'),
    applyFreeMonthReward(userId, 'New subscriber referral reward'),
  ]);

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
