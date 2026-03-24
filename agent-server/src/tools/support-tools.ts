import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { config } from '../config';

function getSupabase() {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
}

export const listTickets = tool(
  'list_tickets',
  'List support tickets with optional filters. Use to understand current support load and identify priority issues.',
  {
    status: z.enum(['open', 'in_progress', 'awaiting_reply', 'resolved', 'closed', 'all']).default('open'),
    priority: z.enum(['low', 'medium', 'high', 'urgent', 'all']).default('all'),
    limit: z.number().max(20).default(10),
  },
  async (args) => {
    const sb = getSupabase();
    let query = sb.from('support_tickets')
      .select('id, ticket_number, subject, category, priority, status, assigned_to, source, created_at, first_response_at, user_id')
      .order('created_at', { ascending: false })
      .limit(args.limit);

    if (args.status !== 'all') query = query.eq('status', args.status);
    if (args.priority !== 'all') query = query.eq('priority', args.priority);

    const { data, error } = await query;
    if (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true };
    }

    if (!data || data.length === 0) {
      return { content: [{ type: 'text' as const, text: 'No tickets found matching criteria.' }] };
    }

    const formatted = data.map(t => {
      const waitTime = t.first_response_at ? '' : ` (waiting ${Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000)} mins)`;
      return `${t.ticket_number} [${t.priority}/${t.status}] ${t.subject} (${t.category}, from: ${t.source})${waitTime}`;
    }).join('\n');

    return { content: [{ type: 'text' as const, text: `${data.length} tickets:\n${formatted}` }] };
  },
  { annotations: { readOnlyHint: true } }
);

export const getTicket = tool(
  'get_ticket',
  'Get full ticket details including conversation history. Use before responding to understand full context.',
  {
    ticket_id: z.string().uuid().describe('Ticket ID'),
  },
  async (args) => {
    const sb = getSupabase();
    const [ticketRes, messagesRes] = await Promise.all([
      sb.from('support_tickets').select('*').eq('id', args.ticket_id).single(),
      sb.from('ticket_messages').select('*').eq('ticket_id', args.ticket_id).order('created_at', { ascending: true }),
    ]);

    if (ticketRes.error) {
      return { content: [{ type: 'text' as const, text: `Error: ${ticketRes.error.message}` }], isError: true };
    }

    const t = ticketRes.data;
    const msgs = (messagesRes.data || []).map(m =>
      `[${m.sender_type}] ${m.sender_name || 'Unknown'}: ${m.message}`
    ).join('\n\n');

    // Get user email for reply
    let userEmail = '';
    if (t.user_id) {
      const { data: profile } = await sb.from('profiles').select('email').eq('id', t.user_id).single();
      userEmail = profile?.email || '';
    }

    const text = `Ticket: ${t.ticket_number}\nSubject: ${t.subject}\nCategory: ${t.category}\nPriority: ${t.priority}\nStatus: ${t.status}\nSource: ${t.source}\nUser email: ${userEmail}\nCreated: ${t.created_at}\nFirst response: ${t.first_response_at || 'NONE'}\n\nConversation:\n${msgs || '(no messages)'}`;

    return { content: [{ type: 'text' as const, text }] };
  },
  { annotations: { readOnlyHint: true } }
);

export const respondToTicket = tool(
  'respond_to_ticket',
  'Send a response to a support ticket. This adds the message to the conversation thread, updates the ticket status, and optionally emails the user.',
  {
    ticket_id: z.string().uuid().describe('Ticket ID'),
    message: z.string().describe('Response message to the user'),
    email_user: z.boolean().default(true).describe('Also send the response via email to the user'),
  },
  async (args, extra: any) => {
    const agentRole = extra?.agentRole || 'support_agent';
    const sb = getSupabase();

    // Insert message
    const { error: msgErr } = await sb.from('ticket_messages').insert({
      ticket_id: args.ticket_id,
      sender_type: 'agent',
      sender_name: agentRole === 'support_agent' ? 'Riley (AI Support)' : 'Sam (Support Lead)',
      message: args.message,
    });

    if (msgErr) {
      return { content: [{ type: 'text' as const, text: `Failed to add message: ${msgErr.message}` }], isError: true };
    }

    // Update ticket status
    const update: Record<string, any> = { status: 'awaiting_reply' };
    // Set first_response_at if this is the first response
    const { data: ticket } = await sb.from('support_tickets').select('first_response_at, user_id').eq('id', args.ticket_id).single();
    if (ticket && !ticket.first_response_at) {
      update.first_response_at = new Date().toISOString();
    }

    await sb.from('support_tickets').update(update).eq('id', args.ticket_id);

    // Email user if requested
    if (args.email_user && ticket?.user_id) {
      const { data: profile } = await sb.from('profiles').select('email').eq('id', ticket.user_id).single();
      if (profile?.email) {
        try {
          const resend = new Resend(config.RESEND_API_KEY);
          await resend.emails.send({
            from: 'support@paybacker.co.uk',
            to: profile.email,
            replyTo: 'support@paybacker.co.uk',
            subject: `Re: Your support request`,
            html: `<div style="font-family: Arial, sans-serif;"><p>${args.message.replace(/\n/g, '<br>')}</p><hr><p style="color: #64748b; font-size: 12px;">Paybacker Support Team</p></div>`,
          });
        } catch (e) {
          // Email failure shouldn't block ticket response
        }
      }
    }

    return { content: [{ type: 'text' as const, text: `Response added to ticket. Status updated to awaiting_reply.` }] };
  }
);

export const escalateTicket = tool(
  'escalate_ticket',
  'Escalate a ticket that needs human attention. Use when the issue is too complex for automated resolution.',
  {
    ticket_id: z.string().uuid().describe('Ticket ID to escalate'),
    reason: z.string().describe('Why this needs human attention'),
    new_priority: z.enum(['medium', 'high', 'urgent']).default('high'),
  },
  async (args, extra: any) => {
    const agentRole = extra?.agentRole || 'support_agent';
    const sb = getSupabase();

    await sb.from('support_tickets').update({
      assigned_to: 'Human Required',
      priority: args.new_priority,
      status: 'in_progress',
    }).eq('id', args.ticket_id);

    await sb.from('ticket_messages').insert({
      ticket_id: args.ticket_id,
      sender_type: 'system',
      sender_name: agentRole === 'support_agent' ? 'Riley' : 'Sam',
      message: `Escalated to human: ${args.reason}`,
    });

    return { content: [{ type: 'text' as const, text: `Ticket escalated to human. Reason: ${args.reason}` }] };
  }
);

export const updateTicketStatus = tool(
  'update_ticket_status',
  'Update a ticket status, priority, or assignment.',
  {
    ticket_id: z.string().uuid(),
    status: z.enum(['open', 'in_progress', 'awaiting_reply', 'resolved', 'closed']).optional(),
    priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
    assigned_to: z.string().optional(),
  },
  async (args) => {
    const sb = getSupabase();
    const update: Record<string, any> = {};
    if (args.status) update.status = args.status;
    if (args.priority) update.priority = args.priority;
    if (args.assigned_to) update.assigned_to = args.assigned_to;
    if (args.status === 'resolved' || args.status === 'closed') {
      update.resolved_at = new Date().toISOString();
    }

    const { error } = await sb.from('support_tickets').update(update).eq('id', args.ticket_id);
    if (error) {
      return { content: [{ type: 'text' as const, text: `Error: ${error.message}` }], isError: true };
    }
    return { content: [{ type: 'text' as const, text: `Ticket updated.` }] };
  }
);

export const supportTools = [listTickets, getTicket, respondToTicket, escalateTicket, updateTicketStatus];
