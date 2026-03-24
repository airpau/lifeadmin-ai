import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const maxDuration = 300;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// PUT - update agent config (still works via Supabase directly)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json();
  const supabase = getAdmin();

  const update: Record<string, any> = {};
  if (body.status) update.status = body.status;
  if (body.system_prompt) update.system_prompt = body.system_prompt;
  if (body.schedule) update.schedule = body.schedule;
  if (body.config) update.config = body.config;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
  }

  const { data: agent, error } = await supabase
    .from('ai_executives')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: 'Failed to update agent', details: error.message }, { status: 500 });
  }

  return NextResponse.json({ agent });
}

// POST - manually trigger agent run (proxies to Railway agent server)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const secret = request.headers.get('authorization');
  if (secret !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getAdmin();

  // Look up agent role from ID
  const { data: agent, error } = await supabase
    .from('ai_executives')
    .select('role, name')
    .eq('id', id)
    .single();

  if (error || !agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 });
  }

  // Proxy to Railway agent server
  const railwayUrl = process.env.RAILWAY_URL;
  if (!railwayUrl) {
    return NextResponse.json({
      error: 'RAILWAY_URL not configured. Agent execution has moved to the Railway agent server.',
    }, { status: 503 });
  }

  try {
    const res = await fetch(`${railwayUrl}/api/trigger/${agent.role}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.CRON_SECRET}`,
        'Content-Type': 'application/json',
      },
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: `Railway proxy failed: ${err.message}` }, { status: 502 });
  }
}
