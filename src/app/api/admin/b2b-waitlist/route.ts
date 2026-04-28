/**
 * GET  /api/admin/b2b-waitlist — list signups (founder-only)
 * PATCH /api/admin/b2b-waitlist — flip a signup's status / add notes
 *
 * Auth: requires the caller's email to be in NEXT_PUBLIC_ADMIN_EMAILS
 * (same gate the rest of /dashboard/admin uses). This is a private
 * surface — never exposed to non-admin users.
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
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (!adminEmails.includes(user.email.toLowerCase())) {
    return { ok: false, res: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { ok: true, email: user.email };
}

export async function GET() {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  const supabase = getAdmin();
  const { data, error } = await supabase
    .from('b2b_waitlist')
    .select('id, name, work_email, company, role, expected_volume, use_case, status, notes, utm_source, utm_medium, utm_campaign, referrer, created_at, reviewed_at, intended_tier, stripe_session_id')
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ signups: data ?? [] });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.res;

  let body: any;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { id, status, notes } = body ?? {};
  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: '`id` is required' }, { status: 400 });
  }
  const validStatuses = ['new', 'qualified', 'contacted', 'rejected', 'converted'];
  if (status && !validStatuses.includes(status)) {
    return NextResponse.json({ error: `\`status\` must be one of ${validStatuses.join(', ')}` }, { status: 400 });
  }

  const update: Record<string, unknown> = { reviewed_at: new Date().toISOString() };
  if (status) update.status = status;
  if (typeof notes === 'string') update.notes = notes;

  const supabase = getAdmin();
  const { error } = await supabase
    .from('b2b_waitlist')
    .update(update)
    .eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
