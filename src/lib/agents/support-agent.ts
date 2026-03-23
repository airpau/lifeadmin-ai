import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { AgentConfig, AgentReport } from './executive-agent';
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

// Separate API key for AI executive agents — allows tracking staff costs independently
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_AGENTS_API_KEY || process.env.ANTHROPIC_API_KEY,
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

        // Email the user if we have their user_id
        if (ticket.user_id) {
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('email, full_name')
              .eq('id', ticket.user_id)
              .single();

            if (profile?.email) {
              await resend.emails.send({
                from: FROM_EMAIL,
                replyTo: REPLY_TO,
                to: profile.email,
                subject: `Re: ${ticket.subject} (${ticket.ticket_number})`,
                html: `
                  <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 40px; border-radius: 16px;">
                    <div style="border-bottom: 2px solid #f59e0b; padding-bottom: 16px; margin-bottom: 24px;">
                      <h1 style="color: #f59e0b; font-size: 22px; margin: 0;">Paybacker Support</h1>
                      <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;">Ticket ${ticket.ticket_number}</p>
                    </div>
                    <p style="color: #94a3b8; font-size: 14px; margin-bottom: 8px;">
                      Hi${profile.full_name ? ` ${profile.full_name.split(' ')[0]}` : ''},
                    </p>
                    <p style="color: #94a3b8; font-size: 14px; margin-bottom: 8px;">
                      We've looked into your request: <strong style="color: #e2e8f0;">${ticket.subject}</strong>
                    </p>
                    <div style="background: #1e293b; border-left: 3px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0;">
                      <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${result.response}</p>
                    </div>
                    <p style="color: #94a3b8; font-size: 14px;">
                      Reply to this email if you need further help.
                    </p>
                    <hr style="border: none; border-top: 1px solid #1e293b; margin: 24px 0;" />
                    <p style="color: #475569; font-size: 12px; margin: 0;">
                      Paybacker Ltd &middot; support@paybacker.co.uk
                    </p>
                  </div>
                `,
              });
              console.log(`[support-agent] Emailed response to ${profile.email} for ${ticket.ticket_number}`);
            }
          } catch (emailErr) {
            console.error(`[support-agent] Email failed for ${ticket.ticket_number}:`, emailErr);
          }
        }

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
