import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Default widget layout
export const DEFAULT_WIDGETS = [
  { widget: 'stats_cards', position: 0, size: 'full', visible: true },
  { widget: 'action_items', position: 1, size: 'full', visible: true },
  { widget: 'money_recovery_score', position: 2, size: 'half', visible: true },
  { widget: 'better_deals', position: 3, size: 'half', visible: true },
  { widget: 'spending_chart', position: 4, size: 'half', visible: false },
  { widget: 'income_chart', position: 5, size: 'half', visible: false },
  { widget: 'subscriptions_list', position: 6, size: 'half', visible: false },
  { widget: 'recent_alerts', position: 7, size: 'half', visible: false },
  { widget: 'savings_goals', position: 8, size: 'half', visible: false },
  { widget: 'budget_overview', position: 9, size: 'half', visible: false },
  { widget: 'contracts_expiring', position: 10, size: 'half', visible: false },
];

// GET /api/dashboard-layout — get active layout
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Get active layout
  const { data: layout } = await supabase
    .from('dashboard_layouts')
    .select('*')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (layout) return NextResponse.json(layout);

  // Return default
  return NextResponse.json({ id: null, name: 'Default', layout: DEFAULT_WIDGETS, is_default: true });
}

// POST /api/dashboard-layout — save or update layout
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();

  if (body.action === 'reset') {
    // Deactivate all custom layouts
    await supabase.from('dashboard_layouts').update({ is_active: false }).eq('user_id', user.id);
    return NextResponse.json({ layout: DEFAULT_WIDGETS, name: 'Default' });
  }

  if (body.action === 'update_widget') {
    // Get current active layout or create from default
    let { data: current } = await supabase
      .from('dashboard_layouts')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .maybeSingle();

    const widgets = current?.layout || [...DEFAULT_WIDGETS];

    // Apply the change
    const { widgetId, changes } = body;
    const idx = widgets.findIndex((w: any) => w.widget === widgetId);
    if (idx >= 0) {
      widgets[idx] = { ...widgets[idx], ...changes };
    }

    if (current) {
      await supabase.from('dashboard_layouts').update({ layout: widgets, updated_at: new Date().toISOString() }).eq('id', current.id);
    } else {
      await supabase.from('dashboard_layouts').insert({
        user_id: user.id, name: 'Custom', is_active: true, layout: widgets,
      });
    }

    return NextResponse.json({ layout: widgets });
  }

  if (body.action === 'save') {
    // Deactivate others first
    await supabase.from('dashboard_layouts').update({ is_active: false }).eq('user_id', user.id);

    const { data: saved } = await supabase.from('dashboard_layouts').insert({
      user_id: user.id,
      name: body.name || 'Custom',
      is_active: true,
      layout: body.layout,
    }).select().single();

    return NextResponse.json(saved);
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
