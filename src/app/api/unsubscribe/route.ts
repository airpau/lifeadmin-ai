/**
 * GET /api/unsubscribe?token=... — public, token-gated unsubscribe.
 * POST same — RFC 8058 one-click unsubscribe target (Gmail/Outlook
 * native button POSTs `List-Unsubscribe=One-Click`).
 *
 * Honours the request immediately:
 *   - sets unsubscribed_at = now()
 *   - flips funnel_stage to 'unsubscribed'
 *   - GET → redirect to /unsubscribe (success page)
 *   - POST → 200 JSON
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { captureServer } from '@/lib/posthog-server';

export const runtime = 'nodejs';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

async function processUnsubscribe(token: string): Promise<{ ok: boolean; alreadyUnsubscribed: boolean; leadId?: string }> {
  if (!token) return { ok: false, alreadyUnsubscribed: false };
  const supabase = getAdmin();

  const { data: lead } = await supabase
    .from('consumer_leads')
    .select('id, unsubscribed_at, email_count')
    .eq('unsubscribe_token', token)
    .maybeSingle();

  if (!lead) return { ok: false, alreadyUnsubscribed: false };
  if (lead.unsubscribed_at) {
    return { ok: true, alreadyUnsubscribed: true, leadId: lead.id };
  }

  const now = new Date().toISOString();
  await supabase
    .from('consumer_leads')
    .update({
      unsubscribed_at: now,
      funnel_stage: 'unsubscribed',
    })
    .eq('id', lead.id);

  captureServer('lead_unsubscribed', `consumer_lead:${lead.id}`, {
    email_count_at_unsub: lead.email_count,
  });

  return { ok: true, alreadyUnsubscribed: false, leadId: lead.id };
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token') || '';
  const result = await processUnsubscribe(token);
  // Always redirect to the success page so unauthenticated browsers don't
  // see a confusing JSON blob — the page itself shows the right message.
  const url = req.nextUrl.clone();
  url.pathname = '/unsubscribe';
  url.search = result.ok ? '?ok=1' : '?ok=0';
  return NextResponse.redirect(url);
}

export async function POST(req: NextRequest) {
  // RFC 8058: token may be in query string OR the body
  let token = req.nextUrl.searchParams.get('token') || '';
  if (!token) {
    try {
      const ct = req.headers.get('content-type') || '';
      if (ct.includes('application/x-www-form-urlencoded')) {
        const text = await req.text();
        const params = new URLSearchParams(text);
        token = params.get('token') || '';
      } else if (ct.includes('application/json')) {
        const body = (await req.json()) as { token?: string };
        token = body.token || '';
      }
    } catch {
      /* ignore */
    }
  }
  const result = await processUnsubscribe(token);
  return NextResponse.json({ ok: result.ok, already_unsubscribed: result.alreadyUnsubscribed });
}
