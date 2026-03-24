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

  const { message, agents: requestedAgents, history, meetingId, action } = await request.json();

  const supabase = getAdmin();

  // Handle meeting end: generate summary and email
  if (action === 'end_meeting' && meetingId) {
    const { data: messages } = await supabase
      .from('meeting_messages')
      .select('role, agent_name, content')
      .eq('meeting_id', meetingId)
      .order('created_at', { ascending: true });

    const transcript = (messages || []).map(m =>
      m.role === 'user' ? `Paul: ${m.content}` : `${m.agent_name}: ${m.content}`
    ).join('\n\n');

    // Generate summary via Claude
    let summary = '';
    let actionItems: any[] = [];
    try {
      const summaryRes = await anthropic.messages.create({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        system: 'You are a meeting secretary. Summarise this meeting concisely and extract action items. Return JSON: {"summary": "...", "action_items": [{"task": "...", "assigned_to": "agent role or human"}]}',
        messages: [{ role: 'user', content: `Summarise this meeting:\n\n${transcript}` }],
      });
      const text = summaryRes.content[0];
      if (text.type === 'text') {
        let raw = text.text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        const match = raw.match(/\{[\s\S]*\}/);
        if (match) {
          const parsed = JSON.parse(match[0].replace(/,\s*([}\]])/g, '$1'));
          summary = parsed.summary || '';
          actionItems = parsed.action_items || [];
        }
      }
    } catch {}

    await supabase.from('meetings').update({
      status: 'ended',
      ended_at: new Date().toISOString(),
      summary,
      action_items: actionItems,
    }).eq('id', meetingId);

    // Save key decisions to agent memory AND create agent_tasks so agents can work on them
    if (actionItems.length > 0) {
      const { createAgentTask } = await import('@/lib/agents/agent-workflow');

      for (const item of actionItems) {
        const assignedTo = item.assigned_to || 'exec_assistant';

        // Save to memory
        await supabase.from('agent_memory').insert({
          agent_role: assignedTo,
          memory_type: 'decision',
          title: `Meeting action: ${item.task?.substring(0, 80)}`,
          content: item.task || '',
          importance: 7,
        });

        // Create actionable task so the agent can work on it autonomously
        await createAgentTask({
          createdBy: 'meeting',
          assignedTo,
          title: item.task || 'Meeting action item',
          description: item.task || '',
          priority: 'high',
          sourceMeetingId: meetingId,
        });
      }
    }

    // Email summary to founder via Charlie
    const { resend, FROM_EMAIL } = await import('@/lib/resend');
    await resend.emails.send({
      from: FROM_EMAIL,
      to: 'hello@paybacker.co.uk',
      subject: `Meeting Summary: ${summary?.substring(0, 60) || 'Executive Meeting'}`,
      html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:40px;border-radius:16px;">
        <h1 style="color:#f59e0b;font-size:20px;margin:0 0 16px;">Meeting Summary</h1>
        <p style="color:#e2e8f0;font-size:14px;line-height:1.6;white-space:pre-wrap;">${summary}</p>
        ${actionItems.length > 0 ? `<div style="background:#1e293b;border-radius:8px;padding:16px;margin:20px 0;">
          <p style="color:#f59e0b;font-weight:bold;margin:0 0 8px;">Action Items</p>
          <ul style="color:#94a3b8;padding-left:20px;margin:0;">${actionItems.map((a: any) => `<li>${a.task} (${a.assigned_to || 'unassigned'})</li>`).join('')}</ul>
        </div>` : ''}
        <p style="color:#475569;font-size:11px;margin-top:24px;">Paybacker AI Executive Meeting</p>
      </div>`,
    }).catch(() => {});

    return NextResponse.json({ summary, actionItems, meetingId });
  }

  if (!message) {
    return NextResponse.json({ error: 'message is required' }, { status: 400 });
  }

  // Fetch requested agents (or all executive agents)
  const agentRoles = requestedAgents || ['cfo', 'cto', 'cao', 'cmo', 'head_of_ads', 'cco', 'cgo', 'cro', 'clo', 'cio', 'cxo', 'cfraudo', 'exec_assistant', 'support_lead', 'support_agent'];
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

  // Create or continue meeting
  let currentMeetingId = meetingId;
  if (!currentMeetingId) {
    const { data: newMeeting } = await supabase.from('meetings')
      .insert({ title: message.substring(0, 80), status: 'active' })
      .select('id').single();
    currentMeetingId = newMeeting?.id;
  }

  // Save the user's message
  if (currentMeetingId) {
    await supabase.from('meeting_messages').insert({
      meeting_id: currentMeetingId,
      role: 'user',
      content: message,
    });
  }

  // Load previous meeting context AND agent memories
  let previousMeetingContext = '';
  const { data: recentMeetings } = await supabase.from('meetings')
    .select('summary, action_items, ended_at')
    .eq('status', 'ended')
    .order('ended_at', { ascending: false })
    .limit(3);

  if (recentMeetings && recentMeetings.length > 0) {
    previousMeetingContext = '\n\nPREVIOUS MEETINGS (you must remember these):\n' +
      recentMeetings.map((m: any) => {
        const items = Array.isArray(m.action_items) ? m.action_items.map((a: any) => a.task).join('; ') : '';
        return `- ${m.summary || 'No summary'}${items ? ' Actions: ' + items : ''}`;
      }).join('\n');
  }

  // Load pending agent_tasks so agents know what's been assigned
  const { data: pendingTasks } = await supabase.from('agent_tasks')
    .select('title, created_by, assigned_to, status')
    .in('status', ['pending', 'in_progress'])
    .limit(10);

  const taskContext = pendingTasks && pendingTasks.length > 0
    ? '\n\nCURRENT AGENT TASKS:\n' + pendingTasks.map((t: any) => `- [${t.status}] ${t.title} (${t.created_by} > ${t.assigned_to})`).join('\n')
    : '';

  // STEP 1: Chairperson decides who should speak (max 3-5 agents)
  const agentList = agents.map(a => `${a.role}: ${a.name}`).join(', ');
  let selectedRoles: string[] = [];

  try {
    const chairRes = await anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      system: 'You are a meeting chairperson. Given a message from the founder and a list of available agents, select the 3-5 agents most relevant to respond. Return ONLY a JSON array of role strings, e.g. ["cfo","cto","cmo"]. If the message is general (like "what are our priorities"), include exec_assistant plus the 3-4 most relevant. If it targets a specific area, pick only the directly relevant agents.',
      messages: [{ role: 'user', content: `Founder says: "${message}"\n\nAvailable agents: ${agentList}\n\nWhich 3-5 agents should respond?` }],
    });

    const chairText = chairRes.content[0];
    if (chairText.type === 'text') {
      const match = chairText.text.match(/\[[\s\S]*\]/);
      if (match) {
        selectedRoles = JSON.parse(match[0]);
      }
    }
  } catch {
    // Fallback: pick first 5
    selectedRoles = agents.slice(0, 5).map(a => a.role);
  }

  // If chairperson returned nothing sensible, default to 5
  if (selectedRoles.length === 0) {
    selectedRoles = agents.slice(0, 5).map(a => a.role);
  }

  const selectedAgents = agents.filter(a => selectedRoles.includes(a.role));

  // STEP 2: Selected agents respond in parallel for speed, with memory context
  const responses = await Promise.all(
    selectedAgents.map(async (agent) => {
      // Load agent-specific memory (most recent first, more items)
      const { data: memories } = await supabase.from('agent_memory')
        .select('title, content')
        .eq('agent_role', agent.role)
        .order('created_at', { ascending: false })
        .limit(5);

      const memoryContext = memories && memories.length > 0
        ? `\n\nYOUR PERSISTENT MEMORY (you MUST use this information when relevant):\n${memories.map((m: any) => `- ${m.content.substring(0, 300)}`).join('\n')}`
        : '';

      const meetingPrompt = `You are in a live meeting with Paul (the founder of Paybacker) and other AI executives. Respond in character as ${agent.name}. Be concise: 2-4 sentences unless Paul asks for detail.

CRITICAL: You have persistent memory. If Paul refers to something from a previous meeting, check your memory section below and recall it accurately. Never say you don't remember something that is in your memory.

${businessContext}${previousMeetingContext}${taskContext}${memoryContext}

${historyContext ? `Meeting so far:\n${historyContext}\n\n` : ''}Paul says: "${message}"

Respond as ${agent.name}. Be direct and actionable. Speak from your area of expertise. If the topic isn't relevant to your role, say so briefly and defer to the right person.
If Paul asks you to email something, coordinate something, or take an action, include in your response what you will do.`;

      try {
        // Use Haiku for meeting responses (cost control: ~$0.003 per response vs $0.05 for Sonnet)
        const response = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system: agent.system_prompt,
          messages: [{ role: 'user', content: meetingPrompt }],
        });

        const text = response.content[0];
        const responseText = text.type === 'text' ? text.text : 'No response.';

        // Save to meeting_messages
        if (currentMeetingId) {
          await supabase.from('meeting_messages').insert({
            meeting_id: currentMeetingId,
            role: 'assistant',
            agent_role: agent.role,
            agent_name: agent.name,
            content: responseText,
          });
        }

        // Charlie sends email only when explicitly asked to email
        if (agent.role === 'exec_assistant' && (
          message.toLowerCase().includes('email me') ||
          message.toLowerCase().includes('send me an email') ||
          message.toLowerCase().includes('send me a summary') ||
          message.toLowerCase().includes('email a summary')
        )) {
          try {
            const { resend: rs, FROM_EMAIL: fe } = await import('@/lib/resend');
            await rs.emails.send({
              from: fe,
              to: 'hello@paybacker.co.uk',
              subject: `Meeting Update from Charlie`,
              html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#0f172a;color:#e2e8f0;padding:40px;border-radius:16px;">
                <h1 style="color:#f59e0b;font-size:20px;margin:0 0 16px;">Meeting Update</h1>
                <p style="color:#94a3b8;font-size:13px;margin-bottom:8px;">You asked: "${message}"</p>
                <div style="background:#1e293b;border-radius:8px;padding:16px;margin:12px 0;">
                  <p style="color:#e2e8f0;font-size:14px;line-height:1.6;white-space:pre-wrap;">${responseText}</p>
                </div>
                <p style="color:#475569;font-size:11px;margin-top:24px;">Charlie (Executive Assistant)</p>
              </div>`,
            });
          } catch {}
        }

        return { agent: agent.name, role: agent.role, response: responseText };
      } catch (err: any) {
        return { agent: agent.name, role: agent.role, response: `[Unable to respond]` };
      }
    })
  );

  // Save meeting context to ALL agents' memory so everyone remembers
  if (responses.length > 0 && currentMeetingId) {
    const roundSummary = responses.map(r => `${r.agent}: ${r.response.substring(0, 100)}`).join('\n');
    const memoryContent = `Paul asked: "${message.substring(0, 200)}"\nResponses: ${roundSummary}`;
    const memoryTitle = `Meeting discussion: ${message.substring(0, 60)}`;

    // Save to every agent that participated, plus Charlie
    const agentRolesToRemember = new Set([
      ...responses.map(r => r.role),
      'exec_assistant',
    ]);

    await supabase.from('agent_memory').insert(
      Array.from(agentRolesToRemember).map(role => ({
        agent_role: role,
        memory_type: 'context' as const,
        title: memoryTitle,
        content: memoryContent,
        importance: 6,
      }))
    );
  }

  return NextResponse.json({ responses, meetingId: currentMeetingId });
}
