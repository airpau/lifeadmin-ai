import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

export const runtime = 'nodejs';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface AddMessageBody {
  sender_type: 'user' | 'agent' | 'system';
  sender_name: string;
  message: string;
  notify_user?: boolean;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: ticketId } = await params;
  const body: AddMessageBody = await request.json();

  if (!body.sender_type || !body.message) {
    return NextResponse.json(
      { error: 'sender_type and message are required' },
      { status: 400 }
    );
  }

  const supabase = getAdmin();

  // Fetch the ticket
  const { data: ticket, error: ticketError } = await supabase
    .from('support_tickets')
    .select('*')
    .eq('id', ticketId)
    .single();

  if (ticketError || !ticket) {
    return NextResponse.json(
      { error: 'Ticket not found' },
      { status: 404 }
    );
  }

  // Insert message
  const { data: messageData, error: messageError } = await supabase
    .from('ticket_messages')
    .insert({
      ticket_id: ticketId,
      sender_type: body.sender_type,
      sender_name: body.sender_name || body.sender_type,
      message: body.message,
    })
    .select('*')
    .single();

  if (messageError) {
    console.error('Failed to add message:', messageError);
    return NextResponse.json(
      { error: 'Failed to add message', details: messageError.message },
      { status: 500 }
    );
  }

  // Update ticket status/timestamps
  const ticketUpdate: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  // Set first_response_at on first agent response
  if (body.sender_type === 'agent' && !ticket.first_response_at) {
    ticketUpdate.first_response_at = new Date().toISOString();
  }

  // Auto-change open tickets to in_progress
  if (ticket.status === 'open' && body.sender_type === 'agent') {
    ticketUpdate.status = 'in_progress';
  }

  await supabase
    .from('support_tickets')
    .update(ticketUpdate)
    .eq('id', ticketId);

  // Send email notification to user if requested
  if (body.notify_user && ticket.user_id) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('email, full_name')
        .eq('id', ticket.user_id)
        .single();

      if (profile?.email) {
        const ticketRef = ticket.ticket_number || ticketId.slice(0, 8).toUpperCase();
        await resend.emails.send({
          from: FROM_EMAIL,
          replyTo: REPLY_TO,
          to: profile.email,
          subject: `Re: ${ticket.subject} (${ticketRef})`,
          html: `
            <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #0f172a; color: #e2e8f0; padding: 40px; border-radius: 16px;">
              <div style="border-bottom: 2px solid #f59e0b; padding-bottom: 16px; margin-bottom: 24px;">
                <h1 style="color: #f59e0b; font-size: 22px; margin: 0;">Paybacker Support</h1>
                <p style="color: #64748b; font-size: 14px; margin: 4px 0 0;">Ticket ${ticketRef}</p>
              </div>
              <p style="color: #94a3b8; font-size: 14px; margin-bottom: 8px;">
                Hi${profile.full_name ? ` ${profile.full_name}` : ''},
              </p>
              <p style="color: #94a3b8; font-size: 14px; margin-bottom: 8px;">
                We've replied to your support request: <strong style="color: #e2e8f0;">${ticket.subject}</strong>
              </p>
              <div style="background: #1e293b; border-left: 3px solid #f59e0b; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="color: #e2e8f0; font-size: 14px; line-height: 1.6; margin: 0; white-space: pre-wrap;">${body.message}</p>
              </div>
              <p style="color: #94a3b8; font-size: 14px;">
                Reply to this email to continue the conversation.
              </p>
              <hr style="border: none; border-top: 1px solid #1e293b; margin: 24px 0;" />
              <p style="color: #475569; font-size: 12px; margin: 0;">
                Paybacker Ltd &middot; support@paybacker.co.uk
              </p>
            </div>
          `,
        });
      }
    } catch (emailErr) {
      console.error('Failed to send notification email:', emailErr);
      // Don't fail the request if email fails
    }
  }

  return NextResponse.json({ message: messageData }, { status: 201 });
}
