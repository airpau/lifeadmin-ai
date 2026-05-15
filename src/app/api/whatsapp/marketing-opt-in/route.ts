/**
 * WhatsApp marketing-template opt-in (separate from channel opt-in).
 *
 * Why two opt-ins?
 *   Meta commerce policy treats MARKETING templates as a distinct
 *   consent category from utility / authentication / service messages.
 *   Sending marketing templates without an explicit, dated consent
 *   record violates policy and tanks the WABA quality rating. Five of
 *   our 15 approved templates were re-categorised to MARKETING by
 *   Meta on 2026-04-29 (welcome, alert_renewal, morning_summary,
 *   savings_goal_milestone, recovery_total_weekly), so we need a way
 *   for users to grant / revoke that specific consent independently
 *   of being on the WhatsApp channel.
 *
 * Persistence
 *   `whatsapp_sessions.marketing_opt_in_at` — timestamp of explicit
 *   opt-in. NULL = no marketing sends allowed. The dispatcher
 *   (src/lib/notifications/dispatch.ts) checks this column before
 *   sending any MARKETING-category template.
 *
 * Endpoints
 *   GET  → { optedIn: boolean, since?: string }
 *   POST → record consent (sets marketing_opt_in_at = NOW())
 *   DELETE → revoke (sets marketing_opt_in_at = NULL)
 *
 * All endpoints require an active WhatsApp session for the user.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data } = await supabase
    .from('whatsapp_sessions')
    .select('marketing_opt_in_at')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .maybeSingle();

  if (!data) {
    return NextResponse.json({ optedIn: false, hasSession: false });
  }
  return NextResponse.json({
    optedIn: !!data.marketing_opt_in_at,
    since: data.marketing_opt_in_at ?? undefined,
    hasSession: true,
  });
}

export async function POST() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error, data } = await supabase
    .from('whatsapp_sessions')
    .update({ marketing_opt_in_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq('is_active', true)
    .select('marketing_opt_in_at')
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) {
    return NextResponse.json(
      { error: 'No active WhatsApp session — connect WhatsApp first.' },
      { status: 400 },
    );
  }
  return NextResponse.json({ optedIn: true, since: data.marketing_opt_in_at });
}

export async function DELETE() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { error } = await supabase
    .from('whatsapp_sessions')
    .update({ marketing_opt_in_at: null })
    .eq('user_id', user.id)
    .eq('is_active', true);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ optedIn: false });
}
