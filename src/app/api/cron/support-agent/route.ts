import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';
import Anthropic from '@anthropic-ai/sdk';

/**
 * Riley — Paperclip Support Agent
 *
 * Runs every 15 minutes via Vercel Cron.
 * Flow:
 *   1. Find open tickets with no agent response
 *   2. Send a "we've received your ticket" confirmation email (if not already sent)
 *   3. Analyse the issue with Claude — attempt to resolve with guidance
 *   4. Only escalate when Riley genuinely cannot help (code fix, refund, account deletion, data access)
 *   5. On escalation: Telegram alert + structured email to support@paybacker.co.uk
 *
 * Logs all activity to business_log with created_by: 'riley-support-agent'
 */

const AGENT_ID = 'riley-support-agent';
const TICKET_REPLY_TO = 'support@paybacker.co.uk';

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

// ─────────────────────────────────────────────
// System prompt — Riley is instructed to HELP FIRST, only escalate when truly stuck
// ─────────────────────────────────────────────
const SYSTEM_PROMPT = `You are Riley, the Paybacker AI Support Agent. You help users resolve their problems with the Paybacker platform.

About Paybacker: An AI-powered savings platform for UK consumers that helps people dispute unfair bills, track subscriptions, scan bank accounts and email inboxes, and take control of their finances.

YOUR MISSION: Help the user. Try to resolve every issue yourself first. Only escalate when you genuinely cannot action the fix.

GUIDELINES:
- Be friendly, empathetic, and concise
- Use British English and £ symbols
- NEVER use em dashes, use commas or colons instead
- Address the user's specific issue directly
- Provide clear, actionable step-by-step guidance
- Explain workarounds when available
- For data or sync issues, suggest the user tries: refreshing, reconnecting their bank, clearing cache, or waiting for the next sync cycle
- For feature questions, explain how the feature works with specific navigation steps

WHEN TO RESOLVE (escalate: false):
- User has a question about how to use a feature
- User needs navigation help ("where do I find X?")
- User reports a display issue that could be fixed by refreshing or reconnecting
- User asks about pricing, plans, or what's included
- User is confused about their data and you can explain what they're seeing
- User reports something that has a known workaround you can explain
- The issue is cosmetic or informational

WHEN TO ESCALATE (escalate: true) — ONLY if you genuinely cannot help:
- The issue requires a DATABASE FIX (e.g. duplicate data that can't be resolved by the user)
- The issue requires a CODE CHANGE (e.g. a bug in calculation logic)
- The user needs a REFUND or billing adjustment
- The user wants to DELETE their account
- The issue involves ACCESSING another user's data
- The user has already tried your suggestions and they did not work (second response)
- The issue involves LEGAL or regulatory matters
- There is a SECURITY concern (data breach, unauthorized access)

STRICT RULES:
- NEVER reveal technical details about how Paybacker is built (tech stack, APIs, database, AI models)
- NEVER mention Supabase, Yapily, Claude, Anthropic, Stripe, Vercel, Railway, or any internal systems
- NEVER discuss pricing strategies, business plans, revenue models, or internal metrics
- NEVER share information about other users
- Only discuss what users can see and use in the product

RESPONSE FORMAT:
Respond with valid JSON containing these keys:
1. "reply": Your message to the user. Be warm and helpful. Try to resolve the issue.
2. "escalate": Boolean. true ONLY if a human genuinely needs to intervene. false if you have helped or can help.
3. "fix_type": (only if escalate is true) One of: "code_fix", "database_fix", "refund", "account_deletion", "security", "data_access", "legal", "other"
4. "urgency": (only if escalate is true) One of: "critical", "high", "medium", "low"
5. "escalation_summary": (only if escalate is true) A one-line technical summary for the dev team explaining exactly what needs fixing.

Example resolution:
{"reply": "Hi there,\\n\\nI can see you're concerned about duplicate transactions. This can sometimes happen when your bank reports a pending transaction and then the settled version. Here's what to try:\\n\\n1. Go to Money Hub on your dashboard\\n2. Click 'Sync Now' to pull the latest data from your bank\\n3. Check if the duplicates resolve after the sync completes\\n\\nIf the issue persists after syncing, let me know and I'll escalate to our technical team.\\n\\nBest,\\nRiley", "escalate": false}

Example escalation:
{"reply": "Hi there,\\n\\nThank you for reporting this. I can see this is a data issue that requires our technical team to investigate and fix directly. I have flagged this as urgent and our team will be looking into it right away.\\n\\nHere is what will happen next:\\n1. Our technical team will audit the affected transactions\\n2. Any duplicates will be removed and totals recalculated\\n3. We will email you once the fix is applied\\n\\nYou can reply to this email to add any further details.\\n\\nBest,\\nRiley", "escalate": true, "fix_type": "database_fix", "urgency": "high", "escalation_summary": "Duplicate transactions between user's two NatWest accounts causing inflated income/spending totals - needs dedup audit"}`;

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

// ─────────────────────────────────────────────
// Telegram alert to founder on escalation
// ─────────────────────────────────────────────
async function alertFounder(ticketRef: string, subject: string, fixType: string, urgency: string, summary: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_FOUNDER_CHAT_ID;
  if (!token || !chatId) return;

  const urgencyEmoji: Record<string, string> = {
    critical: '🔴',
    high: '🟠',
    medium: '🟡',
    low: '🟢',
  };
  const emoji = urgencyEmoji[urgency] || '⚪';

  const message = `${emoji} *SUPPORT ESCALATION*\n\n` +
    `*Ticket:* ${ticketRef}\n` +
    `*Subject:* ${subject}\n` +
    `*Urgency:* ${urgency.toUpperCase()}\n` +
    `*Fix type:* ${fixType.replace(/_/g, ' ')}\n\n` +
    `*What needs doing:*\n${summary}\n\n` +
    `_Riley could not resolve this automatically._`;

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' }),
    });
    if (!res.ok) {
      // Retry without markdown
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message }),
      });
    }
  } catch (err) {
    console.error(`[${AGENT_ID}] Telegram alert failed:`, err);
  }
}

// ─────────────────────────────────────────────
// Send ticket confirmation email to user (before Riley responds)
// ─────────────────────────────────────────────
async function sendConfirmationEmail(
  userEmail: string,
  userName: string,
  ticketRef: string,
  subject: string,
  priority: string,
) {
  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: TICKET_REPLY_TO,
      to: userEmail,
      subject: `We've received your support request (${ticketRef})`,
      html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:#0f172a;padding:20px 32px;">
      <table width="100%"><tr>
        <td><span style="font-size:20px;font-weight:800;color:#ffffff;">Pay<span style="color:#34d399;">backer</span></span></td>
        <td align="right"><span style="color:#94a3b8;font-size:12px;">${ticketRef}</span></td>
      </tr></table>
    </div>
    <div style="padding:32px;color:#334155;font-size:14px;line-height:1.7;">
      <p style="margin:0 0 16px;">Hi ${userName},</p>
      <p style="margin:0 0 16px;">Thank you for contacting Paybacker Support. We have received your request and it has been logged in our system.</p>
      <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 6px;font-weight:600;color:#0f172a;">Ticket Reference: #${ticketRef}</p>
        <p style="margin:0 0 4px;color:#475569;"><strong>Subject:</strong> ${subject}</p>
        <p style="margin:0;color:#475569;"><strong>Priority:</strong> ${priority}</p>
      </div>
      <p style="margin:0 0 12px;">Our support team will review your request and respond shortly. You will receive a follow-up email with our response.</p>
      <p style="margin:0 0 12px;color:#64748b;font-size:13px;">You can reply to this email at any time to add further details to your ticket.</p>
      <p style="margin:0;color:#64748b;">Best regards,<br/>Paybacker Support</p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;">
      <a href="https://paybacker.co.uk" style="color:#34d399;text-decoration:none;">paybacker.co.uk</a>
    </div>
  </div>
</body></html>`,
    });
    return true;
  } catch (err) {
    console.error(`[${AGENT_ID}] Confirmation email failed for ${ticketRef}:`, err);
    return false;
  }
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  let ticketsProcessed = 0;
  let ticketsEscalated = 0;
  let ticketsResolved = 0;

  try {
    // 1. Fetch open tickets with no agent assignment
    const { data: openTickets, error: ticketsError } = await supabase
      .from('support_tickets')
      .select('id, user_id, subject, description, ticket_number, priority, category')
      .eq('status', 'open')
      .is('assigned_to', null)
      .order('created_at', { ascending: true })
      .limit(10);

    if (ticketsError) throw ticketsError;

    if (!openTickets || openTickets.length === 0) {
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

      // GUARDRAIL: Don't double-reply — skip if last message is from an agent
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.sender_type !== 'user' && lastMessage.sender_type !== 'system') continue;

      // GUARDRAIL: Don't reply if an agent has already responded
      const hasAgentReply = messages.some(m => m.sender_type === 'agent');
      if (hasAgentReply) continue;

      // 3. Get user info
      const ticketRef = ticket.ticket_number || ticket.id.slice(0, 8).toUpperCase();
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

      // 4. STEP 1: Send confirmation email FIRST (before Riley responds)
      //    Only if we haven't already sent a first_response_at
      const { data: currentTicket } = await supabase
        .from('support_tickets')
        .select('first_response_at, metadata')
        .eq('id', ticket.id)
        .single();

      const confirmationSent = currentTicket?.metadata?.confirmation_sent === true;
      if (!confirmationSent && userEmail) {
        await sendConfirmationEmail(
          userEmail,
          userName?.split(' ')[0] || 'there',
          ticketRef,
          ticket.subject,
          ticket.priority,
        );
        // Mark confirmation as sent in metadata
        const existingMeta = (currentTicket?.metadata as Record<string, unknown>) || {};
        await supabase.from('support_tickets').update({
          metadata: { ...existingMeta, confirmation_sent: true },
        }).eq('id', ticket.id);
      }

      // 5. Build conversation context for Claude
      const conversationContext = messages
        .map(msg => `[${msg.sender_type === 'user' ? 'User' : msg.sender_name || 'System'}]: ${msg.message}`)
        .join('\n\n');

      const resolutionContext = await searchResolutions(supabase, ticket.category || 'general');

      // 6. Call Claude
      let aiResponse: string | null = null;
      try {
        const completion = await anthropic.messages.create({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 800,
          system: SYSTEM_PROMPT,
          messages: [{
            role: 'user',
            content: `Ticket: ${ticketRef}\nSubject: ${ticket.subject}\nCategory: ${ticket.category || 'general'}\nPriority: ${ticket.priority}\n\nConversation:\n${conversationContext}${resolutionContext}\n\nRespond with JSON. Remember: try to help first. Only escalate if you genuinely cannot fix this yourself.`,
          }],
        });

        const block = completion.content[0];
        if (block.type === 'text') aiResponse = block.text;
      } catch (aiErr) {
        console.error(`[${AGENT_ID}] Claude error for ${ticketRef}:`, aiErr);
        continue;
      }

      if (!aiResponse) continue;

      // 7. Parse response
      let parsed: {
        reply: string;
        escalate: boolean;
        fix_type?: string;
        urgency?: string;
        escalation_summary?: string;
      } | null = null;

      try {
        const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
        if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
      } catch {
        parsed = {
          reply: "Hi there,\n\nThank you for getting in touch. I've logged your request and our team will review it shortly.\n\nBest,\nRiley",
          escalate: true,
          fix_type: 'other',
          urgency: 'medium',
          escalation_summary: 'Could not parse AI response — needs manual review',
        };
      }

      if (!parsed) continue;

      // GUARDRAIL: Check for leaked internal terms
      const leaked = containsBlockedTerms(parsed.reply);
      if (leaked.length > 0) {
        console.warn(`[${AGENT_ID}] BLOCKED response for ${ticketRef} — leaked: ${leaked.join(', ')}`);
        parsed = {
          reply: "Hi there,\n\nThank you for getting in touch. I've logged your request and our technical team will review it shortly.\n\nBest,\nRiley",
          escalate: true,
          fix_type: 'other',
          urgency: 'medium',
          escalation_summary: 'Response contained blocked terms — needs manual review',
        };
      }

      const { reply, escalate, fix_type, urgency, escalation_summary } = parsed;

      // 8. Update ticket status
      if (escalate) {
        const escalationUrgency = urgency || 'medium';
        await supabase.from('support_tickets').update({
          status: 'in_progress',
          assigned_to: 'Human Required',
          priority: escalationUrgency === 'critical' ? 'urgent' : ticket.priority,
          first_response_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {
            ...(currentTicket?.metadata as Record<string, unknown> || {}),
            confirmation_sent: true,
            escalated_by: 'riley',
            fix_type: fix_type || 'other',
            urgency: escalationUrgency,
            escalation_summary: escalation_summary || 'Escalated by Riley',
          },
        }).eq('id', ticket.id);
      } else {
        await supabase.from('support_tickets').update({
          status: 'awaiting_reply',
          first_response_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }).eq('id', ticket.id);
      }

      // 9. Insert Riley's message
      await supabase.from('ticket_messages').insert({
        ticket_id: ticket.id,
        sender_type: 'agent',
        sender_name: 'Riley (AI Support)',
        message: reply,
      });

      // 10. Email Riley's response to the user
      if (userEmail) {
        try {
          const htmlReply = reply
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n\n/g, '</p><p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">')
            .replace(/\n(\d+)\./g, '<br/>$1.')
            .replace(/\n/g, '<br>');

          await resend.emails.send({
            from: FROM_EMAIL,
            replyTo: TICKET_REPLY_TO,
            to: userEmail,
            subject: escalate
              ? `Update on your support request (${ticketRef}) — Escalated to our team`
              : `Re: Your support request (${ticketRef})`,
            html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:#0f172a;padding:20px 32px;">
      <table width="100%"><tr>
        <td><span style="font-size:20px;font-weight:800;color:#ffffff;">Pay<span style="color:#34d399;">backer</span></span></td>
        <td align="right"><span style="color:#94a3b8;font-size:12px;">${ticketRef}</span></td>
      </tr></table>
    </div>
    <div style="padding:32px;color:#334155;font-size:14px;line-height:1.7;">
      <p style="color:#334155;font-size:14px;line-height:1.7;margin:12px 0;">${htmlReply}</p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;">
      Simply reply to this email if you need further help &middot; <a href="https://paybacker.co.uk" style="color:#34d399;text-decoration:none;">paybacker.co.uk</a>
    </div>
  </div>
</body></html>`,
          });
        } catch (emailErr) {
          console.error(`[${AGENT_ID}] Response email to user failed for ${ticketRef}:`, emailErr);
        }
      }

      // 11. If escalated: structured email to support@ AND Telegram alert to founder
      if (escalate) {
        const escalationUrgency = urgency || 'medium';
        const escalationFixType = fix_type || 'other';
        const escalationSummary = escalation_summary || 'Escalated by Riley — needs manual review';

        // Structured escalation email
        try {
          const urgencyColor: Record<string, string> = {
            critical: '#dc2626',
            high: '#ea580c',
            medium: '#d97706',
            low: '#65a30d',
          };
          const color = urgencyColor[escalationUrgency] || '#d97706';

          await resend.emails.send({
            from: 'Paybacker System <noreply@paybacker.co.uk>',
            to: 'support@paybacker.co.uk',
            subject: `${escalationUrgency === 'critical' ? '🔴 URGENT: ' : escalationUrgency === 'high' ? '🟠 HIGH: ' : ''}Escalated — ${ticketRef}: ${ticket.subject}`,
            html: `<div style="font-family:sans-serif;padding:20px;max-width:600px;">
              <div style="background:${color};color:white;padding:12px 20px;border-radius:8px 8px 0 0;font-weight:bold;font-size:16px;">
                ${escalationUrgency.toUpperCase()} — ${escalationFixType.replace(/_/g, ' ').toUpperCase()}
              </div>
              <div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px;">
                <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
                  <tr><td style="padding:6px 0;font-weight:bold;width:120px;">Ticket:</td><td>${ticketRef}</td></tr>
                  <tr><td style="padding:6px 0;font-weight:bold;">From:</td><td>${userEmail || 'Unknown'} (${userName || 'User'})</td></tr>
                  <tr><td style="padding:6px 0;font-weight:bold;">Subject:</td><td>${ticket.subject}</td></tr>
                  <tr><td style="padding:6px 0;font-weight:bold;">Category:</td><td>${ticket.category || 'general'}</td></tr>
                  <tr><td style="padding:6px 0;font-weight:bold;">Fix Type:</td><td style="font-weight:bold;color:${color};">${escalationFixType.replace(/_/g, ' ')}</td></tr>
                </table>
                <div style="background:#fef3c7;border:1px solid #fbbf24;border-radius:8px;padding:12px;margin:12px 0;">
                  <strong>What needs doing:</strong><br/>
                  ${escalationSummary}
                </div>
                <h3 style="margin:16px 0 8px;">Conversation:</h3>
                <pre style="white-space:pre-wrap;background:#f3f4f6;padding:15px;border-radius:8px;color:#111827;font-size:13px;">${conversationContext}</pre>
                <h3 style="margin:16px 0 8px;">Riley's response to user:</h3>
                <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:12px;font-size:13px;">${reply}</div>
                <p style="color:#6b7280;font-size:12px;margin-top:16px;">View in admin: paybacker.co.uk/dashboard/admin</p>
              </div>
            </div>`,
          });
          ticketsEscalated++;
        } catch (emailErr) {
          console.error(`[${AGENT_ID}] Escalation email failed for ${ticketRef}:`, emailErr);
        }

        // Telegram alert to founder
        await alertFounder(
          ticketRef,
          ticket.subject,
          escalationFixType,
          escalationUrgency,
          escalationSummary,
        );
      } else {
        ticketsResolved++;
      }

      ticketsProcessed++;
    }

    // 12. Log the run to business_log
    await supabase.from('business_log').insert({
      category: 'action',
      title: 'Support Queue Processed',
      content: `Riley processed ${ticketsProcessed} ticket(s). Resolved: ${ticketsResolved}. Escalated: ${ticketsEscalated}.`,
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
