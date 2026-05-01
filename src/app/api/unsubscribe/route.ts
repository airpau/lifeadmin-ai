/**
 * GET /api/unsubscribe?token=...&kind=consumer_lead|newsletter — public,
 * token-gated unsubscribe. POST same — RFC 8058 one-click unsubscribe
 * target (Gmail/Outlook native button POSTs `List-Unsubscribe=One-Click`).
 *
 * Honours the request immediately:
 *   - consumer_lead kind: sets unsubscribed_at = now() on the lead row
 *     and flips funnel_stage = 'unsubscribed'.
 *   - newsletter kind: sets profiles.newsletter_unsubscribed_at = now()
 *     for the user whose newsletter_unsub_token matches.
 *   - GET → redirect to /unsubscribe (success page)
 *   - POST → 200 JSON
 *
 * `kind` defaults to `consumer_lead` for backward compatibility with
 * the consumer-nurture footer links that pre-date the newsletter.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { captureServer } from '@/lib/posthog-server';

export const runtime = 'nodejs';

type UnsubKind = 'consumer_lead' | 'newsletter';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

function pickKind(raw: string | null): UnsubKind {
  return raw === 'newsletter' ? 'newsletter' : 'consumer_lead';
}

interface UnsubResult {
  ok: boolean;
  alreadyUnsubscribed: boolean;
  leadId?: string;
  userId?: string;
}

async function processUnsubscribe(token: string, kind: UnsubKind): Promise<UnsubResult> {
  if (!token) return { ok: false, alreadyUnsubscribed: false };
  const supabase = getAdmin();

  if (kind === 'newsletter') {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, newsletter_unsubscribed_at')
      .eq('newsletter_unsub_token', token)
      .maybeSingle();
    if (!profile) return { ok: false, alreadyUnsubscribed: false };
    if (profile.newsletter_unsubscribed_at) {
      return { ok: true, alreadyUnsubscribed: true, userId: profile.id };
    }
    const now = new Date().toISOString();
    await supabase
      .from('profiles')
      .update({ newsletter_unsubscribed_at: now })
      .eq('id', profile.id);
    // Mirror to user_metadata so the dashboard toggle reads false on
    // next load. Service-role admin auth API call.
    try {
      await supabase.auth.admin.updateUserById(profile.id, {
        user_metadata: { marketing_opt_in: false },
      });
    } catch {
      // Non-fatal: profiles flag alone suppresses the cron, the
      // mirror is just so the settings page stays in sync.
    }
    captureServer('newsletter_unsubscribed', `user:${profile.id}`, {});
    return { ok: true, alreadyUnsubscribed: false, userId: profile.id };
  }

  // consumer_lead (legacy path — kept for existing nurture footers)
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
  const kind = pickKind(req.nextUrl.searchParams.get('kind'));
  const result = await processUnsubscribe(token, kind);
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
  let kind = pickKind(req.nextUrl.searchParams.get('kind'));
  if (!token) {
    try {
      const ct = req.headers.get('content-type') || '';
      if (ct.includes('application/x-www-form-urlencoded')) {
        const text = await req.text();
        const params = new URLSearchParams(text);
        token = params.get('token') || '';
        if (params.get('kind')) kind = pickKind(params.get('kind'));
      } else if (ct.includes('application/json')) {
        const body = (await req.json()) as { token?: string; kind?: string };
        token = body.token || '';
        if (body.kind) kind = pickKind(body.kind);
      }
    } catch {
      /* ignore */
    }
  }
  const result = await processUnsubscribe(token, kind);
  return NextResponse.json({ ok: result.ok, already_unsubscribed: result.alreadyUnsubscribed });
}
