/**
 * /api/cron/b2b-nurture — drip emails for B2B leads who haven't converted.
 *
 * Schedule: hourly. Picks up rows in b2b_waitlist that haven't moved to
 * 'converted' yet and sends a single email at the right interval (day 1,
 * day 3, day 7, day 14). Tracks last-sent in `notes` so a row never
 * receives the same nudge twice. Stops nurturing after day-14 nudge or
 * once status is 'converted' / 'rejected'.
 *
 * The nurture targets:
 *   - status = 'checkout_started' or 'checkout_abandoned' (high-intent)
 *   - status = 'new' (form-only signups, lower intent — gentler tone)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { resend } from '@/lib/resend';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

interface Lead {
  id: string;
  name: string;
  work_email: string;
  company: string;
  status: string;
  intended_tier: string | null;
  notes: string | null;
  created_at: string;
}

const NURTURE_WINDOWS = [
  { day: 1, key: 'd1' },
  { day: 3, key: 'd3' },
  { day: 7, key: 'd7' },
  { day: 14, key: 'd14' },
];

function escape(s: string): string {
  return (s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function ageInDays(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

function pickWindow(age: number, sent: Set<string>) {
  // Pick the highest-day window the lead is past AND hasn't received yet.
  for (let i = NURTURE_WINDOWS.length - 1; i >= 0; i--) {
    const w = NURTURE_WINDOWS[i];
    if (age >= w.day && !sent.has(w.key)) return w;
  }
  return null;
}

function buildEmail(lead: Lead, windowKey: string) {
  const isHighIntent = ['checkout_started', 'checkout_abandoned'].includes(lead.status);
  const tier = lead.intended_tier || 'growth';
  const subject = (() => {
    if (windowKey === 'd1') return isHighIntent
      ? `${lead.name?.split(' ')[0] || 'Hi'} — finishing your Paybacker API checkout`
      : `${lead.name?.split(' ')[0] || 'Hi'} — your free pilot key is one click away`;
    if (windowKey === 'd3') return 'A quick offer if Stripe was the blocker';
    if (windowKey === 'd7') return 'Real numbers from week 1 of the API';
    return 'Last note — closing the loop';
  })();

  const body = (() => {
    if (windowKey === 'd1') {
      return `<p>I saw you started a ${escape(tier)} checkout and didn't finish — totally understand if the timing wasn't right.</p>
        <p>If <strong>price</strong> was the blocker, the <strong>Starter pilot is free</strong>: 1,000 calls/month, no card, key by email in seconds.</p>
        <p>If you want to go straight to ${escape(tier)}, the link is still warm: <a href="https://paybacker.co.uk/for-business#buy">paybacker.co.uk/for-business#buy</a></p>
        <p>Reply with anything — questions, edge cases, "not now" — and I'll get back to you within a working day.</p>`;
    }
    if (windowKey === 'd3') {
      return `<p>Quick follow-up: a few CX teams have asked us for a <strong>14-day extended pilot</strong> instead of paying upfront. If that's a better fit, reply and I'll set you up.</p>
        <p>What's holding it up?</p>
        <ul>
          <li><strong>Price</strong> — start on Starter (free, 1,000 calls/mo) and upgrade once it pays back</li>
          <li><strong>Approval</strong> — happy to send a one-pager you can forward internally</li>
          <li><strong>Coverage</strong> — see <a href="https://paybacker.co.uk/for-business/coverage">/for-business/coverage</a> for every UK statute we cite</li>
        </ul>`;
    }
    if (windowKey === 'd7') {
      return `<p>One week in — a few quick numbers from teams that did pull the trigger:</p>
        <ul>
          <li>Median latency on /v1/disputes: <strong>2.4 seconds</strong></li>
          <li>Statute citation accuracy on the test set: <strong>98%</strong> (zero hallucinated acts)</li>
          <li>Most-called sectors so far: energy back-billing, Section 75, broadband mid-contract rises</li>
        </ul>
        <p>If your team handles UK consumer disputes at any volume, the free Starter pilot is the lowest-friction way to see if it slots into your CX flow: <a href="https://paybacker.co.uk/for-business">paybacker.co.uk/for-business</a></p>`;
    }
    return `<p>I won't keep emailing — I know inbox space is precious.</p>
      <p>If something changes and you'd like a key, the door is open: <a href="https://paybacker.co.uk/for-business">paybacker.co.uk/for-business</a>.</p>
      <p>If we're not the right fit, no hard feelings. Best of luck with what you're building.</p>`;
  })();

  return {
    subject,
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:auto;color:#0f172a;">
        <p>Hi ${escape(lead.name?.split(' ')[0] || 'there')},</p>
        ${body}
        <p>— Paul, founder · Paybacker</p>
      </div>`,
  };
}

function parseSent(notes: string | null): Set<string> {
  // We tag sent nudges as "[nurture:dN]" inside notes so a single column
  // tracks both human triage notes and automated history.
  const set = new Set<string>();
  if (!notes) return set;
  const matches = notes.match(/\[nurture:d\d+\]/g) || [];
  matches.forEach((m) => {
    const k = m.slice(9, m.length - 1);
    set.add(k);
  });
  return set;
}

export async function GET(request: NextRequest) {
  const auth = await authorizeAdminOrCron(request);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.reason ?? 'Unauthorized' }, { status: auth.status });
  }
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json({ ok: true, skipped: 'no RESEND_API_KEY' });
  }

  const supabase = getAdmin();
  const { data, error } = await supabase
    .from('b2b_waitlist')
    .select('id, name, work_email, company, status, intended_tier, notes, created_at')
    .in('status', ['new', 'checkout_started', 'checkout_abandoned'])
    .gte('created_at', new Date(Date.now() - 21 * 86_400_000).toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const fromEmail = process.env.B2B_FROM_EMAIL || process.env.RESEND_FROM_EMAIL || 'Paybacker for Business <noreply@paybacker.co.uk>';
  let sent = 0;
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const lead of (data ?? []) as Lead[]) {
    const age = ageInDays(lead.created_at);
    const sentSet = parseSent(lead.notes);
    const win = pickWindow(age, sentSet);
    if (!win) { skipped.push({ id: lead.id, reason: 'no due window' }); continue; }

    const email = buildEmail(lead, win.key);
    try {
      await resend.emails.send({
        from: fromEmail,
        to: lead.work_email,
        replyTo: 'business@paybacker.co.uk',
        subject: email.subject,
        html: email.html,
      });
      const tag = `[nurture:${win.key}]`;
      const newNotes = lead.notes ? `${lead.notes} ${tag}` : tag;
      await supabase.from('b2b_waitlist')
        .update({ notes: newNotes })
        .eq('id', lead.id);
      sent++;
    } catch (e: any) {
      skipped.push({ id: lead.id, reason: e?.message || 'send failed' });
    }
  }

  return NextResponse.json({ ok: true, sent, skipped, considered: data?.length ?? 0 });
}
