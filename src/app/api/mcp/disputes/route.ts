// src/app/api/mcp/disputes/route.ts
// MCP: list a user's open complaint / dispute cases.
// Read-only. Auth via Bearer token.

import { NextRequest } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { authenticateMcp, isAuthSuccess, mcpJson } from '@/lib/mcp-auth';

export const runtime = 'nodejs';

function admin() {
  return createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

export async function GET(req: NextRequest) {
  const auth = await authenticateMcp(req);
  if (!isAuthSuccess(auth)) return auth;

  const sp = req.nextUrl.searchParams;
  const includeClosed = sp.get('include_closed') === 'true';
  const limit = Math.min(Number(sp.get('limit') ?? 50) || 50, 200);

  // Column names verified against the live schema (2026-08-16). The
  // disputed value lives in `disputed_amount`, not `amount` — selecting
  // `amount` here 500'd every call to this endpoint.
  let q = admin()
    .from('disputes')
    .select(
      'id, provider_name, issue_type, issue_summary, desired_outcome, status, disputed_amount, currency, money_recovered, outcome, created_at, updated_at',
    )
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!includeClosed) {
    // Terminal statuses as actually used in the table: resolved_won,
    // resolved_partial, resolved_lost, closed, dismissed, withdrawn.
    // The old filter listed a bare "resolved" that no row ever carries,
    // so closed cases were being returned as open.
    q = q.not(
      'status',
      'in',
      '(resolved,resolved_won,resolved_partial,resolved_lost,closed,dismissed,withdrawn)',
    );
  }

  const { data, error } = await q;
  if (error) return mcpJson({ error: error.message }, { status: 500 });

  const rows = data ?? [];
  const totalDisputedGbp = rows.reduce(
    (s, r) => s + Number(r.disputed_amount ?? 0),
    0,
  );

  return mcpJson({
    count: rows.length,
    total_disputed_gbp: parseFloat(totalDisputedGbp.toFixed(2)),
    filters: { include_closed: includeClosed },
    disputes: rows,
  });
}
