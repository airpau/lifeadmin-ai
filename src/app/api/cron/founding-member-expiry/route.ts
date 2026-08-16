import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { canSendEmail } from '@/lib/email-rate-limit';
import { priceIdToTier } from '@/lib/stripe';
import type { PlanTier } from '@/lib/tier-rank';

const STRIPE_BASE = 'https://api.stripe.com/v1';

// The local PRICE_ID_TO_TIER map that used to live here was a stale copy of
// the canonical resolver: it knew only essential/pro, so a household or
// dispute_pro subscriber whose founding-member window expired resolved to
// "unknown price" and had their tier wiped. `priceIdToTier` in @/lib/stripe
// is now the single source of truth (env-overridable current prices plus
// the archived legacy IDs) and returns null for anything it doesn't know.

async function stripeGet(path: string): Promise<any> {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try {
    const res = await fetch(`${STRIPE_BASE}${path}`, {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * On expiry, never blindly write tier='free'. If the user has any
 * active/trialing Stripe sub we don't know about, backfill the tier
 * from the price ID instead of wiping it.
 *
 * `tier: null` means "Stripe says this customer has a live subscription
 * but we can't map its price to a tier". The caller MUST skip the
 * subscription_tier write entirely in that case — writing 'free' would
 * downgrade a paying customer on the strength of a missing env var.
 */
async function resolveTierAtExpiry(
  stripeCustomerId: string | null,
  fallbackSubId: string | null,
): Promise<{ tier: PlanTier | null; subscriptionId: string | null; status: string }> {
  // Valid `subscription_status` values are constrained by the
  // 20260101 initial-schema CHECK: trialing | active | canceled |
  // past_due | paused. Writing 'expired' silently failed the entire
  // UPDATE — exactly the founding-member regression this cron exists
  // to prevent. Use 'canceled' as the post-expiry resting state.
  if (!stripeCustomerId) {
    return { tier: 'free', subscriptionId: null, status: 'canceled' };
  }
  const [active, trialing] = await Promise.all([
    stripeGet(`/subscriptions?customer=${stripeCustomerId}&status=active&limit=5`),
    stripeGet(`/subscriptions?customer=${stripeCustomerId}&status=trialing&limit=5`),
  ]);
  const subs = [...(active?.data || []), ...(trialing?.data || [])];
  if (subs.length === 0) {
    return { tier: 'free', subscriptionId: null, status: 'canceled' };
  }
  const sub = subs[0];
  const priceId = sub.items?.data?.[0]?.price?.id || '';
  const mapped = priceIdToTier(priceId);
  if (!mapped) {
    // Unknown price ID — don't silently downgrade. Return null so the
    // caller leaves subscription_tier exactly as it is, still links the
    // Stripe sub, and the row shows up as an exception in the admin
    // billing dashboard. The previous version returned 'free' here, which
    // wrote the downgrade it claimed to be preventing.
    console.warn(`[founding] Stripe sub ${sub.id} has unknown price ${priceId} — leaving subscription_tier untouched`);
    return { tier: null, subscriptionId: sub.id, status: sub.status || 'active' };
  }
  return { tier: mapped, subscriptionId: sub.id, status: sub.status || 'active' };
}

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const ALERT_WINDOWS = [7, 3, 1]; // Days before expiry to send reminders

function buildReminderEmail(name: string, daysLeft: number, tier: string): string {
  const urgencyColor = daysLeft <= 1 ? '#ef4444' : daysLeft <= 3 ? '#34d399' : '#3b82f6';
  const urgencyLabel = daysLeft <= 1 ? 'Tomorrow' : `In ${daysLeft} days`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px;">
  <div style="text-align:center;padding:24px 0;">
    <div style="font-size:24px;font-weight:800;color:#fff;">Pay<span style="color:#34d399;">backer</span></div>
  </div>
  <div style="background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:32px;">
    <div style="text-align:center;margin-bottom:24px;">
      <div style="display:inline-block;background:${urgencyColor}20;border:1px solid ${urgencyColor}40;border-radius:12px;padding:12px 24px;">
        <span style="color:${urgencyColor};font-weight:700;font-size:18px;">Free ${tier} trial ends ${urgencyLabel.toLowerCase()}</span>
      </div>
    </div>

    <p style="color:#e2e8f0;font-size:16px;line-height:1.6;">Hi ${name || 'there'},</p>

    <p style="color:#94a3b8;font-size:14px;line-height:1.8;">
      Your free ${tier} trial expires in <strong style="color:#fff;">${daysLeft} day${daysLeft !== 1 ? 's' : ''}</strong>.
    </p>

    <p style="color:#94a3b8;font-size:14px;line-height:1.8;">
      After that, your account will move to the Free plan. Don't worry - <strong style="color:#fff;">all your data is safe</strong>.
      Your subscriptions, contracts, bank connections, complaint letters, and spending history will all be kept.
      You can upgrade at any time to pick up right where you left off.
    </p>

    <div style="background:#1e293b;border-radius:12px;padding:20px;margin:24px 0;">
      <p style="color:#34d399;font-weight:700;margin:0 0 12px;">What you'll lose on Free:</p>
      <ul style="color:#94a3b8;padding-left:20px;line-height:2;margin:0;">
        <li>Unlimited complaint letters (drops to 3/month)</li>
        <li>Daily bank auto-sync</li>
        <li>Monthly email and opportunity re-scans</li>
        <li>Full spending intelligence dashboard</li>
        <li>Cancellation emails with legal context</li>
        <li>Renewal reminders (30/14/7 days)</li>
      </ul>
    </div>

    <div style="text-align:center;margin:32px 0;">
      <a href="https://paybacker.co.uk/pricing" style="display:inline-block;background:linear-gradient(135deg,#34d399,#10b981);color:#0f172a;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none;font-size:16px;">
        Keep Pro for just £9.99/month
      </a>
      <p style="color:#64748b;font-size:12px;margin-top:8px;">or Essential from £4.99/month</p>
    </div>

    <p style="color:#64748b;font-size:13px;text-align:center;">
      Questions? Reply to this email or chat with us at paybacker.co.uk
    </p>
  </div>
  <div style="text-align:center;padding:24px 0;color:#475569;font-size:11px;">
    Paybacker LTD - paybacker.co.uk
  </div>
</div>
</body></html>`;
}

function buildExpiredEmail(name: string): string {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;padding:32px;">
  <div style="text-align:center;padding:24px 0;">
    <div style="font-size:24px;font-weight:800;color:#fff;">Pay<span style="color:#34d399;">backer</span></div>
  </div>
  <div style="background:#0f172a;border:1px solid #1e293b;border-radius:16px;padding:32px;">
    <p style="color:#e2e8f0;font-size:16px;line-height:1.6;">Hi ${name || 'there'},</p>

    <p style="color:#94a3b8;font-size:14px;line-height:1.8;">
      Your free Pro trial has ended and your account has moved to the <strong style="color:#fff;">Free plan</strong>.
    </p>

    <div style="background:#22c55e15;border:1px solid #22c55e30;border-radius:12px;padding:20px;margin:24px 0;">
      <p style="color:#22c55e;font-weight:700;margin:0 0 8px;">Your data is safe</p>
      <p style="color:#94a3b8;font-size:14px;margin:0;line-height:1.6;">
        All your subscriptions, contracts, bank connections, complaint letters, spending history, and loyalty points have been kept.
        Upgrade any time to unlock everything again instantly.
      </p>
    </div>

    <div style="background:#1e293b;border-radius:12px;padding:20px;margin:24px 0;">
      <p style="color:#fff;font-weight:700;margin:0 0 12px;">What you can still do for free:</p>
      <ul style="color:#94a3b8;padding-left:20px;line-height:2;margin:0;">
        <li>3 AI complaint letters per month</li>
        <li>Manual subscription tracking</li>
        <li>Basic spending overview</li>
        <li>AI chatbot support</li>
        <li>Browse 56 deals</li>
      </ul>
    </div>

    <div style="text-align:center;margin:32px 0;">
      <a href="https://paybacker.co.uk/pricing" style="display:inline-block;background:linear-gradient(135deg,#34d399,#10b981);color:#0f172a;font-weight:700;padding:16px 40px;border-radius:12px;text-decoration:none;font-size:16px;">
        Upgrade to Pro - £9.99/month
      </a>
      <p style="color:#64748b;font-size:12px;margin-top:8px;">or Essential from £4.99/month</p>
    </div>

    <p style="color:#94a3b8;font-size:14px;line-height:1.8;">
      Thank you for being one of our free trials. We genuinely appreciate you testing the platform and hope you'll stick around.
    </p>

    <p style="color:#64748b;font-size:13px;">- The Paybacker team</p>
  </div>
  <div style="text-align:center;padding:24px 0;color:#475569;font-size:11px;">
    Paybacker LTD - paybacker.co.uk
  </div>
</div>
</body></html>`;
}

/**
 * Daily free trial expiry cron.
 * - Sends reminder emails at 7, 3, and 1 days before expiry
 * - Downgrades expired free trials to free (data preserved)
 *
 * Schedule: Daily at 8am
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const resend = new Resend(process.env.RESEND_API_KEY || 're_dummy_key_for_build_only');
  const results: Array<{ email: string; action: string }> = [];

  // 1. Send reminder emails for members expiring in 7, 3, 1 days
  for (const daysOut of ALERT_WINDOWS) {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + daysOut);
    const dateStr = targetDate.toISOString().split('T')[0];

    const { data: expiring } = await supabase
      .from('profiles')
      .select('id, email, full_name, subscription_tier, founding_member_expires')
      .eq('founding_member', true)
      .gte('founding_member_expires', `${dateStr}T00:00:00Z`)
      .lt('founding_member_expires', `${dateStr}T23:59:59Z`);

    for (const user of expiring || []) {
      // Check we haven't already sent this reminder
      const reminderKey = `founding-reminder-${user.id}-${daysOut}d`;
      const { data: existing } = await supabase
        .from('tasks')
        .select('id')
        .eq('type', 'founding_reminder')
        .eq('description', reminderKey)
        .single();

      if (existing) continue;

      // Global daily email rate limit
      const rateCheck = await canSendEmail(supabase, user.id, 'founding_reminder');
      if (!rateCheck.allowed) continue;

      try {
        await resend.emails.send({
          from: 'Paybacker <noreply@paybacker.co.uk>',
          replyTo: 'support@paybacker.co.uk',
          to: user.email,
          subject: daysOut === 1
            ? 'Your free Pro trial ends tomorrow'
            : `Your free Pro trial ends in ${daysOut} days`,
          html: buildReminderEmail(
            user.full_name?.split(' ')[0] || '',
            daysOut,
            user.subscription_tier || 'Pro',
          ),
        });

        // Record that we sent this reminder
        await supabase.from('tasks').insert({
          user_id: user.id,
          type: 'founding_reminder',
          title: `Founding member ${daysOut}-day reminder`,
          description: reminderKey,
          status: 'completed',
        });

        results.push({ email: user.email, action: `${daysOut}-day reminder sent` });
      } catch (err: any) {
        console.error(`[founding] Failed to email ${user.email}:`, err.message);
        results.push({ email: user.email, action: `${daysOut}-day reminder FAILED` });
      }
    }
  }

  // 2. Downgrade expired founding-member trials. `trial_expired_at IS NULL`
  // makes this idempotent — a same-day re-run won't double-email or
  // double-write.
  const now = new Date().toISOString();
  const { data: expired } = await supabase
    .from('profiles')
    .select('id, email, full_name, subscription_tier, stripe_subscription_id, stripe_customer_id')
    .eq('founding_member', true)
    .lt('founding_member_expires', now)
    .is('trial_expired_at', null);

  for (const user of expired || []) {
    // Re-resolve tier from Stripe at this exact moment. The stored
    // stripe_subscription_id can be stale (webhook lag, manual
    // checkout). If Stripe shows any active/trialing sub we backfill
    // the tier from it; otherwise we set 'free'. Either way we always
    // flip `founding_member` to false and stamp `trial_expired_at` so
    // every subsequent path sees the correct state.
    const resolved = await resolveTierAtExpiry(
      user.stripe_customer_id ?? null,
      user.stripe_subscription_id ?? null,
    );

    const update: Record<string, unknown> = {
      subscription_status: resolved.status,
      founding_member: false,
      trial_expired_at: new Date().toISOString(),
    };
    // Only write the tier when we actually resolved one. A null means the
    // customer has a live Stripe sub on a price we can't map — leave their
    // existing tier alone rather than defaulting it to free.
    if (resolved.tier !== null) update.subscription_tier = resolved.tier;
    if (resolved.subscriptionId) update.stripe_subscription_id = resolved.subscriptionId;

    const { error: updateError } = await supabase
      .from('profiles')
      .update(update)
      .eq('id', user.id);

    if (updateError) {
      // CRITICAL: do NOT swallow this. The previous version of this
      // cron wrote `subscription_status='expired'` which silently failed
      // the entire UPDATE (CHECK constraint allows only trialing |
      // active | canceled | past_due | paused). That's why 4 users were
      // found 2026-05-28 with founding_member=true + tier=free + no
      // trial_expired_at — the cleanup write had been failing every day
      // for months.
      console.error(`[founding] DB update failed for ${user.email}:`, updateError.message);
      results.push({ email: user.email, action: `DB update FAILED: ${updateError.message}` });
      continue;
    }

    // Only email expired users moving to 'free'. Backfilled Stripe
    // sub means they're keeping a paid tier — sending a "your trial
    // has ended, you're on Free" email would be wrong. A null tier means
    // we couldn't map the price, so they still hold a live sub and must
    // not get the downgrade email either.
    if (resolved.tier !== 'free') {
      results.push({
        email: user.email,
        action: resolved.tier === null
          ? `tier left untouched (unmapped price) — Stripe sub ${resolved.subscriptionId}`
          : `kept on ${resolved.tier} via Stripe sub ${resolved.subscriptionId}`,
      });
      continue;
    }

    try {
      await resend.emails.send({
        from: 'Paybacker <noreply@paybacker.co.uk>',
        replyTo: 'support@paybacker.co.uk',
        to: user.email,
        subject: 'Your free Pro trial has ended - your data is safe',
        html: buildExpiredEmail(user.full_name?.split(' ')[0] || ''),
      });
      results.push({ email: user.email, action: 'downgraded to free + email sent' });
    } catch (err: any) {
      console.error(`[founding] Expiry email failed for ${user.email}:`, err.message);
      results.push({ email: user.email, action: 'downgraded to free, email FAILED' });
    }
  }

  return NextResponse.json({
    processed: results.length,
    results,
    timestamp: now,
  });
}
