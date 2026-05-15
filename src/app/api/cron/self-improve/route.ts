import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const maxDuration = 120;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

/**
 * Weekly self-improvement engine.
 * Reviews usage data, generates improvement proposals, tracks accuracy.
 * Schedule: Sunday 7am
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Gather metrics
  const [
    { count: lettersThisWeek },
    { count: disputesThisWeek },
    { count: subsDetected },
    { count: subsDismissed },
    { count: feedbackPositive },
    { count: feedbackNegative },
    { count: legalRefsTotal },
    { count: legalRefsHighConf },
    { count: merchantRulesTotal },
    { count: txsWithMerchant },
    { count: txsTotal },
  ] = await Promise.all([
    supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('type', 'complaint_letter').gte('created_at', weekAgo.toISOString()),
    supabase.from('disputes').select('id', { count: 'exact', head: true }).gte('created_at', weekAgo.toISOString()),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('source', 'bank_auto'),
    supabase.from('subscriptions').select('id', { count: 'exact', head: true }).eq('status', 'dismissed'),
    supabase.from('agent_feedback_events').select('id', { count: 'exact', head: true }).eq('feedback_type', 'positive').gte('created_at', weekAgo.toISOString()),
    supabase.from('agent_feedback_events').select('id', { count: 'exact', head: true }).eq('feedback_type', 'negative').gte('created_at', weekAgo.toISOString()),
    supabase.from('legal_references').select('id', { count: 'exact', head: true }),
    supabase.from('legal_references').select('id', { count: 'exact', head: true }).gte('confidence_score', 80),
    supabase.from('merchant_rules').select('id', { count: 'exact', head: true }),
    supabase.from('bank_transactions').select('id', { count: 'exact', head: true }).not('merchant_name', 'is', null),
    supabase.from('bank_transactions').select('id', { count: 'exact', head: true }),
  ]);

  const metrics = {
    letters_this_week: lettersThisWeek || 0,
    disputes_this_week: disputesThisWeek || 0,
    subs_auto_detected: subsDetected || 0,
    subs_dismissed: subsDismissed || 0,
    feedback_positive: feedbackPositive || 0,
    feedback_negative: feedbackNegative || 0,
    legal_refs_total: legalRefsTotal || 0,
    legal_refs_high_confidence: legalRefsHighConf || 0,
    merchant_rules: merchantRulesTotal || 0,
    merchant_match_rate: txsTotal ? Math.round(((txsWithMerchant || 0) / (txsTotal || 1)) * 100) : 0,
  };

  // Ask Claude to generate improvement proposals
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are the self-improvement engine for Paybacker, a UK consumer rights platform. Review these weekly metrics and suggest 2-3 specific, actionable improvements.

METRICS:
- Letters generated this week: ${metrics.letters_this_week}
- Disputes created: ${metrics.disputes_this_week}
- Subscriptions auto-detected: ${metrics.subs_auto_detected}
- Subscriptions dismissed by users: ${metrics.subs_dismissed}
- Positive letter feedback: ${metrics.feedback_positive}
- Negative letter feedback: ${metrics.feedback_negative}
- Legal references: ${metrics.legal_refs_total} total, ${metrics.legal_refs_high_confidence} high confidence (80%+)
- Merchant rules: ${metrics.merchant_rules}
- Merchant match rate: ${metrics.merchant_match_rate}% of transactions matched

Return ONLY a JSON array of improvement proposals:
[{"title": "short title", "description": "what to do and why", "category": "accuracy|coverage|ux|performance", "estimated_impact": "high|medium|low"}]

Focus on the weakest metrics. If everything looks good, return an empty array.`,
    }],
  });

  const content = message.content[0];
  let proposals: any[] = [];
  if (content.type === 'text') {
    let raw = content.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    const match = raw.match(/\[[\s\S]*\]/);
    if (match) proposals = JSON.parse(match[0]);
  }

  // Save proposals
  for (const p of proposals) {
    await supabase.from('improvement_proposals').insert({
      title: p.title,
      description: p.description,
      category: p.category,
      estimated_impact: p.estimated_impact,
      status: 'proposed',
      source: 'self_improve_cron',
    });
  }

  // Save metrics snapshot to business_log
  await supabase.from('business_log').insert({
    category: 'self_improvement',
    action: 'weekly_metrics',
    details: { metrics, proposals_count: proposals.length },
  });

  console.log(`[self-improve] Metrics:`, metrics, `Proposals: ${proposals.length}`);

  return NextResponse.json({ ok: true, metrics, proposals });
}
