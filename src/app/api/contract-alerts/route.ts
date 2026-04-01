import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

/**
 * GET /api/contract-alerts — fetch in-app contract renewal alerts for the current user
 * PATCH /api/contract-alerts — update alert status (dismiss, click, action)
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch pending in-app alerts for this user
  const { data, error } = await supabase
    .from('contract_renewal_alerts')
    .select('*')
    .eq('user_id', user.id)
    .eq('alert_channel', 'in_app')
    .in('status', ['pending', 'sent'])
    .order('contract_end_date', { ascending: true });

  if (error) {
    console.error('Error fetching contract alerts:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data || []);
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { id, status } = body;

  if (!id || !status) {
    return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });
  }

  const validStatuses = ['dismissed', 'clicked', 'actioned'];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  const updateFields: Record<string, any> = { status };
  if (status === 'dismissed') updateFields.dismissed_at = new Date().toISOString();
  if (status === 'clicked') updateFields.clicked_at = new Date().toISOString();
  if (status === 'actioned') updateFields.actioned_at = new Date().toISOString();

  const { data, error } = await supabase
    .from('contract_renewal_alerts')
    .update(updateFields)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single();

  if (error) {
    console.error('Error updating contract alert:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
