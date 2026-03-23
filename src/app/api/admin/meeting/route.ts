import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'nodejs';
export const maxDuration = 300;

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_AGENTS_API_KEY || process.env.ANTHROPIC_API_KEY,
});

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface MeetingMessage {
  role: 'user' | 'assistant';
  content: string;
  agent?: string;
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { message, agents: requestedAgents, history } = await request.json();

  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  const supabase = getAdmin();

  // Fetch requested agents (or all executive agents)
  const agentRoles = requestedAgents || ['cfo', 'cto', 'cao', 'cmo', 'exec_assistant', 'support_lead'];
  const { data: agents } = await supabase
    .from('ai_executives')
    .select('role, name, system_prompt')
    .in('role', agentRoles)
    .eq('status', 'active');

  if (!agents || agents.length === 0) {
    return NextResponse.json({ error: 'No active agents found' }, { status: 404 });
  }

  // Gather live business context for the meeting
  const [tiersResult, openTickets, recentReports] = await Promise.all([
    supabase.from('profiles').select('subscription_tier'),
    supabase.from('support_tickets').select('id', { count: 'exact', head: true })
      .in('status', ['open', 'in_progress']),
    supabase.from('executive_reports')
      .select('title, content, created_at')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(10),
  ]);

  const tiers: Record<string, number> = { free: 0, essential: 0, pro: 0 };
  for (const p of tiersResult.data || []) {
    const tier = p.subscription_tier || 'free';
    tiers[tier] = (tiers[tier] || 0) + 1;
  }
  const mrr = tiers.essential * 9.99 + tiers.pro * 19.99;

  const businessContext = `Current business snapshot: MRR £${mrr.toFixed(2)}, ${tiers.free + tiers.essential + tiers.pro} total users (Free: ${tiers.free}, Essential: ${tiers.essential}, Pro: ${tiers.pro}), ${openTickets.count || 0} open support tickets.`;

  // Build conversation history for context
  const historyContext = (history || [])
    .map((h: MeetingMessage) => {
      if (h.role === 'user') return `Paul (Founder): ${h.content}`;
      return `${h.agent || 'Agent'}: ${h.content}`;
    })
    .join('\n\n');

  // Call each agent in parallel
  const responses = await Promise.all(
    agents.map(async (agent) => {
      const meetingPrompt = `You are in a live meeting with Paul (the founder of Paybacker) and the other AI executives. Respond in character as ${agent.name}. Be concise — this is a real-time conversation, not a report. Keep your response to 2-4 sentences unless Paul asks for detail.

${businessContext}

${historyContext ? `Meeting so far:\n${historyContext}\n\n` : ''}Paul says: "${message}"

Respond as ${agent.name} would in this meeting. Be direct, actionable, and speak from your area of expertise. If the topic isn't relevant to your role, say so briefly and defer to the right person.`;

      try {
        const response = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 300,
          system: agent.system_prompt,
          messages: [{ role: 'user', content: meetingPrompt }],
        });

        const text = response.content[0];
        if (text.type !== 'text') return { agent: agent.name, role: agent.role, response: 'No response.' };

        return {
          agent: agent.name,
          role: agent.role,
          response: text.text,
        };
      } catch (err: any) {
        console.error(`Meeting: ${agent.role} failed:`, err.message);
        return {
          agent: agent.name,
          role: agent.role,
          response: `[Unable to respond — ${err.message}]`,
        };
      }
    })
  );

  return NextResponse.json({ responses });
}
