import { createClient } from '@/lib/supabase/server';
import { NextResponse, NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { provider, category, deal_id, awin_mid } = await request.json();

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    // Read awc cookie for Awin click attribution
    const awc = request.cookies.get('awc')?.value || '';

    await supabase.from('deal_clicks').insert({
      user_id: user.id,
      provider,
      category,
      deal_id,
      awin_mid,
    });

    // Award loyalty points for exploring deals
    import('@/lib/loyalty').then(({ awardPoints }) => {
      awardPoints(user.id, 'deal_clicked', { provider, category });
    }).catch(() => {});

    return NextResponse.json({ ok: true, awc });
  } catch {
    return NextResponse.json({ ok: true, awc: '' });
  }
}
