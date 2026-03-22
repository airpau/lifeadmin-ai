import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getAdmin();

  // Fetch ticket and messages in parallel
  const [ticketResult, messagesResult] = await Promise.all([
    supabase.from('support_tickets').select('*').eq('id', id).single(),
    supabase
      .from('ticket_messages')
      .select('*')
      .eq('ticket_id', id)
      .order('created_at', { ascending: true }),
  ]);

  if (ticketResult.error) {
    return NextResponse.json(
      { error: 'Ticket not found', details: ticketResult.error.message },
      { status: 404 }
    );
  }

  return NextResponse.json({
    ticket: ticketResult.data,
    messages: messagesResult.data || [],
  });
}

interface UpdateTicketBody {
  status?: 'open' | 'in_progress' | 'waiting_on_user' | 'resolved' | 'closed';
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  category?: string;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body: UpdateTicketBody = await request.json();
  const supabase = getAdmin();

  // Build update payload
  const update: Record<string, unknown> = {};

  if (body.status) update.status = body.status;
  if (body.priority) update.priority = body.priority;
  if (body.assigned_to !== undefined) update.assigned_to = body.assigned_to;
  if (body.category) update.category = body.category;

  // Set resolved_at when status changes to resolved or closed
  if (body.status === 'resolved' || body.status === 'closed') {
    update.resolved_at = new Date().toISOString();
  }

  update.updated_at = new Date().toISOString();

  if (Object.keys(update).length <= 1) {
    return NextResponse.json(
      { error: 'No fields to update' },
      { status: 400 }
    );
  }

  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json(
      { error: 'Failed to update ticket', details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ticket });
}
