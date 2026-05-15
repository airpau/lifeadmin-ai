/**
 * Local email preview server.
 *
 * Run:   npx tsx scripts/preview-emails.ts
 * Open:  http://localhost:4000
 *
 * Renders every canonical-layout variant + every catalogued template into a
 * single page so you can eyeball the design before deploying. No Resend calls
 * are made — this is pure HTML rendering.
 */

import http from 'node:http';
import {
  renderPaybackerEmail,
  card,
  callout,
  paragraph,
  orderedList,
  unorderedList,
  monospaceBlock,
  divider,
} from '../src/lib/email/PaybackerEmailLayout';

interface Sample {
  id: string;
  label: string;
  html: string;
}

const SAMPLES: Sample[] = [
  {
    id: 'first-letter',
    label: 'Onboarding — Day 2 first complaint letter',
    html: renderPaybackerEmail({
      preheader: 'Your first complaint letter takes 30 seconds',
      heading: 'Write your first complaint letter, Paul',
      intro:
        'The most common complaints on Paybacker are energy overcharges, broadband price rises, and unexpected subscription renewals. Here is exactly how it works.',
      body: [
        card(
          orderedList([
            'Go to <strong>Complaints</strong> in your dashboard',
            'Type the company name and describe the issue in your own words',
            "Paybacker's AI writes a professional letter citing the exact UK legislation",
            'Copy it, tweak it if you want, and send it from your email',
          ]),
          { eyebrow: 'How it works' },
        ),
        callout(
          'Real example',
          '<strong>Issue:</strong> Energy supplier raised direct debit by £42 without proper notice.<br/><strong>Paybacker generated:</strong> Formal complaint citing Ofgem Standards of Conduct and Consumer Rights Act 2015 s.49-50.<br/><strong>Typical result:</strong> Refund, credit, or return to original tariff within 8 weeks.',
        ),
        paragraph("You don't need to know any law. Just describe what happened and Paybacker handles the rest."),
      ].join('\n'),
      cta: { label: 'Write your first letter', href: 'https://paybacker.co.uk/dashboard/complaints' },
      footnote:
        'Free accounts include 3 letters per month. <a href="https://paybacker.co.uk/pricing" style="color:#059669;">Upgrade for unlimited</a>.',
    }),
  },
  {
    id: 'dispute-escalation',
    label: 'Dispute reminder — escalation due',
    html: renderPaybackerEmail({
      preheader: 'Your Octopus dispute is 56 days old',
      heading: "It's time to escalate your dispute, Paul",
      intro: 'Your dispute with <strong>Octopus Energy</strong> (£42.00) has been open for 56 days.',
      body: [
        callout(
          'Your consumer rights',
          'Under UK consumer law, if a company has not resolved your complaint within 8 weeks (56 days), you have the right to escalate to the relevant ombudsman free of charge.',
          'danger',
        ),
        paragraph('The ombudsman has the power to force companies to refund, pay compensation, and issue official apologies.'),
      ].join('\n'),
      cta: { label: 'Draft escalation letter', href: 'https://paybacker.co.uk/dashboard/complaints/123' },
    }),
  },
  {
    id: 'letter-delivery',
    label: 'Letter delivery (letter variant — body verbatim)',
    html: renderPaybackerEmail({
      preheader: 'Your draft letter is ready to copy',
      heading: 'Your draft letter is ready',
      body: monospaceBlock(`Dear Octopus Energy,

I am writing to formally complain about the unannounced direct-debit increase
of £42 applied to my account on 12 April 2026. Under section 49-50 of the
Consumer Rights Act 2015, services must be provided with reasonable care and
skill, and material price changes require proper notice in line with Ofgem
Standards of Conduct.

I require a full refund of the over-charged amount within 14 days...`),
      variant: 'letter',
    }),
  },
  {
    id: 'nurture-discount',
    label: 'Consumer nurture — 10% discount (marketing variant)',
    html: renderPaybackerEmail({
      preheader: 'Here is 10% off your first month',
      heading: 'Hi Paul — a small thank-you',
      intro:
        "We don't normally do discounts, but you've been on our list for a few days and we'd love to have you on board. Here's <strong>10% off your first month of Essential</strong>:",
      body: [
        `<div style="background:#0B1220;color:#FFFFFF;border-radius:12px;padding:18px 24px;margin:20px 0;text-align:center;font-family:Menlo,Monaco,Consolas,monospace;font-size:22px;font-weight:700;letter-spacing:2px;">WELCOME10-A1B2C3</div>`,
        paragraph('Paste this code on the checkout page. Expires 8 May.', { muted: true }),
      ].join('\n'),
      cta: { label: 'Redeem 10% off', href: 'https://paybacker.co.uk/pricing' },
      variant: 'marketing',
      unsubscribeUrl: 'https://paybacker.co.uk/api/unsubscribe?token=preview',
    }),
  },
  {
    id: 'b2b-key',
    label: 'B2B — API key delivery',
    html: renderPaybackerEmail({
      preheader: 'Your Growth-tier API key is ready',
      heading: 'Your Growth-tier API key is provisioned',
      intro: 'Use the bearer token below for the next 30 minutes — this view is single-use.',
      body: [
        card(
          paragraph(
            '<code style="font-family:Menlo,Monaco,Consolas,monospace;background:#0B1220;color:#10B981;padding:8px 12px;border-radius:8px;font-size:13px;">pbk_a1b2c3d4_********************************</code>',
          ),
          { eyebrow: 'Bearer token' },
        ),
        divider(),
        paragraph('Quickstart:'),
        unorderedList([
          'POST <code>https://paybacker.co.uk/api/v1/disputes</code> with bearer auth',
          'Returns cited statute, regulator, draft letter — single call',
          'Rate-limited to 10k calls/month on Growth',
        ]),
      ].join('\n'),
      cta: { label: 'Open the docs', href: 'https://paybacker.co.uk/for-business/docs' },
      variant: 'b2b',
    }),
  },
];

const PORT = Number(process.env.PORT || 4000);

const server = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://localhost:${PORT}`);
  if (url.pathname === '/') {
    const links = SAMPLES.map(
      (s) => `<li><a href="/sample/${encodeURIComponent(s.id)}">${s.label}</a></li>`,
    ).join('');
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html>
<html><body style="font-family:system-ui;padding:32px;max-width:700px;margin:0 auto;">
  <h1>Paybacker email preview</h1>
  <p>Each link renders one canonical-layout variant. All emails in production use this same layout.</p>
  <ul style="line-height:2;">${links}</ul>
</body></html>`);
    return;
  }
  const m = url.pathname.match(/^\/sample\/(.+)$/);
  if (m) {
    const sample = SAMPLES.find((s) => s.id === decodeURIComponent(m[1]));
    if (!sample) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(sample.html);
    return;
  }
  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Email preview server: http://localhost:${PORT}`);
  console.log(`Samples:`);
  for (const s of SAMPLES) console.log(`  /sample/${s.id}  —  ${s.label}`);
});
