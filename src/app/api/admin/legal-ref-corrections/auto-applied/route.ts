/**
 * GET /api/admin/legal-ref-corrections/auto-applied
 *
 * Lists corrections that the η three-gate verifier auto-applied within
 * the last N days (default 7). Founder-gated. Used by the admin
 * legal-refs page to render the "Auto-applied" panel.
 *
 * Returns an empty list (with `table_missing: true`) if ε's table
 * isn't deployed yet.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json(
      { error: auth.reason ?? 'Unauthorized' },
      { status: auth.status },
    );
  }

  const url = new URL(request.url);
  const days = Math.max(
    1,
    Math.min(90, Number(url.searchParams.get('days') ?? '7') || 7),
  );
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const supabase = getAdmin();
  try {
    const { data, error } = await supabase
      .from('legal_ref_corrections')
      .select('*')
      .eq('status', 'auto_applied')
      .gte('applied_at', since)
      .order('applied_at', { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ table_missing: true, rows: [] });
    }
    return NextResponse.json({ table_missing: false, rows: data ?? [] });
  } catch {
    return NextResponse.json({ table_missing: true, rows: [] });
  }
}
