/**
 * Support Chase / Auto-Close Cron
 *
 * Daily at 09:00 UTC, runs the stale-ticket lifecycle Paul asked for:
 *
 * Phase 1 — CHASE:
 *   For tickets in `awaiting_reply` for > 7 days AND no chase_sent_at in metadata:
 *     - Send polite "still need help?" email via Resend
 *     - Set metadata.chase_sent_at = now
 *
 * Phase 2 — AUTO-CLOSE:
 *   For tickets where metadata.chase_sent_at is > 24h ago AND no user reply since:
 *     - Send "auto-closing, reply to reopen" email
 *     - Set status = 'resolved'
 *     - Set metadata.auto_closed = true, metadata.auto_closed_at = now
 *
 * Skips any ticket where the user has replied since the last chase (we detect that via
 * /api/webhooks/resend-inbound — see metadata.user_replies array).
 *
 * Auth: Bearer CRON_SECRET.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { resend, FROM_EMAIL } from '@/lib/resend';

export const runtime = 'nodejs';
export const maxDuration = 120;

const TICKET_REPLY_TO = 'support@paybacker.co.uk';
const CHASE_AFTER_DAYS = 7;
const CLOSE_AFTER_CHASE_HOURS = 24;
const AGENT_ID = 'support-chase';

interface TicketMetadata {
  confirmation_sent?: boolean;
  chase_sent_at?: string;
  auto_closed?: boolean;
  auto_closed_at?: string;
  user_replies?: Array<{ at: string; excerpt: string }>;
  [key: string]: unknown;
}

interface Ticket {
  id: string;
  ticket_number: string | null;
  subject: string;
  user_id: string | null;
  status: string;
  priority: string;
  metadata: TicketMetadata | null;
  created_at: string;
  first_response_at: string | null;
  updated_at: string;
}

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function getUserEmail(
  supabase: ReturnType<typeof getAdmin>,
  userId: string | null
): Promise<{ email: string | null; firstName: string | null }> {
  if (!userId) return { email: null, firstName: null };
  const { data } = await supabase
    .from('profiles')
    .select('email, full_name')
    .eq('id', userId)
    .single();
  if (!data?.email) return { email: null, firstName: null };
  return {
    email: data.email,
    firstName: (data.full_name || '').split(' ')[0] || null,
  };
}

function chaseEmailHtml(firstName: string, ticketRef: string, subject: string): string {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  return `<!doctype html>
<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #0B1220; line-height: 1.55; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p>${greeting}</p>
  <p>I'm just checking in on your support ticket from a week ago, regarding "<strong>${escapeHtml(subject)}</strong>" (ref: <strong>${escapeHtml(ticketRef)}</strong>).</p>
  <p>I haven't heard back from you, so I wanted to make sure you're sorted. Three quick options:</p>
  <ol>
    <li><strong>You're sorted</strong> — no action needed. We'll auto-close the ticket in 24 hours.</li>
    <li><strong>You still need help</strong> — just reply to this email with the latest. I'll pick it up and get back to you.</li>
    <li><strong>Something else came up</strong> — also just reply, no problem.</li>
  </ol>
  <p>If we don't hear from you in the next 24 hours we'll close the ticket automatically — but you can always reply to reopen it.</p>
  <p>Best,<br/>Riley<br/><em>Paybacker Support</em></p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 12px;"/>
  <p style="font-size:12px;color:#6B7280;">Paybacker · paybacker.co.uk · Reply to this email to keep your ticket open.</p>
</body></html>`;
}

function autoCloseEmailHtml(firstName: string, ticketRef: string, subject: string): string {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  return `<!doctype html>
<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #0B1220; line-height: 1.55; max-width: 560px; margin: 0 auto; padding: 24px;">
  <p>${greeting}</p>
  <p>I haven't heard back about "<strong>${escapeHtml(subject)}</strong>" (ref: <strong>${escapeHtml(ticketRef)}</strong>), so I'm closing the ticket for now to keep your queue tidy.</p>
  <p>If you still need help, <strong>just reply to this email</strong> — that automatically reopens the ticket and I'll get back to you.</p>
  <p>Thanks for using Paybacker.</p>
  <p>Best,<br/>Riley<br/><em>Paybacker Support</em></p>
  <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0 12px;"/>
  <p style="font-size:12px;color:#6B7280;">Paybacker · paybacker.co.uk</p>
</body></html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  ticketRef: string;
}): Promise<boolean> {
  try {
    const r = await resend.emails.send({
      from: `Riley at Paybacker <${FROM_EMAIL}>`,
      to: [opts.to],
      replyTo: TICKET_REPLY_TO,
      subject: opts.subject,
      html: opts.html,
      headers: {
        'X-Paybacker-Ticket': opts.ticketRef,
      },
    });
    return !!r;
  } catch (e) {
    console.error('[support-chase] Resend send failed:', e);
    return false;
  }
}

async function processChase(
  supabase: ReturnType<typeof getAdmin>
): Promise<{ chased: number; auto_closed: number; errors: string[] }> {
  const errors: string[] = [];
  const chaseCutoff = new Date(Date.now() - CHASE_AFTER_DAYS * 86400_000).toISOString();
  const closeCutoff = new Date(Date.now() - CLOSE_AFTER_CHASE_HOURS * 3600_000).toISOString();

  // Fetch all awaiting_reply tickets that are old enough to consider
  const { data: tickets, error } = await supabase
    .from('support_tickets')
    .select('id, ticket_number, subject, user_id, status, priority, metadata, created_at, first_response_at, updated_at')
    .eq('status', 'awaiting_reply')
    .lte('created_at', chaseCutoff)
    .order('created_at', { ascending: true });

  if (error) {
    errors.push(`fetch: ${error.message}`);
    return { chased: 0, auto_closed: 0, errors };
  }

  let chased = 0;
  let autoClosed = 0;
  const ticketList = (tickets || []) as Ticket[];

  for (const t of ticketList) {
    const meta = (t.metadata || {}) as TicketMetadata;
    const ref = t.ticket_number || t.id.slice(0, 8).toUpperCase();
    const userReplies = meta.user_replies || [];
    const lastUserReply = userReplies.length > 0 ? userReplies[userReplies.length - 1].at : null;
    const { email, firstName } = await getUserEmail(supabase, t.user_id);

    if (!email) {
      // No user email = can't chase. Skip silently.
      continue;
    }

    if (!meta.chase_sent_at) {
      // PHASE 1: send chase
      const ok = await sendEmail({
        to: email,
        subject: `Just checking in — ${ref}`,
        html: chaseEmailHtml(firstName || '', ref, t.subject),
        ticketRef: ref,
      });
      if (!ok) {
        errors.push(`chase send failed for ${ref}`);
        continue;
      }
      await supabase
        .from('support_tickets')
        .update({
          metadata: { ...meta, chase_sent_at: new Date().toISOString() },
          updated_at: new Date().toISOString(),
        })
        .eq('id', t.id);
      chased += 1;
      continue;
    }

    // chase already sent
    if (meta.chase_sent_at <= closeCutoff) {
      // user has had >24h since chase. Did they reply?
      if (lastUserReply && lastUserReply > meta.chase_sent_at) {
        // user replied after the chase — webhook should have already reset status; but if it
        // didn't (maybe the webhook hadn't deployed yet) reset here as a safety net.
        await supabase
          .from('support_tickets')
          .update({
            status: 'open',
            assigned_to: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', t.id);
        continue;
      }

      // PHASE 2: auto-close
      const ok = await sendEmail({
        to: email,
        subject: `Closing your ticket — ${ref}`,
        html: autoCloseEmailHtml(firstName || '', ref, t.subject),
        ticketRef: ref,
      });
      if (!ok) {
        errors.push(`auto-close send failed for ${ref}`);
        continue;
      }
      await supabase
        .from('support_tickets')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          metadata: {
            ...meta,
            auto_closed: true,
            auto_closed_at: new Date().toISOString(),
            close_reason: 'no_reply_after_chase',
          },
          updated_at: new Date().toISOString(),
        })
        .eq('id', t.id);
      autoClosed += 1;
    }
  }

  return { chased, auto_closed: autoClosed, errors };
}

async function handle(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  let result: { chased: number; auto_closed: number; errors: string[] };
  try {
    result = await processChase(supabase);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }

  // Audit row in business_log so the digest cron sees this activity.
  await supabase.from('business_log').insert({
    category: result.errors.length > 0 ? 'warn' : 'info',
    title: `Support chase run — ${result.chased} chased, ${result.auto_closed} auto-closed`,
    content: `Phase 1 (chase): ${result.chased} tickets. Phase 2 (auto-close): ${result.auto_closed} tickets. Errors: ${result.errors.length === 0 ? 'none' : result.errors.join('; ')}`,
    created_by: AGENT_ID,
  });

  return NextResponse.json({
    ok: true,
    chased: result.chased,
    auto_closed: result.auto_closed,
    errors: result.errors,
    timestamp: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
