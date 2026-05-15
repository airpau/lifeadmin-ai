import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { logAlertInteraction, responseTimeFrom } from '@/lib/alert-interactions';

/**
 * GET /api/price-alerts -- list user's active price increase alerts
 * PATCH /api/price-alerts -- update alert status (dismiss or action)
 */
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data, error } = await supabase
    .from('price_increase_alerts')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ alerts: data || [] });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const { id, status } = body;

  if (!id || !status) {
    return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });
  }

  if (!['dismissed', 'actioned', 'active'].includes(status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
  }

  // Capture the alert's created_at before we update so we can store
  // response_time_seconds on the interaction row.
  const { data: alert } = await supabase
    .from('price_increase_alerts')
    .select('created_at, merchant_normalized')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();

  const { error } = await supabase
    .from('price_increase_alerts')
    .update({ status })
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (status !== 'active') {
    void logAlertInteraction({
      userId: user.id,
      alertType: 'price_increase',
      alertKey: id,
      action: status === 'dismissed' ? 'dismissed' : 'acted',
      responseTimeSeconds: responseTimeFrom(alert?.created_at),
      surface: 'web',
      metadata: alert?.merchant_normalized ? { merchant: alert.merchant_normalized } : null,
    });
  }

  return NextResponse.json({ success: true });
}
