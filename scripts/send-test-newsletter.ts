/**
 * Sends a one-off test version of the weekly newsletter to the founder
 * inbox so we can review the layout + content before going live.
 *
 * Run with:
 *   npx tsx scripts/send-test-newsletter.ts [--to=email@host]
 *
 * Defaults to aireypaul@googlemail.com. Loads RESEND_API_KEY from
 * .env.local. Renders the canonical PaybackerEmailLayout HTML directly
 * and posts to Resend — bypasses the `@/` alias chain that tsx (run
 * outside Next) wouldn't resolve.
 *
 * No DB writes. Re-runs are safe.
 */

import { config } from 'dotenv';
config({ path: '.env.local' });

import { Resend } from 'resend';
import { renderPaybackerEmail } from '../src/lib/email/PaybackerEmailLayout';
import {
  newsletterBody,
  newsletterCta,
  newsletterPreheader,
  newsletterSubject,
} from '../src/lib/email/weekly-newsletter';
import { composeWeeklyIssue } from '../src/lib/email/weekly-newsletter-content';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';

function pickArg(name: string, fallback: string): string {
  const flag = process.argv.find((a) => a.startsWith(`--${name}=`));
  return flag ? flag.split('=', 2)[1] : fallback;
}

async function main() {
  const to = pickArg('to', 'aireypaul@googlemail.com');
  const firstName = pickArg('first-name', 'Paul');

  if (!process.env.RESEND_API_KEY) {
    console.error('ERROR: RESEND_API_KEY not set. Add to .env.local.');
    process.exit(1);
  }

  const unsubscribeUrl = `${SITE}/api/unsubscribe?token=test-mode&kind=newsletter`;

  const issue = await composeWeeklyIssue({
    firstName,
    unsubscribeUrl,
  });

  const html = renderPaybackerEmail({
    preheader: newsletterPreheader(issue),
    heading: `Hi ${firstName},`,
    intro:
      "Your Thursday roundup of UK consumer-rights wins, this week's law changes, and one quick action you can take today. (This is a TEST send — production goes out every Thursday at 11:00 UTC to opted-in users only.)",
    body: newsletterBody(issue),
    cta: newsletterCta(),
    variant: 'marketing',
    unsubscribeUrl,
  });

  const resend = new Resend(process.env.RESEND_API_KEY);
  const subject = `[TEST] ${newsletterSubject(issue)}`;
  const result = await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'Paybacker <noreply@paybacker.co.uk>',
    to,
    replyTo: 'support@mail.paybacker.co.uk',
    subject,
    html,
    headers: {
      'List-Unsubscribe': `<${unsubscribeUrl}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
    tags: [{ name: 'campaign', value: 'weekly_newsletter_test' }],
  });

  const err = (result as { error?: { message?: string } }).error;
  if (err) {
    console.error('Send failed:', err.message);
    process.exit(1);
  }
  const messageId = (result as { data?: { id?: string } }).data?.id;
  console.log(`✓ Sent to ${to} — Resend message id: ${messageId}`);
  console.log(`  Subject: ${subject}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
