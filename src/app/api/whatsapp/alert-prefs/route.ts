/**
 * GET  — return the 17 WhatsApp alert toggles for the logged-in user.
 * PATCH — flip any subset of the 17 toggles. Body shape:
 *           { prefs: { whatsapp_<key>: boolean, ... } }
 *
 * Backed by `notification_preferences` rows (one row per underlying
 * event_type). See `src/lib/whatsapp/notification-prefs.ts` for the
 * stable alert-key ↔ event_type mapping.
 *
 * Non-Pro users CAN still flip toggles — we just won't have a session
 * to send to. The unified dispatcher gates on tier separately.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  ALL_WHATSAPP_ALERT_KEYS,
  getUserNotificationPrefs,
  setAlertEnabled,
  type WhatsAppAlertKey,
} from '@/lib/whatsapp/notification-prefs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const prefs = await getUserNotificationPrefs(supabase, user.id);
  return NextResponse.json({ prefs });
}

export async function PATCH(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { prefs?: Partial<Record<WhatsAppAlertKey, boolean>> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const incoming = body.prefs ?? {};
  const knownKeys = new Set<WhatsAppAlertKey>(ALL_WHATSAPP_ALERT_KEYS);
  const errors: string[] = [];

  for (const [k, v] of Object.entries(incoming)) {
    if (!knownKeys.has(k as WhatsAppAlertKey)) continue;
    if (typeof v !== 'boolean') continue;
    const res = await setAlertEnabled(supabase, user.id, k as WhatsAppAlertKey, v);
    if (!res.ok && res.error) errors.push(`${k}: ${res.error}`);
  }

  if (errors.length > 0) {
    return NextResponse.json({ ok: false, errors }, { status: 500 });
  }

  const prefs = await getUserNotificationPrefs(supabase, user.id);
  return NextResponse.json({ ok: true, prefs });
}
