/**
 * GET /api/v1/portal-export?token=...&email=...&type=usage|audit
 *
 * Returns a CSV download of the customer's data. Token-gated, single-
 * use enforcement is relaxed to false (read-only path). Limited to 5,000
 * rows per export.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';
import { authPortal } from '@/lib/b2b/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function csvEscape(v: unknown): string {
  if (v == null) return '';
  let s = String(v);
  // Neutralise spreadsheet formula injection: any cell whose first
  // char is =, +, -, @, tab, or CR could be parsed as a formula by
  // Excel / Numbers / Sheets. Prefix a single quote to defang it.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const type = url.searchParams.get('type') ?? 'usage';
  const auth = await authPortal(request, null, { token: url.searchParams.get('token'), email: url.searchParams.get('email') });
  if (!auth) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  const email = auth.email;
  const supabase = getAdmin();

  if (type === 'usage') {
    const { data: keys } = await supabase
      .from('b2b_api_keys')
      .select('id')
      .eq('owner_email', email);
    const ids = (keys ?? []).map((k: any) => k.id);
    if (ids.length === 0) return new NextResponse('', { status: 200, headers: csvHeaders('paybacker-usage.csv') });
    const { data } = await supabase
      .from('b2b_api_usage')
      .select('created_at, key_id, endpoint, status_code, latency_ms, scenario_kind, error_code')
      .in('key_id', ids)
      .order('created_at', { ascending: false })
      .limit(5000);
    const lines = [
      'created_at,key_id,endpoint,status_code,latency_ms,scenario_kind,error_code',
      ...(data ?? []).map((r: any) => [r.created_at, r.key_id, r.endpoint, r.status_code, r.latency_ms ?? '', r.scenario_kind ?? '', r.error_code ?? ''].map(csvEscape).join(',')),
    ];
    return new NextResponse(lines.join('\n'), { status: 200, headers: csvHeaders('paybacker-usage.csv') });
  }

  if (type === 'audit') {
    const { data } = await supabase
      .from('b2b_audit_log')
      .select('created_at, action, actor, key_id, ip_address, user_agent, metadata')
      .eq('email', email)
      .order('created_at', { ascending: false })
      .limit(5000);
    const lines = [
      'created_at,action,actor,key_id,ip_address,user_agent,metadata',
      ...(data ?? []).map((r: any) => [r.created_at, r.action, r.actor, r.key_id ?? '', r.ip_address ?? '', r.user_agent ?? '', JSON.stringify(r.metadata ?? {})].map(csvEscape).join(',')),
    ];
    return new NextResponse(lines.join('\n'), { status: 200, headers: csvHeaders('paybacker-audit.csv') });
  }

  return NextResponse.json({ error: 'type must be usage or audit' }, { status: 400 });
}

function csvHeaders(filename: string): HeadersInit {
  return {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  };
}
