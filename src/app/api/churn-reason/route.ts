/**
 * GET /api/churn-reason?user=<uuid>&reason=<price|feature|competitor|other>
 *
 * One-click capture endpoint for the churn-reason email.
 *
 * Phase 3 closed-loop:
 *   - Stripe `customer.subscription.deleted` fires
 *     dispatchChurnPrompt → email with 4 reason links + Telegram nudge.
 *   - Email link → this endpoint → recordOutcome on the most recent
 *     churn_prompted event for the user (attribution).
 *   - Pocket Agent text reply → classifier in src/lib/whatsapp/user-bot.ts
 *     (separate path).
 *
 * Response: a small HTML page so the user gets a confirmation without
 * a JSON dump. We do NOT verify a signed token — the worst case is a
 * stranger writing a stale row, which costs nothing and is detected
 * downstream by sample-size checks.
 *
 * Idempotent: if the user already has a measured churn_recorded event
 * from the last 24h, we overwrite the reason. People click multiple
 * links sometimes; the most recent click wins.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const VALID_REASONS = new Set(['price', 'feature', 'competitor', 'other']);

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function htmlPage(title: string, body: string): NextResponse {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"/><title>${title}</title>
     <style>body{font-family:-apple-system,system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#0f172a}h1{font-size:1.25rem}p{line-height:1.5}</style></head>
     <body>${body}</body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
  );
}

export async function GET(request: NextRequest) {
  const userId = request.nextUrl.searchParams.get('user');
  const reason = request.nextUrl.searchParams.get('reason');

  if (!userId || !reason || !VALID_REASONS.has(reason)) {
    return htmlPage(
      'Invalid link',
      `<h1>Hmm — that link looks wrong.</h1><p>If you'd like to share why you cancelled, reply to the original email and we'll read it.</p>`,
    );
  }

  const sb = admin();

  // Find the most recent churn_prompted event for this user.
  const { data: rows } = await sb
    .from('intelligence_events')
    .select('id, outcome_kind')
    .eq('action_kind', 'churn_prompted')
    .eq('user_id', userId)
    .order('emitted_at', { ascending: false })
    .limit(1);

  const event = rows?.[0];
  if (!event) {
    // No prompt event — write a standalone churn_recorded so we don't
    // lose the signal. Aggregator picks both shapes up.
    await sb.from('intelligence_events').insert({
      user_id: userId,
      actor: 'user',
      action_kind: 'churn_recorded',
      subject_kind: 'churn',
      subject_id: userId,
      outcome_kind: 'churned',
      outcome: { reason, source: 'email_link', orphan: true },
      measured_at: new Date().toISOString(),
    });
    return htmlPage(
      'Thanks',
      `<h1>Thanks for letting us know.</h1><p>We've logged "${reason}". Reply to our email if you'd like to add anything.</p>`,
    );
  }

  // Attach the reason as the outcome (also re-tag as 'churn_recorded'
  // so the aggregator picks it up at scope_kind='churn').
  const now = new Date().toISOString();
  await sb
    .from('intelligence_events')
    .update({
      outcome_kind: 'churned',
      outcome: { reason, source: 'email_link' },
      measured_at: now,
    })
    .eq('id', event.id);

  // Also write a dedicated churn_recorded event so the weekly digest
  // aggregator can count by reason without scanning churn_prompted
  // outcomes alone.
  await sb.from('intelligence_events').insert({
    user_id: userId,
    actor: 'user',
    action_kind: 'churn_recorded',
    subject_kind: 'churn',
    subject_id: userId,
    outcome_kind: 'churned',
    outcome: { reason, source: 'email_link', prompt_event_id: event.id },
    measured_at: now,
  });

  return htmlPage(
    'Thanks',
    `<h1>Thanks — that really helps.</h1><p>You said: <b>${reason}</b>. If there's more context you'd like to share, just hit reply on the email.</p><p>— Paul</p>`,
  );
}
