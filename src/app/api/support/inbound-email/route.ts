import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface InboundEmailBody {
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string;
}

// Extract email address from "Name <email@example.com>" format
function extractEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return match ? match[1] : from.trim();
}

// Extract ticket number from subject line, e.g. "Re: Some subject (TKT-ABC12345)"
function extractTicketNumber(subject: string): string | null {
  const match = subject.match(/(TKT-[0-9]+)/);
  return match ? match[1] : null;
}

export async function POST(request: NextRequest) {
  try {
    const body: InboundEmailBody = await request.json();

    // Basic validation
    if (!body.from || !body.subject || !body.text) {
      return NextResponse.json(
        { error: 'from, subject, and text are required' },
        { status: 400 }
      );
    }

    const supabase = getAdmin();
    const senderEmail = extractEmail(body.from);
    const ticketNumber = extractTicketNumber(body.subject);

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
        // Add message to existing ticket
        const { error: msgError } = await supabase
          .from('ticket_messages')
          .insert({
            ticket_id: existingTicket.id,
            sender_type: 'user',
            sender_name: senderEmail,
            message: body.text,
          });

        if (msgError) {
          console.error('Failed to add message to ticket:', msgError);
          return NextResponse.json(
            { error: 'Failed to add message', details: msgError.message },
            { status: 500 }
          );
        }

        // Update ticket timestamp and reopen if it was resolved/closed
        await supabase
          .from('support_tickets')
          .update({ updated_at: new Date().toISOString() })
          .eq('id', existingTicket.id);

        return NextResponse.json({
          action: 'message_added',
          ticket_id: existingTicket.id,
          ticket_number: ticketNumber,
        });
      }
    }

    // Create new ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .insert({
        user_id: userId,
        subject: body.subject,
        description: body.text,
        category: 'general',
        priority: 'medium',
        source: 'email',
        status: 'open',
        metadata: { from: body.from, to: body.to },
      })
      .select('*')
      .single();

    if (ticketError) {
      console.error('Failed to create ticket from email:', ticketError);
      return NextResponse.json(
        { error: 'Failed to create ticket', details: ticketError.message },
        { status: 500 }
      );
    }

    // Insert the email body as the first message
    const { error: msgError } = await supabase
      .from('ticket_messages')
      .insert({
        ticket_id: ticket.id,
        sender_type: 'user',
        sender_name: senderEmail,
        message: body.text,
      });

    if (msgError) {
      console.error('Failed to create initial message:', msgError);
    }

    return NextResponse.json(
      {
        action: 'ticket_created',
        ticket_id: ticket.id,
        ticket_number: ticket.ticket_number,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('Inbound email error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
