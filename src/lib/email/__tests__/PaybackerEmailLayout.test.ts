/**
 * Snapshot-style smoke tests for the canonical layout.
 * Run with: npx tsx src/lib/email/__tests__/PaybackerEmailLayout.test.ts
 *
 * Asserts only structural invariants (chrome, slots, letter-mode carve-out)
 * to avoid brittle full-string comparisons.
 */

import {
  renderPaybackerEmail,
  card,
  paragraph,
  orderedList,
  monospaceBlock,
} from '../PaybackerEmailLayout';
import { sendPaybackerEmail, MissingUnsubscribeUrlError } from '../send';

function assert(cond: unknown, msg: string): void {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
  console.log('  ok —', msg);
}

console.log('Test: standard variant (heading + intro + card + CTA)');
{
  const html = renderPaybackerEmail({
    preheader: 'Welcome to Paybacker',
    heading: 'Write your first complaint letter, Paul',
    intro: 'Most UK households are owed money. Here is how Paybacker helps you claim it.',
    body: card(orderedList(['Open the dashboard', 'Describe the issue', 'Send the letter']), {
      eyebrow: 'How it works',
    }),
    cta: { label: 'Go to dashboard', href: 'https://paybacker.co.uk/dashboard' },
  });
  assert(html.includes('Pay<span'), 'logo wordmark present');
  assert(html.includes('Write your first complaint letter, Paul'), 'heading rendered');
  assert(html.includes('How it works'), 'eyebrow rendered');
  assert(html.includes('Go to dashboard'), 'CTA label rendered');
  assert(html.includes('Paybacker LTD'), 'footer present');
  assert(html.includes('mailto:support@paybacker.co.uk'), 'consumer unsubscribe link present');
  assert(!html.includes('class='), 'no class attributes (must be inline)');
}

console.log('Test: letter variant (chrome + verbatim body, no extra preamble)');
{
  const letterText = 'Dear Sir/Madam,\n\nI am writing to complain about charges of £42...';
  const html = renderPaybackerEmail({
    preheader: 'Your draft letter',
    heading: 'Your draft letter is ready',
    body: monospaceBlock(letterText),
    variant: 'letter',
    cta: { label: 'IGNORED IN LETTER MODE', href: 'https://x' }, // must NOT appear
  });
  assert(html.includes('Your draft letter is ready'), 'heading still rendered in letter mode');
  assert(html.includes('Dear Sir/Madam'), 'verbatim letter body included');
  assert(!html.includes('IGNORED IN LETTER MODE'), 'CTA suppressed in letter mode');
  assert(html.includes('Paybacker LTD'), 'footer chrome still present');
}

console.log('Test: marketing variant (one-click unsubscribe in footer)');
{
  const html = renderPaybackerEmail({
    preheader: 'A small thank-you',
    heading: 'Here is 10% off',
    body: paragraph('A friendly nudge.'),
    variant: 'marketing',
    unsubscribeUrl: 'https://paybacker.co.uk/api/unsubscribe?token=abc',
  });
  assert(html.includes('Unsubscribe in one click'), 'one-click unsub copy in marketing footer');
  assert(html.includes('token=abc'), 'unsub URL piped through');
}

console.log('Test: b2b variant (different audience copy)');
{
  const html = renderPaybackerEmail({
    preheader: 'Your API key is ready',
    heading: 'Your Growth-tier API key is provisioned',
    body: paragraph('Bearer tokens never expire automatically.'),
    variant: 'b2b',
  });
  assert(html.includes('UK Consumer Rights API'), 'b2b tagline rendered');
  assert(html.includes('business@paybacker.co.uk'), 'b2b reply address in footer');
}

console.log('Test: marketing footer renders supplied unsubscribeUrl verbatim (no /unsubscribe fallback)');
{
  const tokenisedUrl = 'https://paybacker.co.uk/api/unsubscribe?token=tok_abc123';
  const html = renderPaybackerEmail({
    preheader: 'Marketing nudge',
    heading: 'A small thank-you',
    body: paragraph('A friendly nudge.'),
    variant: 'marketing',
    unsubscribeUrl: tokenisedUrl,
  });
  assert(html.includes(`href="${tokenisedUrl}"`), 'footer href is the tokenised /api/unsubscribe URL verbatim');
  // Status page fallback must NEVER appear in the footer for a marketing send.
  // The bare `/unsubscribe` (status page) has no token and silently breaks one-click.
  assert(!html.includes('href="https://paybacker.co.uk/unsubscribe"'), 'no fallback to bare /unsubscribe status page');
  assert(!html.includes("href=\"https://paybacker.co.uk/unsubscribe\""), 'no fallback double-quoted variant');
}

console.log('Test: marketing variant render WITHOUT unsubscribeUrl throws');
{
  let threw = false;
  try {
    renderPaybackerEmail({
      preheader: 'Marketing nudge',
      heading: 'A small thank-you',
      body: paragraph('A friendly nudge.'),
      variant: 'marketing',
      // unsubscribeUrl intentionally omitted
    });
  } catch {
    threw = true;
  }
  assert(threw, 'renderPaybackerEmail throws for marketing variant without unsubscribeUrl');
}

async function testSendThrowsOnMissingUnsubUrl(): Promise<void> {
  console.log('Test: sendPaybackerEmail rejects marketing variant without unsubscribeUrl');
  let caught: unknown;
  try {
    await sendPaybackerEmail({
      to: 'someone@example.com',
      subject: 'Test marketing',
      preheader: 'pre',
      heading: 'Hello',
      body: paragraph('body'),
      variant: 'marketing',
      // unsubscribeUrl deliberately missing
    });
  } catch (err) {
    caught = err;
  }
  assert(caught instanceof MissingUnsubscribeUrlError, 'throws typed MissingUnsubscribeUrlError');
}

testSendThrowsOnMissingUnsubUrl().then(
  () => {
    console.log('\nAll tests passed.');
  },
  (err) => {
    console.error('FAIL (async):', err);
    process.exit(1);
  },
);
