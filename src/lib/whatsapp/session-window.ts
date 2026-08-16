/**
 * 24-hour customer-service window helper.
 *
 * Both Twilio and Meta enforce WhatsApp Business policy: outside the 24h
 * window from the user's last inbound, the only legal outbound is an
 * approved template. Free-form text and free-form interactive messages
 * are rejected (Meta returns error code 131047 with category
 * `outside_window`; Twilio returns 63016).
 *
 * The Pocket Agent's *replies* are always within the window — it fires
 * seconds after an inbound — so it doesn't need this check. CRON-based
 * outbound (price-increase alerts, outcome checks, morning summaries)
 * fires at arbitrary times and SHOULD check before sending free-form;
 * those paths already prefer templates and so are safe by construction,
 * but this helper exists for any future free-form alert path.
 *
 * 2026-08-16: this module is now the SINGLE SOURCE for the window check.
 * Three near-duplicate implementations existed (here, morning-brief.ts,
 * pocket-agent/dispatch.ts). The other two now delegate here, preserving
 * their previous behaviour (fail-closed on error, userId-scoped lookup).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const WINDOW_MS = 24 * 60 * 60 * 1000;

function admin(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Returns true if the user has sent us a WhatsApp message in the last 24h
 * — i.e. free-form / interactive outbound is allowed.
 *
 * Reads from `whatsapp_message_log` rather than `whatsapp_sessions.last_message_at`
 * because the latter is also touched on outbound writes; we specifically
 * need the most recent INBOUND.
 *
 * Returns false if there's no inbound at all or the lookup fails — fail
 * closed, callers should fall back to a template send.
 */
export async function isWithinSessionWindow(
  userIdOrPhone: { userId?: string; phone?: string },
  client?: SupabaseClient,
): Promise<boolean> {
  try {
    const sb = client ?? admin();
    if (!sb) return false;
    if (!userIdOrPhone.userId && !userIdOrPhone.phone) return false;
    const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();

    let q = sb
      .from('whatsapp_message_log')
      .select('created_at')
      .eq('direction', 'inbound')
      .gte('created_at', cutoff)
      .order('created_at', { ascending: false })
      .limit(1);

    if (userIdOrPhone.userId) q = q.eq('user_id', userIdOrPhone.userId);
    if (userIdOrPhone.phone) q = q.eq('whatsapp_phone', userIdOrPhone.phone);

    const { data, error } = await q;
    if (error) {
      // Fail closed — Postgres hiccup shouldn't let us send free-form
      // messages that Meta will then 400. Caller falls back to template.
      console.warn('[whatsapp/session-window] lookup failed', error.message);
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (e) {
    console.warn('[whatsapp/session-window] lookup threw', (e as Error)?.message ?? e);
    return false;
  }
}
