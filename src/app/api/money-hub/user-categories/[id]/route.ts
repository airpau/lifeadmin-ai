import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdmin } from '@supabase/supabase-js';

export const runtime = 'nodejs';

function admin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

/**
 * PATCH /api/money-hub/user-categories/[id]   rename / re-emoji
 * DELETE /api/money-hub/user-categories/[id]  remove (transactions fall back to parent canonical)
 *
 * Both endpoints reverse-sync `bank_transactions.user_subcategory` so the
 * user's transactions don't end up pointing at a stale label.
 */

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const newName = typeof body.name === 'string' ? body.name.trim() : null;
  const newEmoji = typeof body.emoji === 'string' ? body.emoji : null;

  if (newName !== null && (newName.length === 0 || newName.length > 50)) {
    return NextResponse.json({ error: 'name must be 1–50 chars' }, { status: 400 });
  }

  // Read current row to find the old label and parent
  const { data: current, error: selErr } = await supabase
    .from('user_category_custom')
    .select('id, parent_category, name, emoji')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  if (selErr || !current) {
    return NextResponse.json({ error: 'not found' }, { status: 404 });
  }

  const patch: Record<string, unknown> = {};
  if (newName !== null) patch.name = newName;
  if (newEmoji !== null) patch.emoji = newEmoji;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ ok: true, unchanged: true });
  }

  const { error: upErr } = await supabase
    .from('user_category_custom')
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id);

  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  // Reverse-sync existing transactions if the label changed.
  if (newName !== null && newName !== current.name) {
    try {
      await admin()
        .from('bank_transactions')
        .update({ user_subcategory: newName })
        .eq('user_id', user.id)
        .eq('user_category', current.parent_category)
        .ilike('user_subcategory', current.name);
    } catch {
      // best-effort — column already exists per migration 20260420100000
    }
  }

  return NextResponse.json({ ok: true, id, name: newName ?? current.name, emoji: newEmoji ?? current.emoji });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;

  // Read the row so we can clear the bank_transactions.user_subcategory pointer.
  const { data: current } = await supabase
    .from('user_category_custom')
    .select('parent_category, name')
    .eq('id', id)
    .eq('user_id', user.id)
    .single();

  const { error } = await supabase
    .from('user_category_custom')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Clear stale label off transactions. The canonical parent stays — only the
  // user's free-text subcategory tag is cleared.
  if (current) {
    try {
      await admin()
        .from('bank_transactions')
        .update({ user_subcategory: null })
        .eq('user_id', user.id)
        .eq('user_category', current.parent_category)
        .ilike('user_subcategory', current.name);
    } catch {
      // best-effort
    }
  }

  return NextResponse.json({ ok: true });
}
