// src/app/api/mcp/email-findings/route.ts
// MCP: what the inbox scanner found (email_scan_findings): bills,
// renewals, price increases, refund opportunities and so on.
// Read-only. Auth via Bearer pbk_ token, Pro gated.
// Query: type (finding_type), status (new|actioned|dismissed|pending),
// since (YYYY-MM-DD on created_at), limit (default 50, max 200).

import { NextRequest } from 'next/server';
import { createClient as createAdmin } from '@supabase/supabase-js';
import { authenticateMcp, isAuthSuccess, mcpJson } from '@/lib/mcp-auth';
import { validIsoDate } from '@/lib/documents/classify';

export const runtime = 'nodejs';

const STATUSES = new Set(['new', 'actioned', 'dismissed', 'pending']);

function admin() {
  return createAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
}

export async function GET(req: NextRequest) {
  const auth = await authenticateMcp(req);
  if (!isAuthSuccess(auth)) return auth;

  const sp = req.nextUrl.searchParams;
  const type = (sp.get('type') || '').replace(/[^a-z_]/g, '').slice(0, 40);
  const status = sp.get('status') || '';
  const since = validIsoDate(sp.get('since'));
  const limitRaw = Number(sp.get('limit') || 50);
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 50;

  let q = admin()
    .from('email_scan_findings')
    .select(
      'id, finding_type, provider, title, description, amount, due_date, contract_end_date, previous_amount, price_change_date, payment_frequency, confidence, urgency, status, source, created_at',
    )
    .eq('user_id', auth.userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (type) q = q.eq('finding_type', type);
  if (STATUSES.has(status)) q = q.eq('status', status);
  else q = q.neq('status', 'dismissed');
  if (since) q = q.gte('created_at', `${since}T00:00:00Z`);

  const { data, error } = await q;
  if (error) return mcpJson({ error: error.message }, { status: 500 });
  return mcpJson({ count: data?.length ?? 0, findings: data ?? [] });
}
