/**
 * Resend Inbound Email Webhook
 *
 * Resend forwards inbound emails (sent to support@paybacker.co.uk) to this endpoint.
 * Each user reply gets:
 *   1. Matched to a ticket via ticket_number in subject/headers (X-Paybacker-Ticket).
 *   2. Inserted into ticket_messages with sender_type='user'.
 *   3. Status reset to 'open' + assigned_to cleared so Riley re-processes on next 15-min cron.
 *   4. Recorded in metadata.user_replies for audit + chase-cron resets.
 *
 * Auth: Resend webhook signing secret (RESEND_WEBHOOK_SECRET). Falls back to
 * Bearer CRON_SECRET for manual testing.
 *
 * Resend inbound payload (per docs): {
 *   "type": "email.delivered" | "email.received" | ...,
 *   "data": {
 *     "from": "...",
 *     "to": [...],
 *     "subject": "...",
 *     "text": "...",
 *     "html": "...",
 *     "headers": [{"name":"X-Paybacker-Ticket","value":"TKT-XXXX"}],
 *     ...
 *   }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const maxDuration = 30;

const AGENT_ID = 'resend-inbound-webhook';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

function verifyResendSignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signature) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  // Resend's signature header is typically `sha256=<hex>` or just hex
  const cleaned = signature.replace(/^sha256=/i, '').trim();
  if (cleaned.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(cleaned, 'hex'), Buffer.from(expected, 'hex'));
}

function extractTicketRef(payload: {
  subject?: string;
  headers?: Array<{ name: string; value: string }> | Record<string, string>;
  text?: string;
}): string | null {
  // 1. Headers (X-Paybacker-Ticket — set by outbound emails)
  const headers = payload.headers;
  if (Array.isArray(headers)) {
    const h = headers.find(
      (x) => x.name.toLowerCase() === 'x-paybacker-ticket'
    );
    if (h?.value) return h.value.trim().toUpperCase();
  } else if (headers && typeof headers === 'object') {
    for (const [k, v] of Object.entries(headers)) {
      if (k.toLowerCase() === 'x-paybacker-ticket' && v) return v.trim().toUpperCase();
    }
  }

  // 2. Subject — usually contains "ref: TKT-XXXX" or "[TKT-XXXX]"
  if (payload.subject) {
    const m = payload.subject.match(/\bTKT-\d{4,}\b/i);
    if (m) return m[0].toUpperCase();
  }

  // 3. Body text fallback
  if (payload.text) {
    const m = payload.text.match(/\bTKT-\d{4,}\b/i);
    if (m) return m[0].toUpperCase();
  }

  return null;
}

function trimReplyBody(text: string): string {
  // Strip the quoted previous email (everything after a typical quote marker).
  // Handles common patterns like "On Mon, Apr 24, 2026 at 9:30 PM, Riley..." or "> Quoted..."
  const splitPatterns = [
    /\n[-]{2,}\s*Original Message[-]{2,}/i,
    /\nOn .+,? .+ wrote:\s*\n/,
    /\n\s*>+ /,
    /\n\s*From: .+@.+/,
  ];
  let body = text;
  for (const p of splitPatterns) {
    const m = body.search(p);
    if (m > 0) {
      body = body.slice(0, m);
      break;
    }
  }
  return body.trim().slice(0, 4000);
}

async function handle(req: NextRequest) {
  // Auth: prefer Resend signature; fall back to CRON_SECRET for manual testing.
  const rawBody = await req.text();
  const sig = req.headers.get('resend-signature') || req.headers.get('svix-signature');
  const auth = req.headers.get('authorization');
  const isResendVerified = verifyResendSignature(rawBody, sig);
  const isCronAuthed = auth === `Bearer ${process.env.CRON_SECRET}`;
  if (!isResendVerified && !isCronAuthed) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: {
    type?: string;
    data?: {
      from?: string;
      from_email?: string;
      to?: string[];
      subject?: string;
      text?: string;
      html?: string;
      headers?: Array<{ name: string; value: string }> | Record<string, string>;
    };
  };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const data = payload.data || {};
  const fromEmail =
    (data.from_email && String(data.from_email).toLowerCase()) ||
    (data.from && String(data.from).match(/<([^>]+)>/)?.[1]?.toLowerCase()) ||
    (data.from && String(data.from).toLowerCase()) ||
    null;
  const subject = data.subject || '(no subject)';
  const bodyText = trimReplyBody(data.text || '');

  if (!fromEmail) {
    return NextResponse.json({ ok: false, reason: 'no from address' }, { status: 400 });
  }

  const ticketRef = extractTicketRef({
    subject: data.subject,
    headers: data.headers,
    text: data.text,
  });

  const supabase = getAdmin();

  // Find the ticket. Prefer ticket_number; fall back to most-recent ticket from this email.
  type TicketRow = {
    id: string;
    user_id: string | null;
    status: string;
    metadata: Record<string, unknown> | null;
    ticket_number: string | null;
    subject: string;
  };
  let ticket: TicketRow | null = null;

  if (ticketRef) {
    const { data: byRef } = await supabase
      .from('support_tickets')
      .select('id, user_id, status, metadata, ticket_number, subject')
      .eq('ticket_number', ticketRef)
      .single();
    ticket = (byRef as TicketRow | null);
  }

  if (!ticket) {
    // Match by user email, most recent non-resolved
    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('email', fromEmail)
      .single();
    if (profile?.id) {
      const { data: byUser } = await supabase
        .from('support_tickets')
        .select('id, user_id, status, metadata, ticket_number, subject')
        .eq('user_id', profile.id)
        .not('status', 'in', '("resolved","dismissed","closed")')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      ticket = (byUser as TicketRow | null);
    }
  }

  if (!ticket) {
    // No matching ticket. Log to business_log so support-triager can see orphan replies.
    await supabase.from('business_log').insert({
      category: 'warn',
      title: `Inbound email with no matching ticket — from ${fromEmail}`,
      content: `Subject: ${subject}\nBody excerpt: ${bodyText.slice(0, 500)}`,
      created_by: AGENT_ID,
    });
    return NextResponse.json({ ok: true, matched: false, reason: 'no ticket found' });
  }

  // Insert into ticket_messages so Riley sees the new user message in conversation history.
  await supabase.from('ticket_messages').insert({
    ticket_id: ticket.id,
    sender_type: 'user',
    sender_email: fromEmail,
    message: bodyText,
    created_at: new Date().toISOString(),
  });

  // Append to metadata.user_replies for audit + to reset chase logic.
  const meta = (ticket.metadata || {}) as Record<string, unknown>;
  const existingReplies = (meta.user_replies as Array<{ at: string; excerpt: string }>) || [];
  const newReplies = [
    ...existingReplies,
    { at: new Date().toISOString(), excerpt: bodyText.slice(0, 200) },
  ];

  // Reset status to 'open' + clear assigned_to. Riley's 15-min cron will pick it up.
  // ALSO clear chase_sent_at + auto_closed flags so the chase cron resets the lifecycle.
  const newMeta: Record<string, unknown> = {
    ...meta,
    user_replies: newReplies,
    last_user_reply_at: new Date().toISOString(),
  };
  // Remove the chase/auto-close lifecycle markers so the chase cron starts fresh.
  delete newMeta.chase_sent_at;
  delete newMeta.auto_closed;
  delete newMeta.auto_closed_at;

  await supabase
    .from('support_tickets')
    .update({
      status: 'open',
      assigned_to: null,
      metadata: newMeta,
      updated_at: new Date().toISOString(),
    })
    .eq('id', ticket.id);

  // Audit row.
  await supabase.from('business_log').insert({
    category: 'info',
    title: `User replied on ${ticket.ticket_number || ticket.id.slice(0, 8)} — ticket re-opened`,
    content: `From: ${fromEmail}\nReply excerpt: ${bodyText.slice(0, 500)}\nTicket re-opened for Riley to re-engage on next 15-min cron.`,
    created_by: AGENT_ID,
  });

  return NextResponse.json({
    ok: true,
    matched: true,
    ticket_id: ticket.id,
    ticket_number: ticket.ticket_number,
    new_status: 'open',
  });
}

export async function POST(req: NextRequest) {
  return handle(req);
}

// GET is a no-op health check for Resend webhook verification.
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: 'resend-inbound',
    note: 'POST email webhooks here. Sign with Resend webhook secret or use Bearer CRON_SECRET for testing.',
  });
}
