/**
 * GET /api/admin/whatsapp/state
 *
 * Founder-gated read for the WhatsApp dispatch-visibility panel on
 * /dashboard/admin/whatsapp. Returns three datasets in one round-trip:
 *
 *   - sessions:         every active whatsapp_sessions row (joined to
 *                       profiles for display_name / email) so the
 *                       founder can see who's reachable + how stale the
 *                       24h customer-service window is per user.
 *   - dispatchOutcomes: business_log rows under categories
 *                       'whatsapp_dispatch_ok' / 'whatsapp_dispatch_failed'
 *                       (last 50). Surfaces silent regressions: if
 *                       there are zero rows in the last N days, the
 *                       dispatcher isn't even being called.
 *   - templateSends:    whatsapp_message_log outbound templates (last 50).
 *                       Confirms what *actually landed* with provider IDs.
 *
 * Auth: `authorizeAdminOrCron` — founder cookie OR Bearer CRON_SECRET.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase admin env not configured');
  return createClient(url, key, { auth: { persistSession: false } });
}

export interface SessionRow {
  user_id: string;
  whatsapp_phone: string;
  display_name: string | null;
  email: string | null;
  opted_in_at: string | null;
  last_message_at: string | null;
  is_active: boolean;
}

export interface DispatchOutcomeRow {
  id: string;
  created_at: string;
  category: 'whatsapp_dispatch_ok' | 'whatsapp_dispatch_failed';
  title: string | null;
  user_id: string | null;
  alert_type: string | null;
  template_name: string | null;
  error: string | null;
  provider_message_id: string | null;
}

export interface TemplateSendRow {
  id: string;
  created_at: string;
  whatsapp_phone: string | null;
  template_name: string | null;
  provider_message_id: string | null;
  user_id: string | null;
}

interface BusinessLogRow {
  id: string;
  created_at: string;
  category: string;
  title: string | null;
  content: string | null;
}

interface MessageLogRow {
  id: string;
  created_at: string;
  whatsapp_phone: string | null;
  template_name: string | null;
  provider_message_id: string | null;
  user_id: string | null;
}

interface SessionsRaw {
  user_id: string;
  whatsapp_phone: string;
  opted_in_at: string | null;
  last_message_at: string | null;
  is_active: boolean;
}

interface ProfileRaw {
  id: string;
  full_name: string | null;
  email: string | null;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }

  let sb;
  try {
    sb = adminClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }

  // Fetch all three datasets in parallel.
  const [sessionsRes, businessRes, messagesRes] = await Promise.all([
    sb
      .from('whatsapp_sessions')
      .select('user_id, whatsapp_phone, opted_in_at, last_message_at, is_active')
      .eq('is_active', true)
      .is('opted_out_at', null)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .limit(50),
    sb
      .from('business_log')
      .select('id, created_at, category, title, content')
      .in('category', ['whatsapp_dispatch_ok', 'whatsapp_dispatch_failed'])
      .order('created_at', { ascending: false })
      .limit(50),
    sb
      .from('whatsapp_message_log')
      .select('id, created_at, whatsapp_phone, template_name, provider_message_id, user_id')
      .eq('direction', 'outbound')
      .eq('message_type', 'template')
      .order('created_at', { ascending: false })
      .limit(50),
  ]);

  // Hydrate session display name / email from profiles.
  const sessionsRaw = (sessionsRes.data ?? []) as SessionsRaw[];
  const userIds = Array.from(new Set(sessionsRaw.map((s) => s.user_id)));
  const profiles: ProfileRaw[] = userIds.length > 0
    ? (((await sb.from('profiles').select('id, full_name, email').in('id', userIds)).data) ?? []) as ProfileRaw[]
    : [];
  const profileById = new Map(profiles.map((p) => [p.id, p]));

  const sessions: SessionRow[] = sessionsRaw.map((s) => {
    const p = profileById.get(s.user_id);
    return {
      user_id: s.user_id,
      whatsapp_phone: s.whatsapp_phone,
      display_name: p?.full_name ?? null,
      email: p?.email ?? null,
      opted_in_at: s.opted_in_at,
      last_message_at: s.last_message_at,
      is_active: s.is_active,
    };
  });

  // Decode business_log rows. The dispatcher writes JSON.stringify(payload)
  // into `content`; pull out the structured fields for the table.
  const dispatchOutcomes: DispatchOutcomeRow[] = ((businessRes.data ?? []) as BusinessLogRow[]).map((row) => {
    let payload: Record<string, unknown> = {};
    if (row.content) {
      try {
        payload = JSON.parse(row.content);
      } catch {
        // leave empty — surface the raw title in the UI instead
      }
    }
    return {
      id: row.id,
      created_at: row.created_at,
      category: row.category as 'whatsapp_dispatch_ok' | 'whatsapp_dispatch_failed',
      title: row.title,
      user_id: typeof payload.user_id === 'string' ? payload.user_id : null,
      alert_type: typeof payload.alert_type === 'string' ? payload.alert_type : null,
      template_name: typeof payload.template_name === 'string' ? payload.template_name : null,
      error: typeof payload.error === 'string' ? payload.error : null,
      provider_message_id: typeof payload.provider_message_id === 'string' ? payload.provider_message_id : null,
    };
  });

  const templateSends: TemplateSendRow[] = ((messagesRes.data ?? []) as MessageLogRow[]).map((row) => ({
    id: row.id,
    created_at: row.created_at,
    whatsapp_phone: row.whatsapp_phone,
    template_name: row.template_name,
    provider_message_id: row.provider_message_id,
    user_id: row.user_id,
  }));

  return NextResponse.json({ sessions, dispatchOutcomes, templateSends });
}
