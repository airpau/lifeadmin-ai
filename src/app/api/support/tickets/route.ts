import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

interface CreateTicketBody {
  subject: string;
  description: string;
  category?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  source?: 'email' | 'chatbot' | 'manual';
  user_id?: string;
  email?: string;
  metadata?: Record<string, unknown>;
}

export async function POST(request: NextRequest) {
  try {
    const body: CreateTicketBody = await request.json();

    if (!body.subject || !body.description) {
      return NextResponse.json(
        { error: 'subject and description are required' },
        { status: 400 }
      );
    }

    const supabase = getAdmin();

    // Resolve user_id from email if not provided directly
    let userId = body.user_id || null;
    if (!userId && body.email) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', body.email)
        .single();
      if (profile) {
        userId = profile.id;
      }
    }

    // Insert ticket
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .insert({
        user_id: userId,
        subject: body.subject,
        description: body.description,
        category: body.category || 'general',
        priority: body.priority || 'medium',
        source: body.source || 'manual',
        status: 'open',
        metadata: body.metadata || null,
      })
      .select('*')
      .single();

    if (ticketError) {
      console.error('Failed to create ticket:', ticketError);
      return NextResponse.json(
        { error: 'Failed to create ticket', details: ticketError.message },
        { status: 500 }
      );
    }

    // Insert the description as the first message
    const senderType = body.source === 'chatbot' ? 'system' : 'user';
    const { error: messageError } = await supabase
      .from('ticket_messages')
      .insert({
        ticket_id: ticket.id,
        sender_type: senderType,
        sender_name: body.email || 'User',
        message: body.description,
      });

    if (messageError) {
      console.error('Failed to create initial message:', messageError);
    }

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (err) {
    console.error('Create ticket error:', err);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  // Admin auth
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  const { searchParams } = new URL(request.url);

  const status = searchParams.get('status');
  const priority = searchParams.get('priority');
  const category = searchParams.get('category');
  const assignedTo = searchParams.get('assigned_to');
  const page = parseInt(searchParams.get('page') || '1', 10);
  const limit = parseInt(searchParams.get('limit') || '50', 10);
  const offset = (page - 1) * limit;

  // Build query
  let query = supabase
    .from('support_tickets')
    .select('*', { count: 'exact' });

  if (status) query = query.eq('status', status);
  if (priority) query = query.eq('priority', priority);
  if (category) query = query.eq('category', category);
  if (assignedTo) query = query.eq('assigned_to', assignedTo);

  // Order by priority (urgent first) then created_at desc
  // Supabase doesn't support CASE in order, so we do it in-app
  const { data: tickets, error, count } = await query
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error('Failed to list tickets:', error);
    return NextResponse.json(
      { error: 'Failed to list tickets', details: error.message },
      { status: 500 }
    );
  }

  // Sort by priority weight then created_at desc
  const priorityWeight: Record<string, number> = {
    urgent: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const sorted = (tickets || []).sort((a, b) => {
    const pa = priorityWeight[a.priority] ?? 2;
    const pb = priorityWeight[b.priority] ?? 2;
    if (pa !== pb) return pa - pb;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Get message counts for each ticket
  const ticketIds = sorted.map((t) => t.id);
  let messageCounts: Record<string, number> = {};

  if (ticketIds.length > 0) {
    const { data: counts } = await supabase
      .from('ticket_messages')
      .select('ticket_id')
      .in('ticket_id', ticketIds);

    if (counts) {
      for (const row of counts) {
        messageCounts[row.ticket_id] = (messageCounts[row.ticket_id] || 0) + 1;
      }
    }
  }

  const ticketsWithCounts = sorted.map((t) => ({
    ...t,
    message_count: messageCounts[t.id] || 0,
  }));

  return NextResponse.json({
    tickets: ticketsWithCounts,
    pagination: {
      page,
      limit,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / limit),
    },
  });
}
