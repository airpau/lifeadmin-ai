import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { runAssessment } from '@/lib/overcharge-engine';
import { sendOverchargeAlert } from '@/lib/email/overcharge-alerts';
import { canSendEmail } from '@/lib/email-rate-limit';
// NOTE: we must insert into `tasks` after every successful send so that
// canSendEmail()'s query correctly counts this send toward the daily cap.

export const maxDuration = 120;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Weekly overcharge assessment cron.
 * Schedule: Every Sunday at 10am (after subscription comparison cron)
 *
 * For each user with active subscriptions:
 * 1. Run the full overcharge assessment pipeline
 * 2. Create money_hub_alerts for high-score items
 * 3. Send consolidated email to Essential/Pro users
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // Get all users with active subscriptions
  const { data: users, error: userError } = await supabase
    .from('subscriptions')
    .select('user_id')
    .eq('status', 'active')
    .is('dismissed_at', null);

  if (userError || !users || users.length === 0) {
    return NextResponse.json({ message: 'No users with active subscriptions', assessed: 0 });
  }

  const userIds = [...new Set(users.map(u => u.user_id))];

  let totalAssessed = 0;
  let totalAlerts = 0;
  let totalEmails = 0;
  const errors: string[] = [];

  for (const userId of userIds) {
    try {
      const assessments = await runAssessment(userId);
      if (assessments.length === 0) continue;

      totalAssessed += assessments.length;

      // Create money_hub_alerts for high-score items (score >= 50)
      const highScore = assessments.filter(a => a.overchargeScore >= 50);
      for (const a of highScore) {
        // Dedup: check if we already have an active overcharge alert for this subscription
        const { data: existing } = await supabase
          .from('money_hub_alerts')
          .select('id')
          .eq('user_id', userId)
          .eq('type', 'overcharge')
          .eq('status', 'active')
          .ilike('title', `%${a.merchantName}%`)
          .limit(1);

        if (existing && existing.length > 0) continue;

        await supabase.from('money_hub_alerts').insert({
          user_id: userId,
          type: 'overcharge',
          title: `${a.merchantName} may be overcharging you`,
          description: `Overcharge score: ${a.overchargeScore}/100. ${a.signals.filter(s => s.score > 0).map(s => s.detail).join('. ')}`,
          status: 'active',
          metadata: {
            assessmentId: a.subscriptionId,
            overchargeScore: a.overchargeScore,
            estimatedAnnualSaving: a.estimatedAnnualSaving,
            confidence: a.confidence,
          },
        });
        totalAlerts++;
      }

      // Send email to Essential/Pro users
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, name, subscription_tier')
        .eq('id', userId)
        .single();

      if (profile && ['essential', 'pro'].includes(profile.subscription_tier || '')) {
        const rateCheck = await canSendEmail(supabase, userId, 'overcharge_alert');
        if (rateCheck.allowed && highScore.length > 0) {
          const sent = await sendOverchargeAlert(
            profile.email,
            profile.name || 'there',
            assessments.filter(a => a.overchargeScore >= 40) // Include medium+ in email
          );
          if (sent) {
            // Record the send so canSendEmail() counts it toward today's cap
            await supabase.from('tasks').insert({
              user_id: userId,
              type: 'overcharge_alert',
              title: `Overcharge alert: ${highScore.length} item${highScore.length === 1 ? '' : 's'}`,
              description: `Overcharge assessment email sent — top score: ${highScore[0]?.overchargeScore ?? 0}/100`,
              status: 'completed',
            });
            totalEmails++;
          }
        }
      }
    } catch (err) {
      errors.push(`User ${userId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return NextResponse.json({
    message: 'Overcharge assessment complete',
    users_processed: userIds.length,
    assessments_created: totalAssessed,
    alerts_created: totalAlerts,
    emails_sent: totalEmails,
    errors: errors.length > 0 ? errors : undefined,
  });
}
