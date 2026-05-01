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

console.log('\nAll tests passed.');
