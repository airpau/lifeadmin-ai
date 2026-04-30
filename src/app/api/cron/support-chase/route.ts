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
import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

export const runtime = 'nodejs';
export const maxDuration = 120;

// Use the canonical REPLY_TO from src/lib/resend.ts (which routes to the
// receiving-enabled mail.paybacker.co.uk subdomain so /api/webhooks/resend-inbound fires).
const TICKET_REPLY_TO = REPLY_TO;
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

function extractEmailFromMetadataFrom(from: unknown): string | null {
  if (typeof from !== 'string') return null;
  // metadata.from might be "Name <email@x.com>" or just "email@x.com"
  const m = from.match(/<([^>]+)>/);
  const candidate = (m ? m[1] : from).trim().toLowerCase();
  if (!candidate.includes('@') || !/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(candidate)) return null;
  return candidate;
}

async function getUserEmail(
  supabase: ReturnType<typeof getAdmin>,
  userId: string | null,
  metadata: TicketMetadata | null
): Promise<{ email: string | null; firstName: string | null; source: 'profile' | 'metadata' | 'none' }> {
  if (userId) {
    const { data } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', userId)
      .single();
    if (data?.email) {
      return {
        email: data.email,
        firstName: ((data.full_name as string) || '').split(' ')[0] || null,
        source: 'profile',
      };
    }
  }
  // Fallback to metadata.from for tickets created via inbound email without a registered profile.
  const fromEmail = extractEmailFromMetadataFrom((metadata as Record<string, unknown> | null)?.from);
  if (fromEmail) {
    return { email: fromEmail, firstName: null, source: 'metadata' };
  }
  return { email: null, firstName: null, source: 'none' };
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
): Promise<{ chased: number; auto_closed: number; no_contact_closed: number; errors: string[] }> {
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
    return { chased: 0, auto_closed: 0, no_contact_closed: 0, errors };
  }

  let chased = 0;
  let autoClosed = 0;
  let noContactClosed = 0;
  const ticketList = (tickets || []) as Ticket[];

  for (const t of ticketList) {
    const meta = (t.metadata || {}) as TicketMetadata;
    const ref = t.ticket_number || t.id.slice(0, 8).toUpperCase();
    const userReplies = meta.user_replies || [];
    const lastUserReply = userReplies.length > 0 ? userReplies[userReplies.length - 1].at : null;
    const { email, firstName } = await getUserEmail(supabase, t.user_id, meta);

    if (!email) {
      // No user email anywhere = chatbot escalation from anonymous user, or stale test
      // ticket. Auto-close with a clear reason after 14 days; skip younger ones.
      const ageMs = Date.now() - new Date(t.created_at).getTime();
      const ageDays = ageMs / 86400_000;
      if (ageDays >= 14) {
        await supabase
          .from('support_tickets')
          .update({
            status: 'resolved',
            resolved_at: new Date().toISOString(),
            metadata: {
              ...meta,
              auto_closed: true,
              auto_closed_at: new Date().toISOString(),
              close_reason: 'no_contact_info',
            },
            updated_at: new Date().toISOString(),
          })
          .eq('id', t.id);
        noContactClosed += 1;
      }
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

  return { chased, auto_closed: autoClosed, no_contact_closed: noContactClosed, errors };
}

// PHASE 4: timeout awaiting_user_confirmation tickets after 7 days of silence.
// Builder shipped a fix and asked the user to verify; if the user never
// replied (positive or negative) within 7 days, soft-close to 'resolved'
// with a friendly final note inviting them to reply if it's still broken.
async function processConfirmationTimeout(
  supabase: ReturnType<typeof getAdmin>,
): Promise<{ closed: number; errors: string[] }> {
  let closed = 0;
  const errors: string[] = [];

  const sevenDaysAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
  const { data: tickets } = await supabase
    .from('support_tickets')
    .select('id, ticket_number, subject, user_id, status, source, metadata, updated_at')
    .eq('status', 'awaiting_user_confirmation')
    .lt('updated_at', sevenDaysAgo)
    .limit(50);

  for (const row of (tickets || []) as Array<{
    id: string;
    ticket_number: string | null;
    subject: string;
    user_id: string | null;
    status: string;
    source: string;
    metadata: Record<string, unknown> | null;
    updated_at: string;
  }>) {
    try {
      const meta = row.metadata || {};
      const ref = row.ticket_number || row.id.slice(0, 8).toUpperCase();
      const closingMessage =
        `We haven't heard back on ticket ${ref} for 7 days, so we're closing it out. ` +
        `If the original issue isn't fully sorted, just reply any time and we'll re-open it.`;

      // Insert a system note on the ticket so the conversation history records the close.
      await supabase.from('ticket_messages').insert({
        ticket_id: row.id,
        sender_type: 'system',
        sender_name: 'Riley',
        message: closingMessage,
      });

      // Soft-close to resolved with metadata flag so we know it was
      // confirmation-timeout (not a user-confirmed close).
      const closedAt = new Date().toISOString();
      await supabase
        .from('support_tickets')
        .update({
          status: 'resolved',
          resolved_at: closedAt,
          metadata: {
            ...meta,
            confirmation_timeout_closed_at: closedAt,
            close_reason: 'confirmation_timeout_7d',
          },
          updated_at: closedAt,
        })
        .eq('id', row.id);

      // Best-effort final notification across channels.
      // Email path:
      let email: string | null = null;
      if (row.user_id) {
        const { data: prof } = await supabase
          .from('profiles')
          .select('email')
          .eq('id', row.user_id)
          .single();
        email = (prof as { email: string | null } | null)?.email ?? null;
      }
      if (!email && typeof (meta as Record<string, unknown>).from === 'string') {
        const m = ((meta as Record<string, unknown>).from as string).match(/<([^>]+)>/);
        email = m ? m[1] : ((meta as Record<string, unknown>).from as string);
      }
      if (email && process.env.RESEND_API_KEY) {
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              from: process.env.RESEND_FROM_EMAIL || 'Paybacker <noreply@paybacker.co.uk>',
              replyTo: process.env.RESEND_REPLY_TO || 'support@mail.paybacker.co.uk',
              to: [email],
              subject: `Closing ticket — ${ref}`,
              text: closingMessage,
            }),
          });
        } catch {
          /* best-effort */
        }
      }
      // Telegram path (best-effort): use ticket metadata or telegram_sessions row.
      try {
        let tgChatId: number | string | null = null;
        const metaTg = (meta as Record<string, unknown>).telegram_chat_id;
        if (typeof metaTg === 'number' || (typeof metaTg === 'string' && metaTg)) {
          tgChatId = metaTg as number | string;
        } else if (row.user_id) {
          const { data: tg } = await supabase
            .from('telegram_sessions')
            .select('chat_id')
            .eq('user_id', row.user_id)
            .order('updated_at', { ascending: false })
            .limit(1)
            .maybeSingle();
          const cid = (tg as { chat_id: number | string | null } | null)?.chat_id;
          if (cid != null) tgChatId = cid;
        }
        if (tgChatId && process.env.TELEGRAM_BOT_TOKEN) {
          await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({
              chat_id: Number(tgChatId),
              text: closingMessage,
              disable_web_page_preview: true,
            }),
          });
        }
      } catch {
        /* best-effort */
      }
      closed += 1;
    } catch (e) {
      errors.push(`${row.ticket_number ?? row.id.slice(0, 8)}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { closed, errors };
}

async function handle(req: NextRequest) {
  const auth = req.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getAdmin();
  let result: { chased: number; auto_closed: number; no_contact_closed: number; errors: string[] };
  let confirmTimeout: { closed: number; errors: string[] };
  try {
    result = await processChase(supabase);
    confirmTimeout = await processConfirmationTimeout(supabase);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }

  const allErrors = [...result.errors, ...confirmTimeout.errors];

  // Audit row in business_log so the digest cron sees this activity.
  await supabase.from('business_log').insert({
    category: allErrors.length > 0 ? 'warn' : 'info',
    title: `Support chase — ${result.chased} chased, ${result.auto_closed} auto-closed, ${result.no_contact_closed} closed (no contact), ${confirmTimeout.closed} confirmation-timeout closed`,
    content: `Phase 1 (chase >7d awaiting_reply): ${result.chased}. Phase 2 (auto-close 24h after chase): ${result.auto_closed}. Phase 3 (close >14d with no contact info — chatbot escalations from anonymous users): ${result.no_contact_closed}. Phase 4 (close >7d awaiting_user_confirmation — Builder fix shipped, user never verified): ${confirmTimeout.closed}. Errors: ${allErrors.length === 0 ? 'none' : allErrors.join('; ')}`,
    created_by: AGENT_ID,
  });

  return NextResponse.json({
    ok: true,
    chased: result.chased,
    auto_closed: result.auto_closed,
    no_contact_closed: result.no_contact_closed,
    confirmation_timeout_closed: confirmTimeout.closed,
    errors: allErrors,
    timestamp: new Date().toISOString(),
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}

export async function POST(req: NextRequest) {
  return handle(req);
}
