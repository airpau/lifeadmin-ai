import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const ADMIN_EMAIL = 'aireypaul@googlemail.com';

export async function PATCH(request: NextRequest) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Verify authenticated admin user
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.replace('Bearer ', '');

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { post_id, scheduled_for } = body as { post_id: string; scheduled_for?: string };

  if (!post_id) {
    return NextResponse.json({ error: 'Missing post_id' }, { status: 400 });
  }

  const updates: Record<string, unknown> = { status: 'approved' };
  if (scheduled_for) {
    updates.scheduled_for = scheduled_for;
  }

  const { error } = await supabase
    .from('social_posts')
    .update(updates)
    .eq('id', post_id)
    .eq('status', 'draft');

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
