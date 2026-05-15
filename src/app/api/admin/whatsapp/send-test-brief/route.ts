/**
 * POST /api/admin/whatsapp/send-test-brief
 *
 * Founder-gated "Send test morning brief now" trigger. Replicates the
 * per-user dispatch portion of /api/cron/telegram-morning-summary for ONE
 * user without waiting for 7:30am. Used by the button on
 * /dashboard/admin/whatsapp.
 *
 * Body:  { user_id?: string }
 *   - omitted: defaults to the calling admin's `auth.userId` (founder)
 *   - explicit: send the test to a specific user (must have an active
 *     WhatsApp session and be Pro-tier)
 *
 * Response:
 *   {
 *     ok: boolean,
 *     status: 'sent' | 'skipped' | 'error',
 *     reason?: string,
 *     channel?: 'in_window' | 'template',
 *     providerMessageId?: string,
 *   }
 *
 * Auth: `authorizeAdminOrCron` (cookie OR Bearer CRON_SECRET).
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { sendMorningBriefToUser } from '@/lib/whatsapp/morning-brief';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin env not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  let body: { user_id?: string } = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const userId = body.user_id?.trim() || auth.userId;
  if (!userId) {
    return NextResponse.json(
      {
        ok: false,
        status: 'error',
        reason: 'No user_id provided and no caller user_id (cron-style auth without explicit user_id is not supported here)',
      },
      { status: 400 },
    );
  }

  let sb;
  try {
    sb = adminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, status: 'error', reason: msg }, { status: 500 });
  }

  const result = await sendMorningBriefToUser(sb, userId);
  return NextResponse.json(result);
}
