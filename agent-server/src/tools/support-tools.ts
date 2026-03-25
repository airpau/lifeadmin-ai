import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { config } from '../config';

function getSupabase() {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
}

interface ToolDef {
  name: string;
  description: string;
  schema: Record<string, any>;
  handler: (args: any, agentRole: string) => Promise<string>;
}

const listTickets: ToolDef = {
  name: 'list_tickets',
  description: 'List support tickets with optional filters. Use to understand current support load and identify priority issues.',
  schema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['open', 'in_progress', 'awaiting_reply', 'resolved', 'closed', 'all'], default: 'open' },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent', 'all'], default: 'all' },
      limit: { type: 'number', maximum: 20, default: 10 },
    },
  },
  handler: async (args) => {
    const sb = getSupabase();
    let query = sb.from('support_tickets')
      .select('id, ticket_number, subject, category, priority, status, assigned_to, source, created_at, first_response_at, user_id')
      .order('created_at', { ascending: false })
      .limit(args.limit || 10);

    const status = args.status || 'open';
    const priority = args.priority || 'all';
    if (status !== 'all') query = query.eq('status', status);
    if (priority !== 'all') query = query.eq('priority', priority);

    const { data, error } = await query;
    if (error) {
      return `Error: ${error.message}`;
    }

    if (!data || data.length === 0) {
      return 'No tickets found matching criteria.';
    }

    const formatted = data.map(t => {
      const waitTime = t.first_response_at ? '' : ` (waiting ${Math.round((Date.now() - new Date(t.created_at).getTime()) / 60000)} mins)`;
      return `${t.ticket_number} [${t.priority}/${t.status}] ${t.subject} (${t.category}, from: ${t.source})${waitTime}`;
    }).join('\n');

    return `${data.length} tickets:\n${formatted}`;
  },
};

const getTicket: ToolDef = {
  name: 'get_ticket',
  description: 'Get full ticket details including conversation history. Use before responding to understand full context.',
  schema: {
    type: 'object',
    properties: {
      ticket_id: { type: 'string', format: 'uuid', description: 'Ticket ID' },
    },
    required: ['ticket_id'],
  },
  handler: async (args) => {
    const sb = getSupabase();
    const [ticketRes, messagesRes] = await Promise.all([
      sb.from('support_tickets').select('*').eq('id', args.ticket_id).single(),
      sb.from('ticket_messages').select('*').eq('ticket_id', args.ticket_id).order('created_at', { ascending: true }),
    ]);

    if (ticketRes.error) {
      return `Error: ${ticketRes.error.message}`;
    }

    const t = ticketRes.data;
    const msgs = (messagesRes.data || []).map((m: any) =>
      `[${m.sender_type}] ${m.sender_name || 'Unknown'}: ${m.message}`
    ).join('\n\n');

    // Get user email for reply
    let userEmail = '';
    if (t.user_id) {
      const { data: profile } = await sb.from('profiles').select('email').eq('id', t.user_id).single();
      userEmail = profile?.email || '';
    }

    return `Ticket: ${t.ticket_number}\nSubject: ${t.subject}\nCategory: ${t.category}\nPriority: ${t.priority}\nStatus: ${t.status}\nSource: ${t.source}\nUser email: ${userEmail}\nCreated: ${t.created_at}\nFirst response: ${t.first_response_at || 'NONE'}\n\nConversation:\n${msgs || '(no messages)'}`;
  },
};

const respondToTicket: ToolDef = {
  name: 'respond_to_ticket',
  description: 'Send a response to a support ticket. This adds the message to the conversation thread, updates the ticket status, and optionally emails the user.',
  schema: {
    type: 'object',
    properties: {
      ticket_id: { type: 'string', format: 'uuid', description: 'Ticket ID' },
      message: { type: 'string', description: 'Response message to the user' },
      email_user: { type: 'boolean', default: true, description: 'Also send the response via email to the user' },
    },
    required: ['ticket_id', 'message'],
  },
  handler: async (args, agentRole) => {
    const sb = getSupabase();

    // Insert message
    const { error: msgErr } = await sb.from('ticket_messages').insert({
      ticket_id: args.ticket_id,
      sender_type: 'agent',
      sender_name: agentRole === 'support_agent' ? 'Riley (AI Support)' : 'Sam (Support Lead)',
      message: args.message,
    });

    if (msgErr) {
      return `Failed to add message: ${msgErr.message}`;
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
    const shouldEmail = args.email_user !== false;
    if (shouldEmail && ticket?.user_id) {
      const { data: profile } = await sb.from('profiles').select('email').eq('id', ticket.user_id).single();
      if (profile?.email) {
        try {
          const resend = new Resend(config.RESEND_API_KEY);
          await resend.emails.send({
            from: 'support@paybacker.co.uk',
            to: profile.email,
            replyTo: 'support@mail.paybacker.co.uk',
            subject: `Re: Your support request`,
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#020617;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;">
    <div style="background:#0f172a;padding:20px 32px;border-bottom:1px solid #1e293b;">
      <span style="font-size:22px;font-weight:800;color:#ffffff;">Pay<span style="color:#f59e0b;">backer</span></span>
    </div>
    <div style="background:linear-gradient(180deg,#0f172a 0%,#1a1f35 100%);padding:32px;">
      <div style="color:#e2e8f0;font-size:14px;line-height:1.8;">${args.message.replace(/\n/g, '<br>')}</div>
      <div style="margin-top:24px;">
        <a href="https://paybacker.co.uk/dashboard" style="display:inline-block;background:#f59e0b;color:#0f172a;padding:12px 24px;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;">View Your Dashboard</a>
      </div>
    </div>
    <div style="background:#0f172a;padding:20px 32px;border-top:1px solid #1e293b;">
      <div style="color:#475569;font-size:11px;">Paybacker Support Team - paybacker.co.uk</div>
      <div style="color:#334155;font-size:10px;margin-top:4px;">Reply to this email or visit your dashboard for more help.</div>
    </div>
  </div>
</body></html>`,
          });
        } catch (e) {
          // Email failure shouldn't block ticket response
        }
      }
    }

    return `Response added to ticket. Status updated to awaiting_reply.`;
  },
};

const escalateTicket: ToolDef = {
  name: 'escalate_ticket',
  description: 'Escalate a ticket that needs human attention. Use when the issue is too complex for automated resolution.',
  schema: {
    type: 'object',
    properties: {
      ticket_id: { type: 'string', format: 'uuid', description: 'Ticket ID to escalate' },
      reason: { type: 'string', description: 'Why this needs human attention' },
      new_priority: { type: 'string', enum: ['medium', 'high', 'urgent'], default: 'high' },
    },
    required: ['ticket_id', 'reason'],
  },
  handler: async (args, agentRole) => {
    const sb = getSupabase();

    await sb.from('support_tickets').update({
      assigned_to: 'Human Required',
      priority: args.new_priority || 'high',
      status: 'in_progress',
    }).eq('id', args.ticket_id);

    await sb.from('ticket_messages').insert({
      ticket_id: args.ticket_id,
      sender_type: 'system',
      sender_name: agentRole === 'support_agent' ? 'Riley' : 'Sam',
      message: `Escalated to human: ${args.reason}`,
    });

    return `Ticket escalated to human. Reason: ${args.reason}`;
  },
};

const updateTicketStatus: ToolDef = {
  name: 'update_ticket_status',
  description: 'Update a ticket status, priority, or assignment.',
  schema: {
    type: 'object',
    properties: {
      ticket_id: { type: 'string', format: 'uuid' },
      status: { type: 'string', enum: ['open', 'in_progress', 'awaiting_reply', 'resolved', 'closed'] },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
      assigned_to: { type: 'string' },
    },
    required: ['ticket_id'],
  },
  handler: async (args) => {
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
      return `Error: ${error.message}`;
    }
    return `Ticket updated.`;
  },
};

export const supportTools: ToolDef[] = [listTickets, getTicket, respondToTicket, escalateTicket, updateTicketStatus];
