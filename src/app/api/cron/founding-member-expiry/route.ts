import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { canSendEmail } from '@/lib/email-rate-limit';

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
      Your free free trial trial has ended and your account has moved to the <strong style="color:#fff;">Free plan</strong>.
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
  const resend = new Resend(process.env.RESEND_API_KEY);
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

  // 2. Downgrade expired free trials
  const now = new Date().toISOString();
  const { data: expired } = await supabase
    .from('profiles')
    .select('id, email, full_name, subscription_tier, stripe_subscription_id')
    .eq('founding_member', true)
    .lt('founding_member_expires', now);

  for (const user of expired || []) {
    // Skip if they've already paid for a subscription via Stripe
    if (user.stripe_subscription_id) {
      results.push({ email: user.email, action: 'skipped - has active Stripe subscription' });
      continue;
    }

    // Downgrade to free - ONLY change tier, keep all data
    await supabase.from('profiles').update({
      subscription_tier: 'free',
      subscription_status: 'expired',
      founding_member: false,
      trial_expired_at: new Date().toISOString(),
    }).eq('id', user.id);

    // Send expiry notification email
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
