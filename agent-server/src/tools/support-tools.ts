import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { config } from '../config';

function getSupabase() {
  return createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY);
}

// Accepts either a UUID or a TKT-XXXX ticket number, returns the UUID id.
async function resolveTicketId(sb: ReturnType<typeof getSupabase>, ticketId: string): Promise<string> {
  if (/^TKT-\d+$/i.test(ticketId)) {
    const { data, error } = await sb.from('support_tickets').select('id').eq('ticket_number', ticketId.toUpperCase()).single();
    if (error || !data) throw new Error(`Ticket ${ticketId} not found`);
    return data.id;
  }
  return ticketId;
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
      ticket_id: { type: 'string', description: 'Ticket ID — either a UUID or TKT-XXXX reference number' },
    },
    required: ['ticket_id'],
  },
  handler: async (args) => {
    const sb = getSupabase();
    let resolvedId: string;
    try {
      resolvedId = await resolveTicketId(sb, args.ticket_id);
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
    const [ticketRes, messagesRes] = await Promise.all([
      sb.from('support_tickets').select('*').eq('id', resolvedId).single(),
      sb.from('ticket_messages').select('*').eq('ticket_id', resolvedId).order('created_at', { ascending: true }),
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
      ticket_id: { type: 'string', description: 'Ticket ID — either a UUID or TKT-XXXX reference number' },
      message: { type: 'string', description: 'Response message to the user' },
      email_user: { type: 'boolean', default: true, description: 'Also send the response via email to the user' },
    },
    required: ['ticket_id', 'message'],
  },
  handler: async (args, agentRole) => {
    const sb = getSupabase();
    let resolvedId: string;
    try {
      resolvedId = await resolveTicketId(sb, args.ticket_id);
    } catch (e: any) {
      return `Error: ${e.message}`;
    }

    // GUARDRAIL: Prevent duplicate responses - check if an agent already replied
    const { data: existingReplies } = await sb.from('ticket_messages')
      .select('sender_type')
      .eq('ticket_id', resolvedId)
      .eq('sender_type', 'agent');

    if (existingReplies && existingReplies.length > 0) {
      return 'SKIPPED: Another agent has already responded to this ticket. Do not send duplicate responses.';
    }

    // GUARDRAIL: Block any response containing sensitive internal information
    const blockedTerms = [
      'next.js', 'nextjs', 'supabase', 'truelayer', 'claude', 'anthropic',
      'stripe', 'vercel', 'railway', 'posthog', 'perplexity', 'fal.ai',
      'resend', 'awin', 'typescript', 'tailwind', 'react', 'node.js',
      'postgresql', 'gemini', 'imagen', 'elevenlabs', 'openai', 'gpt',
      'haiku', 'sonnet', 'opus', 'api key', 'secret key', 'webhook',
      'cron job', 'deployment', 'git', 'github', 'docker', 'dockerfile',
    ];
    const msgLower = args.message.toLowerCase();
    const leaked = blockedTerms.filter(term => msgLower.includes(term));
    if (leaked.length > 0) {
      return `BLOCKED: Response contains sensitive internal terms (${leaked.join(', ')}). Rewrite without mentioning any internal systems, tech stack, APIs, or tools. Only discuss user-facing features.`;
    }

    // Insert message
    const { error: msgErr } = await sb.from('ticket_messages').insert({
      ticket_id: resolvedId,
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
    const { data: ticket } = await sb.from('support_tickets').select('first_response_at, user_id, ticket_number').eq('id', resolvedId).single();
    if (ticket && !ticket.first_response_at) {
      update.first_response_at = new Date().toISOString();
    }

    await sb.from('support_tickets').update(update).eq('id', resolvedId);

    // Email user if requested
    const shouldEmail = args.email_user !== false;
    if (shouldEmail && ticket?.user_id) {
      const { data: profile } = await sb.from('profiles').select('email').eq('id', ticket.user_id).single();
      if (profile?.email) {
        try {
          const resend = new Resend(config.RESEND_API_KEY);
          const ticketRef = ticket.ticket_number || resolvedId.slice(0, 8).toUpperCase();
          // Clean message: strip markdown bold/headers for email
          const cleanMsg = args.message
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/^### (.*$)/gm, '<h3 style="color:#0f172a;margin:16px 0 8px;font-size:15px;">$1</h3>')
            .replace(/^## (.*$)/gm, '<h3 style="color:#0f172a;margin:16px 0 8px;font-size:15px;">$1</h3>')
            .replace(/^- (.*$)/gm, '<li style="color:#334155;margin:4px 0;">$1</li>')
            .replace(/(<li.*<\/li>\n?)+/g, '<ul style="padding-left:20px;margin:8px 0;">$&</ul>')
            .replace(/\n\n/g, '</p><p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">')
            .replace(/\n/g, '<br>');

          await resend.emails.send({
            from: 'Paybacker Support <noreply@paybacker.co.uk>',
            to: profile.email,
            replyTo: 'support@mail.paybacker.co.uk',
            subject: `Re: Your support request (${ticketRef})`,
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:#0a1628;padding:20px 32px;">
      <table width="100%"><tr>
        <td><span style="font-size:20px;font-weight:800;color:#ffffff;">Pay<span style="color:#34d399;">backer</span></span></td>
        <td align="right"><span style="color:#94a3b8;font-size:12px;">${ticketRef}</span></td>
      </tr></table>
    </div>
    <div style="padding:32px;color:#334155;font-size:14px;line-height:1.7;">
      ${cleanMsg}
    </div>
    <div style="padding:24px 32px;border-top:1px solid #e2e8f0;">
      <a href="https://paybacker.co.uk/dashboard" style="display:inline-block;background:#34d399;color:#0a1628;padding:10px 20px;text-decoration:none;border-radius:6px;font-weight:600;font-size:13px;">View Dashboard</a>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;">
      Reply to this email to respond &middot; <a href="https://paybacker.co.uk" style="color:#34d399;text-decoration:none;">paybacker.co.uk</a>
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
      ticket_id: { type: 'string', description: 'Ticket ID to escalate — either a UUID or TKT-XXXX reference number' },
      reason: { type: 'string', description: 'Why this needs human attention' },
      new_priority: { type: 'string', enum: ['medium', 'high', 'urgent'], default: 'high' },
    },
    required: ['ticket_id', 'reason'],
  },
  handler: async (args, agentRole) => {
    const sb = getSupabase();
    let resolvedId: string;
    try {
      resolvedId = await resolveTicketId(sb, args.ticket_id);
    } catch (e: any) {
      return `Error: ${e.message}`;
    }

    // Get ticket details
    const { data: ticket } = await sb.from('support_tickets').select('ticket_number, subject, user_id, first_response_at').eq('id', resolvedId).single();
    const ticketRef = ticket?.ticket_number || 'Unknown';

    // Determine if this is a feature request or a bug
    const reasonLower = (args.reason || '').toLowerCase();
    const isFeatureRequest = reasonLower.includes('feature') || reasonLower.includes('request') || reasonLower.includes('suggestion');
    const isBug = reasonLower.includes('bug') || reasonLower.includes('broken') || reasonLower.includes('not work') || reasonLower.includes('error');

    await sb.from('support_tickets').update({
      assigned_to: isFeatureRequest ? 'Feature Review' : isBug ? 'Claude Code' : 'Human Required',
      priority: args.new_priority || 'high',
      status: 'in_progress',
    }).eq('id', resolvedId);

    // Internal escalation note
    await sb.from('ticket_messages').insert({
      ticket_id: resolvedId,
      sender_type: 'system',
      sender_name: agentRole === 'support_agent' ? 'Riley' : 'Sam',
      message: `Escalated: ${args.reason}`,
    });

    // Send user-facing acknowledgement so they know their ticket was seen
    // Only send if no agent has replied yet
    const { data: existingAgentReplies } = await sb.from('ticket_messages')
      .select('id')
      .eq('ticket_id', resolvedId)
      .eq('sender_type', 'agent');

    if (!existingAgentReplies || existingAgentReplies.length === 0) {
      await sb.from('ticket_messages').insert({
        ticket_id: resolvedId,
        sender_type: 'agent',
        sender_name: 'Paybacker Support',
        message: `Hi there,\n\nThanks for getting in touch. We've received your message and our team is looking into it.\n\nYour issue has been escalated to a specialist who will get back to you as soon as possible. You can reply to this email to add any further details.\n\nThanks for your patience,\nPaybacker Support Team`,
      });

      // Update first_response_at
      if (ticket && !ticket.first_response_at) {
        await sb.from('support_tickets').update({ first_response_at: new Date().toISOString() }).eq('id', resolvedId);
      }

      // Email the user
      if (ticket?.user_id) {
        const { data: profile } = await sb.from('profiles').select('email').eq('id', ticket.user_id).single();
        if (profile?.email) {
          try {
            const resend = new Resend(config.RESEND_API_KEY);
            await resend.emails.send({
              from: 'Paybacker Support <noreply@paybacker.co.uk>',
              to: profile.email,
              replyTo: 'support@mail.paybacker.co.uk',
              subject: `Re: Your support request (${ticketRef})`,
              html: `<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
<div style="max-width:600px;margin:0 auto;background:#fff;">
  <div style="background:#0f172a;padding:20px 32px;"><span style="font-size:20px;font-weight:800;color:#fff;">Pay<span style="color:#f59e0b;">backer</span></span></div>
  <div style="padding:32px;color:#334155;font-size:14px;line-height:1.7;">
    <p>Hi there,</p>
    <p>Thanks for getting in touch. We've received your message and our team is looking into it.</p>
    <p>Your issue has been escalated to a specialist who will get back to you as soon as possible. You can reply to this email to add any further details.</p>
    <p>Thanks for your patience,<br>Paybacker Support Team</p>
  </div>
  <div style="padding:16px 32px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;">Reply to this email to respond &middot; <a href="https://paybacker.co.uk" style="color:#f59e0b;">paybacker.co.uk</a></div>
</div></body></html>`,
            });
          } catch {}
        }
      }
    }

    // Log to business_log so Claude Code picks it up
    const category = isFeatureRequest ? 'decision' : isBug ? 'blocker' : 'context';
    await sb.from('business_log').insert({
      category,
      title: `${isFeatureRequest ? 'Feature Request' : isBug ? 'Bug Report' : 'Escalated Ticket'}: ${ticketRef} - ${ticket?.subject || 'Unknown'}`,
      content: `${args.reason}. Ticket: ${ticketRef}. ${isFeatureRequest ? 'Needs product review.' : isBug ? 'Needs Claude Code fix.' : 'Needs human review.'}`,
      created_by: 'support_agent',
    });

    // Notify founder via Telegram
    try {
      const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
      const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
      if (telegramToken && chatId) {
        const emoji = isFeatureRequest ? '💡' : isBug ? '🐛' : '⚠️';
        const msg = `${emoji} Ticket ${ticketRef} escalated\n\n${ticket?.subject || 'Unknown'}\n\nReason: ${args.reason}\n\nAssigned to: ${isFeatureRequest ? 'Feature Review' : isBug ? 'Claude Code' : 'Human'}`;
        await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: Number(chatId), text: msg }),
        });
      }
    } catch {}

    return `Ticket ${ticketRef} escalated. ${isFeatureRequest ? 'Queued for feature review.' : isBug ? 'Queued for Claude Code fix.' : 'Assigned to human.'} Founder notified via Telegram.`;
  },
};

const updateTicketStatus: ToolDef = {
  name: 'update_ticket_status',
  description: 'Update a ticket status, priority, or assignment.',
  schema: {
    type: 'object',
    properties: {
      ticket_id: { type: 'string', description: 'Ticket ID — either a UUID or TKT-XXXX reference number' },
      status: { type: 'string', enum: ['open', 'in_progress', 'awaiting_reply', 'resolved', 'closed'] },
      priority: { type: 'string', enum: ['low', 'medium', 'high', 'urgent'] },
      assigned_to: { type: 'string' },
    },
    required: ['ticket_id'],
  },
  handler: async (args) => {
    const sb = getSupabase();
    let resolvedId: string;
    try {
      resolvedId = await resolveTicketId(sb, args.ticket_id);
    } catch (e: any) {
      return `Error: ${e.message}`;
    }
    const update: Record<string, any> = {};
    if (args.status) update.status = args.status;
    if (args.priority) update.priority = args.priority;
    if (args.assigned_to) update.assigned_to = args.assigned_to;
    if (args.status === 'resolved' || args.status === 'closed') {
      update.resolved_at = new Date().toISOString();
    }

    const { error } = await sb.from('support_tickets').update(update).eq('id', resolvedId);
    if (error) {
      return `Error: ${error.message}`;
    }
    return `Ticket updated.`;
  },
};

const searchResolutions: ToolDef = {
  name: 'search_resolutions',
  description: 'Search the knowledge base for past ticket resolutions. Use this BEFORE responding to a ticket to see if a similar issue has been solved before. Search by category or keywords.',
  schema: {
    type: 'object',
    properties: {
      category: { type: 'string', description: 'Ticket category: billing, technical, complaint, general, account' },
      keywords: { type: 'string', description: 'Keywords to search for in issue summaries and solutions' },
      limit: { type: 'number', maximum: 10, default: 5 },
    },
  },
  handler: async (args) => {
    const sb = getSupabase();
    let query = sb.from('ticket_resolutions')
      .select('category, issue_summary, solution, steps_taken, outcome, tags, useful_count, created_at')
      .order('useful_count', { ascending: false })
      .limit(args.limit || 5);

    if (args.category) {
      query = query.eq('category', args.category);
    }

    const { data, error } = await query;
    if (error) return `Error searching resolutions: ${error.message}`;
    if (!data || data.length === 0) return 'No past resolutions found for this type of issue. Respond based on your knowledge.';

    // If keywords provided, filter client-side for relevance
    let results = data;
    if (args.keywords) {
      const kw = args.keywords.toLowerCase();
      results = data.filter(r =>
        r.issue_summary.toLowerCase().includes(kw) ||
        r.solution.toLowerCase().includes(kw) ||
        (r.tags || []).some((t: string) => t.toLowerCase().includes(kw))
      );
      if (results.length === 0) results = data; // Fall back to category results
    }

    return JSON.stringify({
      past_resolutions: results.map(r => ({
        issue: r.issue_summary,
        solution: r.solution,
        steps: r.steps_taken,
        outcome: r.outcome,
        category: r.category,
        times_useful: r.useful_count,
      })),
      count: results.length,
      instruction: 'Use these past solutions as reference when crafting your response. Adapt the solution to the specific ticket context.',
    });
  },
};

const logResolution: ToolDef = {
  name: 'log_resolution',
  description: 'Log a ticket resolution to the knowledge base after a ticket is resolved. This helps future tickets with similar issues get faster, better responses.',
  schema: {
    type: 'object',
    properties: {
      ticket_id: { type: 'string', description: 'The ticket UUID' },
      category: { type: 'string', description: 'Issue category: billing, technical, complaint, general, account' },
      issue_summary: { type: 'string', description: 'Brief summary of the issue (1-2 sentences)' },
      solution: { type: 'string', description: 'What resolved the issue (1-3 sentences)' },
      steps_taken: { type: 'string', description: 'Steps taken to resolve (optional)' },
      outcome: { type: 'string', description: 'resolved, partial, escalated', default: 'resolved' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Relevant tags for searchability (e.g. energy, refund, billing_error)' },
    },
    required: ['category', 'issue_summary', 'solution'],
  },
  handler: async (args) => {
    const sb = getSupabase();

    const { error } = await sb.from('ticket_resolutions').insert({
      ticket_id: args.ticket_id || null,
      category: args.category,
      issue_summary: args.issue_summary,
      solution: args.solution,
      steps_taken: args.steps_taken || null,
      outcome: args.outcome || 'resolved',
      tags: args.tags || [],
    });

    if (error) return `Error logging resolution: ${error.message}`;
    return 'Resolution logged to knowledge base. This will help resolve similar issues faster in the future.';
  },
};

export const supportTools: ToolDef[] = [listTickets, getTicket, respondToTicket, escalateTicket, updateTicketStatus, searchResolutions, logResolution];
