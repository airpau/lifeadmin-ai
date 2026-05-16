/**
 * POST /api/disputes/[id]/share-log
 *
 * Logs a share event to dispute_shares. Fire-and-forget from the
 * ShareMyWinModal when the user clicks a platform button.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const VALID_PLATFORMS = ['twitter', 'whatsapp', 'linkedin', 'facebook', 'copy'] as const;
type Platform = typeof VALID_PLATFORMS[number];

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { platform?: string };
  try { body = await request.json(); } catch { body = {}; }

  const platform = body.platform as Platform | undefined;
  if (!platform || !VALID_PLATFORMS.includes(platform)) {
    return NextResponse.json(
      { error: `Invalid platform. Must be one of: ${VALID_PLATFORMS.join(', ')}` },
      { status: 400 },
    );
  }

  const { data: dispute } = await supabase
    .from('disputes')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!dispute) return NextResponse.json({ error: 'Dispute not found' }, { status: 404 });

  const { error } = await supabase.from('dispute_shares').insert({
    dispute_id: id,
    user_id: user.id,
    platform,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
