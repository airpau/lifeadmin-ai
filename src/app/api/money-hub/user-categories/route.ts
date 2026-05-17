import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { isValidCategory } from '@/lib/categories';

/**
 * Tier-2 user-defined subcategories.
 *
 * Subcategories always roll up to a Tier-1 canonical parent so that
 * spend analysis and budget RPCs keep aggregating at a stable level —
 * the user just gets a personal label for their own organisation.
 *
 * GET  /api/money-hub/user-categories            list all
 * GET  /api/money-hub/user-categories?parent=X   list under parent X
 * POST /api/money-hub/user-categories            create { parent, name, emoji? }
 */

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parent = request.nextUrl.searchParams.get('parent');

  let query = supabase
    .from('user_category_custom')
    .select('id, parent_category, name, emoji, created_at')
    .eq('user_id', user.id);

  if (parent) {
    if (!isValidCategory(parent)) {
      return NextResponse.json({ error: 'Invalid parent category' }, { status: 400 });
    }
    query = query.eq('parent_category', parent);
  }

  const { data, error } = await query.order('parent_category').order('name');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ subcategories: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { parent, name, emoji } = body as { parent?: string; name?: string; emoji?: string };

  if (!parent || !isValidCategory(parent)) {
    return NextResponse.json({ error: 'parent must be a canonical category id' }, { status: 400 });
  }
  // 'transfers' is a system category (internal money movement, never shown in
  // breakdowns) so it can't have personal labels. 'income' is also a system
  // category for spending-side analysis, but users genuinely need to label
  // income streams (e.g. "Director Salary", "Client Payment", "Dividends")
  // — especially on business accounts — so we allow it as a parent.
  if (parent === 'transfers') {
    return NextResponse.json(
      { error: 'transfers is a system category — pick another parent' },
      { status: 400 },
    );
  }
  const cleaned = (name ?? '').trim();
  if (!cleaned || cleaned.length > 50) {
    return NextResponse.json({ error: 'name required (1–50 chars)' }, { status: 400 });
  }

  // Use the upsert RPC so the call is idempotent — repeated "create rent" calls
  // from the agent return the existing row instead of erroring.
  const { data, error } = await supabase.rpc('upsert_user_subcategory', {
    p_user_id: user.id,
    p_parent: parent,
    p_name: cleaned,
    p_emoji: emoji ?? null,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ id: data, parent_category: parent, name: cleaned, emoji: emoji ?? null }, { status: 201 });
}
