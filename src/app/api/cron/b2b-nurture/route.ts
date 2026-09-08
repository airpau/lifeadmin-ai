/**
 * /api/cron/b2b-nurture — drip emails for B2B leads who haven't converted.
 *
 * Schedule: daily 10:00 UTC (registered in vercel.json). Picks up rows in
 * b2b_waitlist that haven't moved to 'converted' yet and sends a single
 * email at the right interval (day 1, day 3, day 7, day 14). Tracks
 * last-sent in `notes` so a row never receives the same nudge twice. Stops
 * nurturing after the day-14 nudge, once status is 'converted' /
 * 'rejected', or as soon as the lead opts out.
 *
 * The nurture targets:
 *   - status = 'checkout_started' or 'checkout_abandoned' (high-intent)
 *   - status = 'new' (form-only signups, lower intent — gentler tone)
 *
 * These are marketing sends, so they go through `sendPaybackerEmail` with
 * `variant: 'marketing'` rather than calling Resend directly. That is what
 * gets them a tokenised one-click unsubscribe (footer link + RFC 8058
 * List-Unsubscribe headers) and the receiving-enabled B2B Reply-To. Both
 * were missing while this route talked to Resend itself: every nurture
 * email invites a reply, and replies to the apex `business@paybacker.co.uk`
 * are silently dropped because that domain is send-only in Resend.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authorizeAdminOrCron } from '@/lib/admin-auth';
import { sendPaybackerEmail } from '@/lib/email/send';
import { paragraph, unorderedList, type EmailCta } from '@/lib/email/PaybackerEmailLayout';

export const runtime = 'nodejs';
export const maxDuration = 60;

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';

function unsubUrl(token: string): string {
  return `${SITE}/api/unsubscribe?kind=b2b_lead&token=${encodeURIComponent(token)}`;
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
  unsubscribe_token: string;
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

  const { body, cta, preheader } = ((): { body: string; cta?: EmailCta; preheader: string } => {
    if (windowKey === 'd1') {
      return {
        preheader: 'The Starter pilot is free — 1,000 calls a month, no card.',
        body: [
          paragraph(`I saw you started a ${escape(tier)} checkout and didn't finish — totally understand if the timing wasn't right.`),
          paragraph('If <strong>price</strong> was the blocker, the <strong>Starter pilot is free</strong>: 1,000 calls/month, no card, key by email in seconds.'),
          paragraph(`If you want to go straight to ${escape(tier)}, the link is still warm.`),
          paragraph('Reply with anything — questions, edge cases, "not now" — and I\'ll get back to you within a working day.'),
        ].join(''),
        cta: { label: 'Finish your checkout', href: 'https://paybacker.co.uk/for-business#buy' },
      };
    }
    if (windowKey === 'd3') {
      return {
        preheader: 'A 14-day extended pilot, if paying upfront is the blocker.',
        body: [
          paragraph('Quick follow-up: a few CX teams have asked us for a <strong>14-day extended pilot</strong> instead of paying upfront. If that\'s a better fit, reply and I\'ll set you up.'),
          paragraph("What's holding it up?"),
          unorderedList([
            '<strong>Price</strong> — start on Starter (free, 1,000 calls/mo) and upgrade once it pays back',
            '<strong>Approval</strong> — happy to send a one-pager you can forward internally',
            '<strong>Coverage</strong> — every UK statute we cite is listed on the coverage page',
          ]),
        ].join(''),
        cta: { label: 'See statute coverage', href: 'https://paybacker.co.uk/for-business/coverage' },
      };
    }
    if (windowKey === 'd7') {
      return {
        preheader: 'Median 2.4s on /v1/disputes, 98% citation accuracy.',
        body: [
          paragraph('One week in — a few quick numbers from teams that did pull the trigger:'),
          unorderedList([
            'Median latency on /v1/disputes: <strong>2.4 seconds</strong>',
            'Statute citation accuracy on the test set: <strong>98%</strong> (zero hallucinated acts)',
            'Most-called sectors so far: energy back-billing, Section 75, broadband mid-contract rises',
          ]),
          paragraph('If your team handles UK consumer disputes at any volume, the free Starter pilot is the lowest-friction way to see if it slots into your CX flow.'),
        ].join(''),
        cta: { label: 'Start the free pilot', href: 'https://paybacker.co.uk/for-business' },
      };
    }
    return {
      preheader: "Last note — I won't keep emailing.",
      body: [
        paragraph("I won't keep emailing — I know inbox space is precious."),
        paragraph("If something changes and you'd like a key, the door is open."),
        paragraph("If we're not the right fit, no hard feelings. Best of luck with what you're building."),
      ].join(''),
      cta: { label: 'Paybacker for Business', href: 'https://paybacker.co.uk/for-business' },
    };
  })();

  return {
    subject,
    preheader,
    heading: `Hi ${escape(lead.name?.split(' ')[0] || 'there')},`,
    body,
    cta,
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
    .select('id, name, work_email, company, status, intended_tier, notes, created_at, unsubscribe_token')
    .in('status', ['new', 'checkout_started', 'checkout_abandoned'])
    .is('unsubscribed_at', null)
    .gte('created_at', new Date(Date.now() - 21 * 86_400_000).toISOString());
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  const skipped: Array<{ id: string; reason: string }> = [];

  for (const lead of (data ?? []) as Lead[]) {
    const age = ageInDays(lead.created_at);
    const sentSet = parseSent(lead.notes);
    const win = pickWindow(age, sentSet);
    if (!win) { skipped.push({ id: lead.id, reason: 'no due window' }); continue; }

    // A lead with no token predates the unsubscribe migration. Skip rather
    // than send: sendPaybackerEmail would throw MissingUnsubscribeUrlError
    // and a marketing email with no opt-out is exactly what we must not send.
    if (!lead.unsubscribe_token) {
      skipped.push({ id: lead.id, reason: 'no unsubscribe token' });
      continue;
    }

    const email = buildEmail(lead, win.key);
    const result = await sendPaybackerEmail({
      to: lead.work_email,
      audience: 'b2b',
      variant: 'marketing',
      unsubscribeUrl: unsubUrl(lead.unsubscribe_token),
      subject: email.subject,
      preheader: email.preheader,
      heading: email.heading,
      body: email.body,
      cta: email.cta,
      tags: [{ name: 'campaign', value: `b2b_nurture_${win.key}` }],
    });

    if (!result.ok) {
      skipped.push({ id: lead.id, reason: result.error || 'send failed' });
      continue;
    }

    // Only tag the row once the send actually succeeded — tagging on a
    // failed send would burn the window and the lead would never get it.
    const tag = `[nurture:${win.key}]`;
    const newNotes = lead.notes ? `${lead.notes} ${tag}` : tag;
    await supabase.from('b2b_waitlist')
      .update({ notes: newNotes })
      .eq('id', lead.id);
    sent++;
  }

  return NextResponse.json({ ok: true, sent, skipped, considered: data?.length ?? 0 });
}
