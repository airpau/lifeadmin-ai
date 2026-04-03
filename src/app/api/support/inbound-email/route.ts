import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { notifyAgents } from '@/lib/agent-notify';

export const runtime = 'nodejs';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from.trim();
}

function extractTicketNumber(subject: string): string | null {
  const match = subject.match(/(TKT-[0-9]+)/);
  return match ? match[1] : null;
}

// Fetch full email content from Resend API (webhooks only include metadata)
async function fetchEmailContent(emailId: string): Promise<{ text: string; html: string } | null> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !emailId) return null;

  try {
    const res = await fetch(`https://api.resend.com/emails/${emailId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { text: data.text || data.html || '', html: data.html || '' };
  } catch {
    return null;
  }
}

async function processEmail(
  from: string,
  to: string,
  subject: string,
  text: string,
  metadata?: Record<string, any>
) {
  const supabase = getAdmin();
  const senderEmail = extractEmail(from);
  const ticketNumber = extractTicketNumber(subject);

  // Look up user by sender email
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', senderEmail)
    .single();

  const userId = profile?.id || null;

  // If subject contains a ticket number, add message to existing ticket
  if (ticketNumber) {
    const { data: existingTicket } = await supabase
      .from('support_tickets')
      .select('id')
      .eq('ticket_number', ticketNumber)
      .single();

    if (existingTicket) {
      const { error: msgError } = await supabase
        .from('ticket_messages')
        .insert({
          ticket_id: existingTicket.id,
          sender_type: 'user',
          sender_name: senderEmail,
          message: text,
        });

      if (msgError) {
        console.error('Failed to add message to ticket:', msgError);
        return { action: 'error', error: msgError.message };
      }

      // Check ticket status
      const { data: ticket } = await supabase
        .from('support_tickets')
        .select('status')
        .eq('id', existingTicket.id)
        .single();

      const update: Record<string, any> = { updated_at: new Date().toISOString() };

      // Detect "thank you" / closure replies on resolved tickets
      const lowerText = text.toLowerCase().replace(/[^a-z\s]/g, '');
      const isClosureReply = /^(thanks|thank you|thats? (sorted|fixed|great|perfect|done)|cheers|all (good|sorted|done)|no worries|appreciated|brilliant|lovely|sorted|perfect|great|wonderful)\b/.test(lowerText.trim());

      if ((ticket?.status === 'resolved' || ticket?.status === 'awaiting_reply') && isClosureReply) {
        // Auto-close: user confirmed the issue is resolved
        update.status = 'closed';
        update.resolved_at = update.resolved_at || new Date().toISOString();
        await supabase.from('support_tickets').update(update).eq('id', existingTicket.id);
        return { action: 'ticket_closed', ticket_id: existingTicket.id, ticket_number: ticketNumber, reason: 'User confirmed resolution' };
      }

      if (ticket?.status === 'resolved' || ticket?.status === 'closed') {
        // Non-closure reply on resolved ticket: reopen
        update.status = 'open';
        update.resolved_at = null;
      } else if (ticket?.status === 'awaiting_reply' || ticket?.status === 'in_progress') {
        // User replied to an agent response: set back to open so agents pick it up
        update.status = 'open';
      }
      await supabase.from('support_tickets').update(update).eq('id', existingTicket.id);

      // Notify support agents about the reply so Riley picks it up quickly
      notifyAgents('ticket_reply', `Reply on ${ticketNumber}`, `User replied to ${ticketNumber}: ${text.substring(0, 200)}`, 'email').catch(() => {});

      return { action: 'message_added', ticket_id: existingTicket.id, ticket_number: ticketNumber };
    }
  }

  // Create new ticket
  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .insert({
      user_id: userId,
      subject: subject || 'Support request',
      description: text || 'No content',
      category: 'general',
      priority: 'medium',
      source: 'email',
      status: 'open',
      metadata: { from, to, ...metadata },
    })
    .select('*')
    .single();

  if (ticketError) {
    console.error('Failed to create ticket from email:', ticketError);
    return { action: 'error', error: ticketError.message };
  }

  // Insert the email body as the first message
  await supabase.from('ticket_messages').insert({
    ticket_id: ticket.id,
    sender_type: 'user',
    sender_name: senderEmail,
    message: text,
  });

  // Notify support agents about new ticket
  notifyAgents('new_ticket', `New ticket: ${subject}`, `${ticket.ticket_number}: ${subject} from ${senderEmail}. ${text.substring(0, 200)}`, 'email').catch(() => {});

  return { action: 'ticket_created', ticket_id: ticket.id, ticket_number: ticket.ticket_number };
}

export async function POST(request: NextRequest) {
  // Verify webhook authenticity via Resend webhook signing secret (svix)
  // or fall back to a shared WEBHOOK_SECRET bearer token check.
  const svixId = request.headers.get('svix-id');
  const svixTimestamp = request.headers.get('svix-timestamp');
  const svixSignature = request.headers.get('svix-signature');

  if (svixId && svixTimestamp && svixSignature) {
    // Resend sends webhooks signed via Svix — verify if we have the signing secret
    const signingSecret = process.env.RESEND_WEBHOOK_SECRET;
    if (signingSecret) {
      try {
        const { Webhook } = await import('svix');
        const wh = new Webhook(signingSecret);
        const bodyText = await request.clone().text();
        wh.verify(bodyText, {
          'svix-id': svixId,
          'svix-timestamp': svixTimestamp,
          'svix-signature': svixSignature,
        });
      } catch (err) {
        console.error('[inbound-email] Svix signature verification failed:', err);
        return NextResponse.json({ error: 'Invalid webhook signature' }, { status: 401 });
      }
    }
    // If RESEND_WEBHOOK_SECRET is not set, allow through but log a warning
    if (!signingSecret) {
      console.warn('[inbound-email] RESEND_WEBHOOK_SECRET not set — skipping signature verification');
    }
  } else {
    // No Svix headers — require a shared secret bearer token
    const authHeader = request.headers.get('authorization');
    const webhookSecret = process.env.WEBHOOK_SECRET || process.env.CRON_SECRET;
    if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
      console.error('[inbound-email] Unauthorized: missing Svix headers and invalid bearer token');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const body = await request.json();

    // Handle Resend webhook format (email.received event)
    if (body.type === 'email.received' && body.data) {
      const { email_id, from: fromField, to, subject } = body.data;

      // Extract sender email from Resend format
      const senderEmail = typeof fromField === 'string'
        ? fromField
        : fromField?.email || fromField?.[0]?.email || 'unknown';

      const recipientEmail = Array.isArray(to) ? to[0] : to;

      // Get email content: try webhook payload first, then fetch from Resend API
      let emailText = '';
      if (body.data.text) {
        emailText = body.data.text;
      } else if (body.data.html) {
        emailText = body.data.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
      } else {
        // Fetch from Resend API as fallback
        const content = await fetchEmailContent(email_id);
        if (content?.text) {
          emailText = content.text;
        } else if (content?.html) {
          emailText = content.html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        }
      }
      if (!emailText) {
        emailText = `Email received from ${senderEmail} (no content available)`;
      }

      const result = await processEmail(
        senderEmail,
        recipientEmail,
        subject || 'Support request',
        emailText,
        { resend_email_id: email_id }
      );

      console.log(`[inbound-email] Resend webhook: ${result.action} from ${senderEmail}`);
      return NextResponse.json(result, { status: result.action === 'error' ? 500 : 201 });
    }

    // Handle direct POST format (manual/testing)
    if (body.from && body.subject) {
      if (!body.text && !body.html) {
        return NextResponse.json({ error: 'text or html content required' }, { status: 400 });
      }

      const text = body.text || body.html?.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim() || '';
      const result = await processEmail(body.from, body.to || '', body.subject, text);

      return NextResponse.json(result, { status: result.action === 'error' ? 500 : 201 });
    }

    return NextResponse.json({ error: 'Unrecognised payload format' }, { status: 400 });
  } catch (err) {
    console.error('Inbound email error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
