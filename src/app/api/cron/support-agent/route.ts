import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Riley — Paperclip Support Agent
 *
 * Runs every 15 minutes via Vercel Cron.
 * Polls the support_tickets table for open tickets with unanswered user messages,
 * generates a response using Claude, and either resolves or escalates.
 *
 * Logs all activity to business_log with created_by: 'riley-support-agent'
 * so the AITeamPanel displays Riley's health correctly.
 */

const AGENT_ID = 'riley-support-agent';
const TICKET_REPLY_TO = 'support@mail.paybacker.co.uk';

export const maxDuration = 300;
export const runtime = 'nodejs';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// GUARDRAIL: Block any response containing sensitive internal information
const BLOCKED_TERMS = [
  'next.js', 'nextjs', 'supabase', 'truelayer', 'claude', 'anthropic',
  'stripe', 'vercel', 'railway', 'posthog', 'perplexity', 'fal.ai',
  'resend', 'awin', 'typescript', 'tailwind', 'react', 'node.js',
  'postgresql', 'gemini', 'imagen', 'elevenlabs', 'openai', 'gpt',
  'haiku', 'sonnet', 'opus', 'api key', 'secret key', 'webhook',
  'cron job', 'deployment', 'git', 'github', 'docker', 'dockerfile',
];

function containsBlockedTerms(message: string): string[] {
  const lower = message.toLowerCase();
  return BLOCKED_TERMS.filter(term => lower.includes(term));
}

const SYSTEM_PROMPT = `You are Riley, the Paybacker AI Support Agent. You help users resolve their problems with the Paybacker platform.

About Paybacker: An AI-powered savings platform for UK consumers that helps people dispute unfair bills, track subscriptions, scan bank accounts and email inboxes, and take control of their finances.

GUIDELINES:
- Be friendly, empathetic, and concise
- Use British English and £ symbols
- NEVER use em dashes, use commas or colons instead
- Address the user's specific issue directly
- If the issue can be resolved with guidance, provide clear step-by-step instructions
- If the issue requires account changes, refunds, technical fixes, or anything you cannot action yourself, you MUST escalate

ESCALATION RULES — you MUST escalate if:
- The user needs a refund or billing adjustment
- The user wants to delete their account
- There is a technical bug (bank sync failure, page not loading, etc.)
- The issue involves accessing another user's data
- You are unsure how to resolve the problem
- The user has already tried your suggested solution and it did not work
- The issue involves legal or regulatory matters

STRICT RULES:
- NEVER reveal technical details about how Paybacker is built (tech stack, APIs, database, AI models)
- NEVER mention Supabase, Yapily, Claude, Anthropic, Stripe, Vercel, Railway, or any internal systems
- NEVER discuss pricing strategies, business plans, revenue models, or internal metrics
- NEVER share information about other users
- Only discuss what users can see and use in the product

RESPONSE FORMAT:
Respond with valid JSON containing exactly two keys:
1. "reply": Your message to the user. Be warm and helpful.
2. "escalate": Boolean. true if a human needs to handle it. false if you have resolved the issue.

Example resolution:
{"reply": "Hi there,\\n\\nTo update your email address, head to your Dashboard, click on your profile icon in the top right, then select 'Account Settings'. You can change your email from there.\\n\\nLet me know if you need anything else.\\n\\nBest,\\nRiley", "escalate": false}

Example escalation:
{"reply": "Hi there,\\n\\nI am sorry to hear about this issue. I have escalated your ticket to our specialist team who will look into it and get back to you as soon as possible.\\n\\nYou can reply to this email to add any further details.\\n\\nBest,\\nRiley", "escalate": true}`;

async function searchResolutions(supabase: ReturnType<typeof getAdmin>, category: string): Promise<string> {
  const { data } = await supabase
    .from('ticket_resolutions')
    .select('issue_summary, solution, outcome')
    .eq('category', category)
    .order('useful_count', { ascending: false })
    .limit(3);

  if (!data || data.length === 0) return '';

  return '\n\nPAST RESOLUTIONS FOR SIMILAR ISSUES:\n' +
    data.map(r => `- Issue: ${r.issue_summary}\n  Solution: ${r.solution} (${r.outcome})`).join('\n');
}

export async function GET(request: NextRequest) {
  // Validate CRON secret
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  let ticketsProcessed = 0;
  let ticketsEscalated = 0;
  let ticketsResolved = 0;

  try {
    // 1. Fetch open tickets that have NOT been responded to by an agent yet
    //    and are not already assigned to a human
    const { data: openTickets, error: ticketsError } = await supabase
      .from('support_tickets')
      .select('id, user_id, subject, description, ticket_number, priority, category')
      .eq('status', 'open')
      .is('assigned_to', null)
      .order('created_at', { ascending: true })
      .limit(10);

    if (ticketsError) throw ticketsError;

    if (!openTickets || openTickets.length === 0) {
      // Health heartbeat — log even when idle so AITeamPanel shows "Healthy"
      await supabase.from('business_log').insert({
        category: 'milestone',
        title: 'Support Check',
        content: 'Riley checked the queue. No open tickets to process.',
        created_by: AGENT_ID,
      });
      return NextResponse.json({ success: true, message: 'No open tickets.' });
    }

    for (const ticket of openTickets) {
      // 2. Fetch conversation history
      const { data: messages } = await supabase
        .from('ticket_messages')
        .select('*')
        .eq('ticket_id', ticket.id)
        .order('created_at', { ascending: true });

      if (!messages || messages.length === 0) continue;

      // GUARDRAIL: Don't double-reply — skip if the last message is from an agent
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.sender_type !== 'user') continue;

      // GUARDRAIL: Don't reply if an agent has already responded to this ticket
      const hasAgentReply = messages.some(m => m.sender_type === 'agent');
      if (hasAgentReply) continue;

      // 3. Build conversation context for Claude
      const conversationContext = messages
        .map(msg => `[${msg.sender_type === 'user' ? 'User' : msg.sender_name || 'System'}]: ${msg.message}`)
        .join('\n\n');

      // Search for past resolutions to give Riley context
      const resolutionContext = await searchResolutions(supabase, ticket.category || 'general');

      // 4. Call Claude
      let aiResponse: string | null = null;
      try {
        const completion = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 500,
          system: SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: `Ticket: ${ticket.ticket_number}\nSubject: ${ticket.subject}\nCategory: ${ticket.category || 'general'}\nPriority: ${ticket.priority}\n\nConversation:\n${conversationContext}${resolutionContext}\n\nRespond with JSON.`,
          }],
        });

        const block = completion.content[0];
        if (block.type === 'text') aiResponse = block.text;
      } catch (aiErr) {
        console.error(`[${AGENT_ID}] Claude error for ${ticket.ticket_number}:`, aiErr);
        continue;
      }

      if (!aiResponse) continue;

      // 5. Parse response
      let parsed: { reply: string; escalate: boolean } | null = null;
      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        // Fallback to escalation if we can't parse
        parsed = {
          reply: "Hi there,\n\nThanks for getting in touch. I've escalated your ticket to our specialist team who will look into it and get back to you shortly.\n\nBest,\nRiley",
          escalate: true,
        };
      }

      if (!parsed) continue;

      // GUARDRAIL: Check for leaked internal terms
      const leaked = containsBlockedTerms(parsed.reply);
      if (leaked.length > 0) {
        console.warn(`[${AGENT_ID}] BLOCKED response for ${ticket.ticket_number} — leaked: ${leaked.join(', ')}`);
        // Force escalation instead of sending a leaky response
        parsed = {
          reply: "Hi there,\n\nThanks for getting in touch. I've escalated your ticket to our specialist team who will look into it and get back to you shortly.\n\nBest,\nRiley",
          escalate: true,
        };
      }

      const { reply, escalate } = parsed;

      // 6. Update ticket
      if (escalate) {
        await supabase.from('support_tickets').update({
          status: 'in_progress',
          assigned_to: 'Human Required',
          priority: ticket.priority === 'urgent' ? 'urgent' : 'high',
          updated_at: new Date().toISOString(),
        }).eq('id', ticket.id);
      } else {
        await supabase.from('support_tickets').update({
          status: 'awaiting_reply',
          first_response_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', ticket.id);
      }

      // 7. Insert Riley's message
      await supabase.from('ticket_messages').insert({
        ticket_id: ticket.id,
        sender_type: 'agent',
        sender_name: 'Riley (AI Support)',
        message: reply,
      });

      // Set first_response_at if not already set
      const { data: currentTicket } = await supabase
        .from('support_tickets')
        .select('first_response_at')
        .eq('id', ticket.id)
        .single();

      if (currentTicket && !currentTicket.first_response_at) {
        await supabase.from('support_tickets').update({
          first_response_at: new Date().toISOString(),
        }).eq('id', ticket.id);
      }

      // 8. Email the user
      let userEmail: string | null = null;
      let userName: string | null = null;
      if (ticket.user_id) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('email, full_name')
          .eq('id', ticket.user_id)
          .single();
        if (profile) {
          userEmail = profile.email;
          userName = profile.full_name;
        }
      }

      if (userEmail) {
        try {
          const ticketRef = ticket.ticket_number || ticket.id.slice(0, 8).toUpperCase();
          // Convert markdown-ish formatting to HTML
          const htmlReply = reply
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n\n/g, '</p><p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">')
            .replace(/\n/g, '<br>');

          await resend.emails.send({
            from: FROM_EMAIL,
            replyTo: TICKET_REPLY_TO,
            to: userEmail,
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
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">${htmlReply}</p>
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
        } catch (emailErr) {
          console.error(`[${AGENT_ID}] Email to user failed for ${ticket.ticket_number}:`, emailErr);
        }
      }

      // 9. If escalated, notify human support team
      if (escalate) {
        try {
          await resend.emails.send({
            from: 'Paybacker System <noreply@paybacker.co.uk>',
            to: 'support@paybacker.co.uk',
            subject: `ESCALATED: Ticket ${ticket.ticket_number} — ${ticket.subject}`,
            html: `<div style="font-family:sans-serif;padding:20px;max-width:600px;">
              <h2 style="color:#ef4444;">Ticket Escalated by Riley</h2>
              <p><strong>Ticket:</strong> ${ticket.ticket_number}</p>
              <p><strong>Subject:</strong> ${ticket.subject}</p>
              <p><strong>Category:</strong> ${ticket.category || 'general'}</p>
              <p><strong>Priority:</strong> ${ticket.priority}</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
              <h3>Conversation:</h3>
              <pre style="white-space:pre-wrap;background:#f3f4f6;padding:15px;border-radius:8px;color:#111827;font-size:13px;">${conversationContext}</pre>
              <p style="margin-top:12px;color:#374151;"><strong>Riley's reply:</strong> ${reply}</p>
              <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0;" />
              <p style="color:#6b7280;font-size:12px;">View in admin: paybacker.co.uk/dashboard/admin</p>
            </div>`,
          });
          ticketsEscalated++;
        } catch (emailErr) {
          console.error(`[${AGENT_ID}] Escalation email failed for ${ticket.ticket_number}:`, emailErr);
        }
      } else {
        ticketsResolved++;
      }

      ticketsProcessed++;
    }

    // 10. Log the run to business_log so AITeamPanel shows Riley as healthy
    await supabase.from('business_log').insert({
      category: 'action',
      title: 'Support Queue Processed',
      content: `Riley processed ${ticketsProcessed} ticket(s). Resolved: ${ticketsResolved}. Escalated to humans: ${ticketsEscalated}.`,
      created_by: AGENT_ID,
    });

    return NextResponse.json({
      success: true,
      processed: ticketsProcessed,
      resolved: ticketsResolved,
      escalated: ticketsEscalated,
    });

  } catch (err: any) {
    console.error(`[${AGENT_ID}] Fatal error:`, err);

    // Log the failure so AITeamPanel catches it
    try {
      await supabase.from('business_log').insert({
        category: 'blocker',
        title: 'Support Agent Error',
        content: `Riley encountered an error: ${err.message}`,
        created_by: AGENT_ID,
      });
    } catch {}

    return NextResponse.json({ error: 'Internal server error', details: err.message }, { status: 500 });
  }
}
