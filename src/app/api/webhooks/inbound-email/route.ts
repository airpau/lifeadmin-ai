import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

/**
 * Inbound Email Webhook — support@paybacker.co.uk
 *
 * Receives `email.received` events from Resend when someone emails support@paybacker.co.uk.
 * - If the email subject contains a ticket ref (TKT-XXXX), adds a message to that ticket
 * - Otherwise creates a new support ticket
 * - Riley picks it up on the next cron run (every 15 min)
 *
 * Setup required in Resend dashboard:
 * 1. Add MX records for paybacker.co.uk (or use a subdomain)
 * 2. Create webhook at https://paybacker.co.uk/api/webhooks/inbound-email
 * 3. Subscribe to `email.received` event
 */

export const runtime = 'nodejs';
export const maxDuration = 30;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Extract ticket reference from subject (e.g. "Re: Your support request (TKT-0013)")
function extractTicketRef(subject: string): string | null {
  const match = subject.match(/TKT-\d{4,}/i);
  return match ? match[0].toUpperCase() : null;
}

// Strip HTML and extract plain text
function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Extract sender email from "Name <email@example.com>" format
function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from.trim();
}

function extractName(from: string): string {
  const match = from.match(/^([^<]+)/);
  return match ? match[1].trim().replace(/"/g, '') : extractEmail(from);
}

export async function POST(request: NextRequest) {
  try {
    const event = await request.json();

    // Only process email.received events
    if (event.type !== 'email.received') {
      return NextResponse.json({ ok: true, skipped: true });
    }

    const { email_id, from, to, subject } = event.data;
    const senderEmail = extractEmail(from);
    const senderName = extractName(from);

    console.log(`[inbound-email] Received from ${senderEmail}: ${subject}`);

    // Fetch the full email content from Resend API
    const resend = new Resend(process.env.RESEND_API_KEY!);
    let emailBody = '';
    try {
      const { data: emailContent } = await resend.emails.receiving.get(email_id);
      emailBody = emailContent?.text || stripHtml(emailContent?.html || '') || 'No email body';
    } catch (err) {
      console.error('[inbound-email] Failed to fetch email content:', err);
      emailBody = `Email from ${senderEmail} — subject: ${subject} (body could not be retrieved)`;
    }

    const supabase = getAdmin();

    // Check if this is a reply to an existing ticket
    const ticketRef = extractTicketRef(subject || '');

    if (ticketRef) {
      // --- REPLY TO EXISTING TICKET ---
      const { data: ticket } = await supabase
        .from('support_tickets')
        .select('id, status, ticket_number')
        .eq('ticket_number', ticketRef)
        .single();

      if (ticket) {
        // Add message to existing ticket
        await supabase.from('ticket_messages').insert({
          ticket_id: ticket.id,
          sender_type: 'user',
          sender_name: `${senderName} (${senderEmail})`,
          message: emailBody,
        });

        // Re-open the ticket if it was awaiting reply or resolved
        if (['awaiting_reply', 'resolved', 'closed'].includes(ticket.status)) {
          await supabase.from('support_tickets').update({
            status: 'open',
            assigned_to: null, // Riley will pick it up again
            updated_at: new Date().toISOString(),
          }).eq('id', ticket.id);
        }

        console.log(`[inbound-email] Reply added to ${ticketRef} from ${senderEmail}`);
        return NextResponse.json({ ok: true, action: 'reply_added', ticket: ticketRef });
      }
    }

    // --- NEW TICKET ---
    // Try to find the user by email
    let userId: string | null = null;
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', senderEmail)
      .single();
    if (profile) userId = profile.id;

    // Auto-categorise based on subject keywords
    const subjectLower = (subject || '').toLowerCase();
    const bodyLower = emailBody.toLowerCase();
    const allText = subjectLower + ' ' + bodyLower;

    const category = allText.includes('bank') || allText.includes('sync') || allText.includes('connection') ? 'technical'
      : allText.includes('bill') || allText.includes('payment') || allText.includes('charge') || allText.includes('refund') ? 'billing'
      : allText.includes('bug') || allText.includes('error') || allText.includes('not working') || allText.includes('broken') ? 'technical'
      : allText.includes('cancel') || allText.includes('subscription') ? 'billing'
      : allText.includes('feature') || allText.includes('suggestion') ? 'feature'
      : 'general';

    // Create the ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .insert({
        user_id: userId,
        subject: subject || 'Support request via email',
        description: emailBody,
        category,
        priority: 'medium',
        source: 'email',
        status: 'open',
        metadata: {
          sender_email: senderEmail,
          sender_name: senderName,
          resend_email_id: email_id,
          received_to: to,
        },
      })
      .select('id, ticket_number')
      .single();

    if (ticketError || !ticket) {
      console.error('[inbound-email] Failed to create ticket:', ticketError);
      return NextResponse.json({ error: 'Failed to create ticket' }, { status: 500 });
    }

    // Insert the email as the first message
    await supabase.from('ticket_messages').insert({
      ticket_id: ticket.id,
      sender_type: 'user',
      sender_name: `${senderName} (${senderEmail})`,
      message: emailBody,
    });

    // Send confirmation email back to sender
    try {
      const ref = ticket.ticket_number;
      await resend.emails.send({
        from: process.env.RESEND_FROM_EMAIL || 'Paybacker <noreply@paybacker.co.uk>',
        replyTo: 'support@paybacker.co.uk',
        to: senderEmail,
        subject: `Re: ${subject || 'Your support request'} (${ref})`,
        html: `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1e293b;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;">
    <div style="background:#0f172a;padding:20px 32px;">
      <table width="100%"><tr>
        <td><span style="font-size:20px;font-weight:800;color:#ffffff;">Pay<span style="color:#f59e0b;">backer</span></span></td>
        <td align="right"><span style="color:#94a3b8;font-size:12px;">${ref}</span></td>
      </tr></table>
    </div>
    <div style="padding:32px;color:#334155;font-size:14px;line-height:1.7;">
      <p style="margin:0 0 16px;">Hi ${senderName.split(' ')[0] || 'there'},</p>
      <p style="margin:0 0 16px;">Thank you for contacting Paybacker Support. We have received your email and created a support ticket.</p>
      <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:16px 0;">
        <p style="margin:0 0 6px;font-weight:600;color:#0f172a;">Ticket Reference: #${ref}</p>
        <p style="margin:0;color:#475569;"><strong>Subject:</strong> ${subject || 'Your support request'}</p>
      </div>
      <p style="margin:0 0 12px;">Our support team will review your request and respond to this email thread shortly.</p>
      <p style="margin:0;color:#64748b;">Best regards,<br/>Paybacker Support</p>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:11px;">
      <a href="https://paybacker.co.uk" style="color:#f59e0b;text-decoration:none;">paybacker.co.uk</a>
    </div>
  </div>
</body></html>`,
      });
    } catch (emailErr) {
      console.error('[inbound-email] Failed to send confirmation:', emailErr);
    }

    console.log(`[inbound-email] New ticket ${ticket.ticket_number} created from ${senderEmail}`);
    return NextResponse.json({ ok: true, action: 'ticket_created', ticket: ticket.ticket_number });

  } catch (err: any) {
    console.error('[inbound-email] Webhook error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
