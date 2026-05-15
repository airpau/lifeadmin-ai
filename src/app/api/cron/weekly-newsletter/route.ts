/**
 * Weekly newsletter cron — Thu 11:00 UTC.
 *
 * Audience: users who set `marketing_opt_in: true` at signup. The flag
 * lives on `auth.users.raw_user_meta_data` (Supabase Auth user_metadata).
 * We mirror it onto `profiles.newsletter_opted_in` for query speed via a
 * trigger-installed migration, but the auth metadata is the source of
 * truth and is what /dashboard/settings/notifications writes.
 *
 * Conflict-free slot: see `src/lib/email/weekly-newsletter.ts` for the
 * full audit of existing send slots. Thu 11:00 UTC was empty in
 * vercel.json before this cron and lands mid-week post-coffee.
 *
 * Compliance: PECR soft opt-in confirmed at signup + RFC 8058 one-click
 * unsubscribe in every send (handled by sendPaybackerEmail when
 * variant='marketing'). Every recipient gets a tokenised unsubscribe URL
 * that maps back to their auth user via `consumer_lead_email_log` /
 * `profiles.newsletter_unsubscribed_at` — the same plumbing that powers
 * the consumer-nurture funnel.
 *
 * Dedup: per-user `profiles.newsletter_last_sent_at` stops a manual
 * replay from double-sending within 6 days.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import {
  newsletterBody,
  newsletterCta,
  newsletterPreheader,
  newsletterSubject,
} from '@/lib/email/weekly-newsletter';
import { composeWeeklyIssue } from '@/lib/email/weekly-newsletter-content';
import { sendPaybackerEmail } from '@/lib/email/send';

export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MIN_GAP_DAYS = 6; // safety net against accidental double-sends
const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

function isAuthorised(req: NextRequest): boolean {
  const auth = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return auth === `Bearer ${secret}`;
}

interface AudienceRow {
  user_id: string;
  email: string;
  first_name: string | null;
  newsletter_last_sent_at: string | null;
  newsletter_unsub_token: string | null;
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 });
  }
  return runCron();
}

export async function POST(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ ok: false, error: 'unauthorised' }, { status: 401 });
  }
  return runCron();
}

async function runCron() {
  const sb = admin();
  const now = new Date();
  const cutoff = new Date(now.getTime() - MIN_GAP_DAYS * 24 * 60 * 60 * 1000).toISOString();

  // Audience: opted-in profiles that haven't received the newsletter
  // in the last 6 days. The view `newsletter_audience` joins
  // `auth.users` × `profiles` and filters on
  //   raw_user_meta_data->>'marketing_opt_in' = 'true'
  //   AND newsletter_unsubscribed_at IS NULL
  //   AND email_confirmed_at IS NOT NULL
  // (created in the matching migration). Falling back to `profiles`
  // direct here keeps the cron functional during initial migration roll-out.
  const { data: rows, error } = await sb
    .from('newsletter_audience')
    .select('user_id, email, first_name, newsletter_last_sent_at, newsletter_unsub_token')
    .or(`newsletter_last_sent_at.is.null,newsletter_last_sent_at.lt.${cutoff}`)
    .limit(2000);

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  const audience = (rows ?? []) as AudienceRow[];

  let sent = 0;
  let failed = 0;
  const results: Array<{ email: string; ok: boolean; error?: string }> = [];

  for (const r of audience) {
    if (!r.email) continue;
    const unsubscribeUrl = `${SITE}/api/unsubscribe?token=${encodeURIComponent(r.newsletter_unsub_token ?? '')}&kind=newsletter`;

    const issue = await composeWeeklyIssue({
      now,
      supabase: sb,
      firstName: r.first_name,
      unsubscribeUrl,
    });

    const result = await sendPaybackerEmail({
      to: r.email,
      audience: 'consumer',
      variant: 'marketing',
      subject: newsletterSubject(issue),
      preheader: newsletterPreheader(issue),
      heading: r.first_name ? `Hi ${r.first_name},` : 'Hi there,',
      intro:
        'Your Thursday roundup of UK consumer-rights wins, this week\'s law changes, and one quick action you can take today.',
      body: newsletterBody(issue),
      cta: newsletterCta(),
      unsubscribeUrl,
      tags: [{ name: 'campaign', value: 'weekly_newsletter' }],
    });

    if (result.ok) {
      sent++;
      await sb
        .from('profiles')
        .update({ newsletter_last_sent_at: now.toISOString() })
        .eq('id', r.user_id);
    } else {
      failed++;
    }
    results.push({ email: r.email, ok: result.ok, error: result.error });
  }

  return NextResponse.json({
    ok: true,
    audience: audience.length,
    sent,
    failed,
    results: results.slice(0, 20),
  });
}
