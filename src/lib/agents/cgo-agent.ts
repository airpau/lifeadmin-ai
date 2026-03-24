import { createClient } from '@supabase/supabase-js';
import { AgentConfig, AgentReport, runExecutiveAgent } from './executive-agent';
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

function getAdmin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

async function sendGrowthEmail(to: string, subject: string, body: string) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL, replyTo: REPLY_TO, to, subject,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:40px;border-radius:16px;">
        <div style="font-size:20px;font-weight:800;color:#fff;margin-bottom:24px;">Pay<span style="color:#f59e0b;">backer</span></div>
        ${body}
        <hr style="border:none;border-top:1px solid #1e293b;margin:24px 0;" />
        <p style="color:#475569;font-size:11px;">Paybacker LTD &middot; <a href="https://paybacker.co.uk" style="color:#f59e0b;">paybacker.co.uk</a></p>
      </div>`,
    });
    return true;
  } catch { return false; }
}

export async function runCGOAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();
  const now = new Date();
  const twoDaysAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const threeDaysAgo = new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString();
  const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const yearMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const [
    totalUsers, newUsers7d, tiersResult,
    noBank48h, noLetter72h, usageData,
    recentTasks, bankConnections, paidInactive,
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
    supabase.from('profiles').select('subscription_tier'),
    // Users signed up 48h+ ago, no bank connection
    supabase.from('profiles').select('id, email, full_name, created_at')
      .lte('created_at', twoDaysAgo).is('onboarded_at', null)
      .eq('subscription_tier', 'free').limit(20),
    // Users signed up 72h+ ago, check if no letters
    supabase.from('profiles').select('id, email, full_name')
      .lte('created_at', threeDaysAgo).eq('subscription_tier', 'free').limit(50),
    // Usage for upgrade nudges (free users with 2+ letters)
    supabase.from('usage_logs').select('user_id, count')
      .eq('action', 'complaint_generated').eq('year_month', yearMonth),
    // Recent activity
    supabase.from('tasks').select('user_id').gte('created_at', fourteenDaysAgo),
    supabase.from('bank_connections').select('user_id').eq('status', 'active'),
    // Paid users with no recent activity
    supabase.from('profiles').select('id, email, subscription_tier')
      .in('subscription_tier', ['essential', 'pro'])
      .lte('updated_at', fourteenDaysAgo).limit(20),
  ]);

  const tiers: Record<string, number> = { free: 0, essential: 0, pro: 0 };
  for (const p of tiersResult.data || []) tiers[p.subscription_tier || 'free']++;

  const bankUserIds = new Set((bankConnections.data || []).map(b => b.user_id));
  const activeUserIds = new Set((recentTasks.data || []).map(t => t.user_id));

  // TRIGGER 1: No bank after 48 hours
  const noBankUsers = (noBank48h.data || []).filter(u => !bankUserIds.has(u.id));
  let emailsSent = 0;
  for (const user of noBankUsers.slice(0, 5)) {
    const sent = await sendGrowthEmail(user.email,
      "You might be missing hidden charges",
      `<p style="color:#94a3b8;font-size:15px;">Hi${user.full_name ? ` ${user.full_name.split(' ')[0]}` : ''},</p>
       <p style="color:#94a3b8;font-size:15px;">Most people have at least 3 subscriptions they've forgotten about. Connect your bank account and we'll find them in seconds.</p>
       <a href="https://paybacker.co.uk/dashboard/subscriptions" style="display:inline-block;background:#f59e0b;color:#0f172a;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:16px;">Connect Bank Account</a>`
    );
    if (sent) emailsSent++;
  }

  // TRIGGER 2: Free users with 2/3 letters used
  const upgradeTargets = (usageData.data || []).filter(u => u.count >= 2);
  for (const target of upgradeTargets.slice(0, 5)) {
    const { data: profile } = await supabase.from('profiles').select('email, full_name, subscription_tier')
      .eq('id', target.user_id).single();
    if (profile && profile.subscription_tier === 'free') {
      await sendGrowthEmail(profile.email,
        "You're almost out of free letters",
        `<p style="color:#94a3b8;font-size:15px;">Hi${profile.full_name ? ` ${profile.full_name.split(' ')[0]}` : ''},</p>
         <p style="color:#94a3b8;font-size:15px;">You've used ${target.count} of your 3 free complaint letters this month. Upgrade to Essential for unlimited letters, daily bank sync, and renewal reminders. Just £9.99/month.</p>
         <a href="https://paybacker.co.uk/pricing" style="display:inline-block;background:#f59e0b;color:#0f172a;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:16px;">Upgrade Now</a>`
      );
    }
  }

  // TRIGGER 3: Paid users inactive 14+ days
  const inactivePaid = (paidInactive.data || []).filter(u => !activeUserIds.has(u.id));
  for (const user of inactivePaid.slice(0, 5)) {
    await sendGrowthEmail(user.email,
      "You might be missing a renewal",
      `<p style="color:#94a3b8;font-size:15px;">We noticed you haven't logged in for a while. Your subscriptions and contracts are still being tracked, but you might be missing important renewal dates.</p>
       <p style="color:#94a3b8;font-size:15px;">Log in to check if any contracts are ending soon.</p>
       <a href="https://paybacker.co.uk/dashboard" style="display:inline-block;background:#f59e0b;color:#0f172a;font-weight:700;padding:12px 24px;border-radius:8px;text-decoration:none;margin-top:16px;">Check Your Dashboard</a>`
    );
  }

  const contextPrompt = `Today: ${now.toISOString().split('T')[0]}.

## Funnel Metrics
- Total users: ${totalUsers.count || 0}
- New signups (7d): ${newUsers7d.count || 0}
- Free: ${tiers.free}, Essential: ${tiers.essential}, Pro: ${tiers.pro}
- Free-to-paid: ${((tiers.essential + tiers.pro) / Math.max(totalUsers.count || 1, 1) * 100).toFixed(1)}%
- Bank connections: ${bankUserIds.size}

## Actions Taken This Run
- Activation emails sent (no bank after 48h): ${noBankUsers.length} targeted, ${emailsSent} sent
- Upgrade nudge candidates (2/3 letters): ${upgradeTargets.length}
- Re-engagement emails (paid inactive 14d+): ${inactivePaid.length}

Analyse the funnel and recommend next growth actions.`;

  return runExecutiveAgent(agentConfig, contextPrompt, { useSonnet: true });
}
