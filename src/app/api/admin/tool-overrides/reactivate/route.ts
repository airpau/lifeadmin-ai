/**
 * POST /api/admin/tool-overrides/reactivate
 *
 * P5-2 — founder-driven early reactivation of a downranked tool.
 * Sets reactivated_at on the most recent active override row for the
 * given tool_name. The runtime filter ignores reactivated rows so the
 * tool returns to the Pocket Agent's toolbox immediately.
 *
 * Body: { tool_name: string }
 * Auth: Bearer ${CRON_SECRET} OR founder cookie.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createClient as createServerClient } from '@/lib/supabase/server';
import { ADMIN_EMAIL } from '@/lib/admin-auth';

export const runtime = 'nodejs';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function POST(request: NextRequest) {
  // Authorise via cron secret OR founder cookie.
  const auth = request.headers.get('authorization') ?? '';
  let userId: string | null = null;
  if (auth !== `Bearer ${process.env.CRON_SECRET ?? ''}`) {
    const sb = await createServerClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user || user.email !== ADMIN_EMAIL) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    userId = user.id;
  }

  let body: { tool_name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  if (!body.tool_name) {
    return NextResponse.json({ error: 'tool_name required' }, { status: 400 });
  }

  const sb = admin();
  const now = new Date().toISOString();

  const { data: active } = await sb
    .from('tool_registry_overrides')
    .select('id')
    .eq('tool_name', body.tool_name)
    .is('reactivated_at', null)
    .gt('expires_at', now)
    .order('suppressed_at', { ascending: false })
    .limit(1);

  if (!active || active.length === 0) {
    return NextResponse.json({ ok: true, reactivated: 0 });
  }

  const { error } = await sb
    .from('tool_registry_overrides')
    .update({
      reactivated_at: now,
      reactivated_by: userId,
    })
    .eq('id', active[0].id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, reactivated: 1, id: active[0].id });
}
