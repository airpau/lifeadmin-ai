/**
 * GET  /api/spaces         — list the current user's Spaces
 * POST /api/spaces         — create a new Space (Pro-gated)
 *
 * Space CRUD for individual rows lives at /api/spaces/[id].
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { ensureDefaultSpace, listSpaces } from '@/lib/spaces';
import { getEffectiveTier, PLAN_LIMITS } from '@/lib/plan-limits';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Safety net in case the user pre-dates the backfill migration.
  await ensureDefaultSpace(supabase, user.id);
  const spaces = await listSpaces(supabase, user.id);

  // Report the connections the user actually has so the settings UI
  // can render a checkbox per connection when editing a Space.
  const { data: connections } = await supabase
    .from('bank_connections')
    .select('id, bank_name, provider, status, account_display_names')
    .eq('user_id', user.id)
    .order('connected_at', { ascending: true });

  return NextResponse.json({
    spaces,
    connections: connections ?? [],
  });
}

interface CreateBody {
  name?: string;
  emoji?: string | null;
  color?: string | null;
  connection_ids?: string[];
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const tier = await getEffectiveTier(user.id);
  const maxSpaces = PLAN_LIMITS[tier].maxSpaces;
  if (maxSpaces !== null) {
    const existing = await listSpaces(supabase, user.id);
    if (existing.length >= maxSpaces) {
      return NextResponse.json(
        {
          error: 'Upgrade required',
          reason: 'max_spaces_reached',
          tier,
          max: maxSpaces,
          message: 'Custom Spaces are a Pro feature. Upgrade to group business, personal and joint accounts separately.',
        },
        { status: 403 },
      );
    }
  }

  const body = (await request.json()) as CreateBody;
  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'name is required' }, { status: 400 });
  if (name.length > 40) {
    return NextResponse.json({ error: 'name must be 40 characters or fewer' }, { status: 400 });
  }

  // Validate connection_ids belong to this user so a malicious caller
  // can't reference another user's connection IDs (which would show
  // nothing anyway thanks to RLS, but it's a clean guard).
  const connectionIds = Array.from(new Set(body.connection_ids ?? []));
  if (connectionIds.length > 0) {
    const { data: ownedConns } = await supabase
      .from('bank_connections')
      .select('id')
      .in('id', connectionIds)
      .eq('user_id', user.id);
    const ownedSet = new Set((ownedConns ?? []).map((c) => c.id));
    for (const id of connectionIds) {
      if (!ownedSet.has(id)) {
        return NextResponse.json({ error: 'Invalid connection_id' }, { status: 400 });
      }
    }
  }

  const { data, error } = await supabase
    .from('account_spaces')
    .insert({
      user_id: user.id,
      name,
      emoji: body.emoji ?? null,
      color: body.color ?? null,
      is_default: false,
      connection_ids: connectionIds,
    })
    .select('*')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ space: data });
}
