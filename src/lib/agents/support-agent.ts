import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { AgentConfig, AgentReport } from './executive-agent';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface TicketAction {
  action: 'respond' | 'escalate';
  response?: string;
  escalation_reason?: string;
  suggested_priority?: string;
  category_suggestion?: string;
}

export async function runSupportAgent(agentConfig: AgentConfig): Promise<AgentReport> {
  const supabase = getAdmin();

  // Fetch open tickets with no first response, ordered by priority
  const { data: tickets } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('status', 'open')
    .is('first_response_at', null)
    .order('created_at', { ascending: true })
    .limit(5);

  if (!tickets || tickets.length === 0) {
    return {
      title: 'Support Agent Report — No Pending Tickets',
      reportType: 'support_agent',
      content: 'No unresponded tickets found. All clear.',
      data: { tickets_processed: 0 },
      recommendations: [],
    };
  }

  const actions: string[] = [];
  let responded = 0;
  let escalated = 0;

  for (const ticket of tickets) {
    // Get ticket messages for context
    const { data: messages } = await supabase
      .from('ticket_messages')
      .select('sender_type, sender_name, message, created_at')
      .eq('ticket_id', ticket.id)
      .order('created_at', { ascending: true });

    const conversation = (messages || [])
      .map(m => `[${m.sender_type}] ${m.sender_name}: ${m.message}`)
      .join('\n');

    const userPrompt = `Ticket ${ticket.ticket_number}:
Subject: ${ticket.subject}
Category: ${ticket.category}
Priority: ${ticket.priority}
Source: ${ticket.source}

Conversation:
${conversation}

What action should be taken for this ticket?`;

    try {
      const response = await anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: agentConfig.systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      });

      const text = response.content[0];
      if (text.type !== 'text') continue;

      // Parse JSON response
      let raw = text.text.trim();
      raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
      const jsonMatch = raw.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const result: TicketAction = JSON.parse(jsonMatch[0]);

      if (result.action === 'respond' && result.response) {
        // Insert AI response as ticket message
        await supabase.from('ticket_messages').insert({
          ticket_id: ticket.id,
          sender_type: 'agent',
          sender_name: 'Riley (AI)',
          message: result.response,
        });

        // Update ticket status and first_response_at
        await supabase.from('support_tickets').update({
          status: 'in_progress',
          first_response_at: new Date().toISOString(),
        }).eq('id', ticket.id);

        actions.push(`Responded to ${ticket.ticket_number}: "${ticket.subject}"`);
        responded++;
      } else if (result.action === 'escalate') {
        // Escalate to human
        const update: Record<string, any> = {
          assigned_to: 'Human Required',
        };
        if (result.suggested_priority) update.priority = result.suggested_priority;
        if (result.category_suggestion) update.category = result.category_suggestion;

        await supabase.from('support_tickets').update(update).eq('id', ticket.id);

        actions.push(`Escalated ${ticket.ticket_number}: ${result.escalation_reason || 'Complex issue'}`);
        escalated++;
      }

      // Cost tracking
      const inputTokens = response.usage?.input_tokens || 0;
      const outputTokens = response.usage?.output_tokens || 0;
      const cost = inputTokens * 0.0000008 + outputTokens * 0.000004;
      console.log(`[support-agent] ${ticket.ticket_number}: ${result.action} — $${cost.toFixed(6)}`);

    } catch (err) {
      console.error(`[support-agent] Failed to process ${ticket.ticket_number}:`, err);
      actions.push(`Failed to process ${ticket.ticket_number}`);
    }
  }

  return {
    title: `Support Agent Report — ${responded} responded, ${escalated} escalated`,
    reportType: 'support_agent',
    content: `Processed ${tickets.length} tickets. Responded to ${responded}, escalated ${escalated}.`,
    data: {
      tickets_processed: tickets.length,
      responded,
      escalated,
    },
    recommendations: actions,
  };
}
