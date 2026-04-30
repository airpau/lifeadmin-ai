/**
 * GET /api/admin/legal-ref-corrections — list proposed citation corrections
 *
 * Founder-gated (NEXT_PUBLIC_ADMIN_EMAILS). Returns pending corrections
 * by default; pass ?status=approved|rejected|duplicate|all for others.
 *
 * Part of PR ε: human-in-loop gate for canonical citation changes.
 * Nothing in legal_references gets mutated until a founder approves a
 * row in legal_ref_corrections.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function requireAdmin(): Promise<{ ok: true; email: string } | { ok: false; res: NextResponse }> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) {
    return { ok: false, res: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }
  const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || 'aireypaul@googlemail.com')
    .split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!adminEmails.includes(user.email.toLowerCase())) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, email: user.email };
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';

  const supabase = getAdmin();
  let query = supabase
    .from('legal_ref_corrections')
    .select('*, legal_references!inner(id, law_name, source_url, category, subcategory, verification_status)')
    .order('proposed_at', { ascending: false })
    .limit(200);

  if (status !== 'all') {
    query = query.eq('status', status);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ corrections: data ?? [] });
}
