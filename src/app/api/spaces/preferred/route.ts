/**
 * POST /api/spaces/preferred
 *
 * Body: { space_id: string | null }
 *
 * Pins a Space as the user's preferred landing view (or clears it
 * with null). The Money Hub falls back through: URL param →
 * localStorage → preferred_space_id → built-in default.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as { space_id?: string | null };
  const spaceId = body.space_id ?? null;

  if (spaceId !== null) {
    // Verify ownership so no one can pin another user's Space.
    const { data: owned } = await supabase
      .from('account_spaces')
      .select('id')
      .eq('id', spaceId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!owned) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { error } = await supabase
    .from('profiles')
    .update({ preferred_space_id: spaceId })
    .eq('id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true, preferred_space_id: spaceId });
}
