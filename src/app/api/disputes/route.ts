import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// GET /api/disputes — list all disputes for the user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: disputes, error } = await supabase
    .from('disputes')
    .select(`
      *,
      correspondence(id, entry_type, title, summary, entry_date, created_at),
      tasks(id, status, created_at)
    `)
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Failed to fetch disputes:', error);
    return NextResponse.json({ error: 'Failed to fetch disputes' }, { status: 500 });
  }

  // Add letter count and last activity date
  const enriched = (disputes || []).map((d: any) => ({
    ...d,
    letter_count: d.correspondence?.filter((c: any) => c.entry_type === 'ai_letter').length || 0,
    message_count: d.correspondence?.length || 0,
    last_activity: d.correspondence?.length > 0
      ? d.correspondence.sort((a: any, b: any) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime())[0].entry_date
      : d.created_at,
  }));

  return NextResponse.json(enriched);
}

// POST /api/disputes — create a new dispute
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  if (!body.provider_name || !body.issue_type || !body.issue_summary) {
    return NextResponse.json({ error: 'Missing required fields: provider_name, issue_type, issue_summary' }, { status: 400 });
  }

  const { data: dispute, error } = await supabase
    .from('disputes')
    .insert({
      user_id: user.id,
      provider_name: body.provider_name,
      provider_type: body.provider_type || null,
      account_number: body.account_number || null,
      issue_type: body.issue_type,
      issue_summary: body.issue_summary,
      desired_outcome: body.desired_outcome || null,
      disputed_amount: body.disputed_amount ? parseFloat(body.disputed_amount) : null,
      status: 'open',
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to create dispute:', error);
    return NextResponse.json({ error: 'Failed to create dispute' }, { status: 500 });
  }

  return NextResponse.json(dispute, { status: 201 });
}
