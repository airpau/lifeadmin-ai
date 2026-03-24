import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { updateUserOpportunityScore } from '@/lib/opportunity-scoring';
import { sendTargetedDealEmail } from '@/lib/email/targeted-deals';

export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

/**
 * Targeted deal emails - scores all users and sends personalised emails
 * based on their opportunity level.
 *
 * Schedule: Wednesday + Friday 9am
 *
 * Targeting logic:
 * - Score 0-19 (low): skip
 * - Score 20-49 (medium): send if not sent in last 7 days
 * - Score 50-99 (high): send if not sent in last 3 days
 * - Score 100+ (critical): send immediately, even if sent 2 days ago
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();

  // Get all users with subscriptions
  const { data: users } = await supabase
    .from('profiles')
    .select('id, email, full_name, first_name')
    .not('email', 'is', null);

  if (!users || users.length === 0) {
    return NextResponse.json({ ok: true, scored: 0, sent: 0 });
  }

  let scored = 0;
  let sent = 0;
  let skipped = 0;
  const results: Array<{ email: string; score: number; tier: string; sent: boolean; reason?: string }> = [];

  for (const user of users) {
    try {
      // Calculate and store opportunity score
      const score = await updateUserOpportunityScore(user.id, supabase);
      scored++;

      // Determine if we should send based on tier
      const now = new Date();
      let cooldownDays = 7;
      if (score.tier === 'critical') cooldownDays = 2;
      else if (score.tier === 'high') cooldownDays = 3;
      else if (score.tier === 'medium') cooldownDays = 7;
      else {
        // Low score — skip targeted email
        skipped++;
        results.push({ email: user.email, score: score.total, tier: score.tier, sent: false, reason: 'Low score — gets general digest only' });
        continue;
      }

      // Check cooldown
      const cooldownDate = new Date(now);
      cooldownDate.setDate(cooldownDate.getDate() - cooldownDays);

      const { data: recentSend } = await supabase
        .from('tasks')
        .select('id')
        .eq('user_id', user.id)
        .eq('type', 'targeted_deal_email')
        .gte('created_at', cooldownDate.toISOString())
        .maybeSingle();

      if (recentSend) {
        skipped++;
        results.push({ email: user.email, score: score.total, tier: score.tier, sent: false, reason: `Cooldown (sent within ${cooldownDays} days)` });
        continue;
      }

      // Calculate total monthly spend
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('amount, billing_cycle')
        .eq('user_id', user.id)
        .is('dismissed_at', null)
        .eq('status', 'active');

      const totalMonthly = (subs || []).reduce((sum, s) => {
        const amt = parseFloat(String(s.amount)) || 0;
        if (s.billing_cycle === 'yearly') return sum + amt / 12;
        if (s.billing_cycle === 'quarterly') return sum + amt / 3;
        return sum + amt;
      }, 0);

      const userName = user.first_name || user.full_name?.split(' ')[0] || 'there';

      const emailSent = await sendTargetedDealEmail(user.email, userName, score, totalMonthly);

      if (emailSent) {
        await supabase.from('tasks').insert({
          user_id: user.id,
          type: 'targeted_deal_email',
          title: `Targeted deal alert (score: ${score.total}, tier: ${score.tier})`,
          description: `Top opportunity: ${score.topOpportunities[0]?.provider || 'none'} — ${score.topOpportunities[0]?.reason || ''}`,
          status: 'completed',
        });
        sent++;
        results.push({ email: user.email, score: score.total, tier: score.tier, sent: true });
      } else {
        results.push({ email: user.email, score: score.total, tier: score.tier, sent: false, reason: 'Email send failed' });
      }
    } catch (err: any) {
      console.error(`Targeted deal error for ${user.email}:`, err.message);
      results.push({ email: user.email, score: 0, tier: 'low', sent: false, reason: err.message });
    }
  }

  console.log(`targeted-deals: scored=${scored} sent=${sent} skipped=${skipped}`);

  return NextResponse.json({ ok: true, scored, sent, skipped, results });
}
