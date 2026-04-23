/**
 * PATCH  /api/spaces/[id]  — rename or change connection membership
 * DELETE /api/spaces/[id]  — delete a Space (cannot delete the default)
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface PatchBody {
  name?: string;
  emoji?: string | null;
  color?: string | null;
  connection_ids?: string[];
  sort_order?: number;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = (await request.json()) as PatchBody;

  const update: Record<string, unknown> = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (!name) return NextResponse.json({ error: 'name cannot be empty' }, { status: 400 });
    if (name.length > 40) return NextResponse.json({ error: 'name too long' }, { status: 400 });
    update.name = name;
  }
  if (body.emoji !== undefined) update.emoji = body.emoji;
  if (body.color !== undefined) update.color = body.color;
  if (body.sort_order !== undefined) update.sort_order = body.sort_order;

  if (body.connection_ids !== undefined) {
    const connectionIds = Array.from(new Set(body.connection_ids));
    if (connectionIds.length > 0) {
      const { data: ownedConns } = await supabase
        .from('bank_connections')
        .select('id')
        .in('id', connectionIds)
        .eq('user_id', user.id);
      const ownedSet = new Set((ownedConns ?? []).map((c) => c.id));
      for (const cid of connectionIds) {
        if (!ownedSet.has(cid)) {
          return NextResponse.json({ error: 'Invalid connection_id' }, { status: 400 });
        }
      }
    }
    update.connection_ids = connectionIds;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'nothing to update' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('account_spaces')
    .update(update)
    .eq('id', id)
    .eq('user_id', user.id)
    .select('*')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ space: data });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Protect the default Space — deleting it leaves the user with no
  // fallback view. The UI doesn't expose a delete button for it anyway
  // but we double-check here.
  const { data: target } = await supabase
    .from('account_spaces')
    .select('is_default')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (!target) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (target.is_default) {
    return NextResponse.json({ error: 'Cannot delete the default Space' }, { status: 400 });
  }

  const { error } = await supabase
    .from('account_spaces')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
