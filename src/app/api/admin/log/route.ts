// src/app/api/admin/log/route.ts
//
// Admin-only telemetry endpoint. Writes a business_log row so the founder
// can see whether admin pages are being checked + how the data looked
// when they were checked. Currently used by /dashboard/admin/analytics
// to track Refresh clicks during the day-1-of-month empty-state period.
//
// Auth: signed-in admin (ADMIN_EMAIL). Service-role client to bypass RLS.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = 'aireypaul@googlemail.com';

export async function POST(req: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.email !== ADMIN_EMAIL) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: { source?: string; event?: string; metadata?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const source = (body.source || 'admin').toString().slice(0, 60);
  const event = (body.event || 'event').toString().slice(0, 60);
  const metadataStr = (() => {
    try {
      return JSON.stringify(body.metadata ?? {}).slice(0, 1000);
    } catch {
      return '{}';
    }
  })();

  const admin = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { error } = await admin.from('business_log').insert({
    category: 'admin_telemetry',
    title: `${source} ${event}`,
    content: `${user.email} ${event} on ${source}. metadata=${metadataStr}`,
    severity: 'info',
  });

  if (error) {
    // eslint-disable-next-line no-console
    console.error('[admin/log] business_log insert failed:', error.message);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
