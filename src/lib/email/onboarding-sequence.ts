/**
 * Onboarding email sequence — migrated to canonical PaybackerEmailLayout (2026-05-01).
 *
 * Copy is preserved verbatim from the previous hand-rolled version. Visual chrome now
 * comes from `renderPaybackerEmail` so this file ships ZERO inline-style boilerplate.
 */

import { sendPaybackerEmail } from './send';
import {
  renderPaybackerEmail,
  card,
  callout,
  paragraph,
  orderedList,
} from './PaybackerEmailLayout';

export interface OnboardingEmail {
  key: string;
  dayOffset: number;
  subject: string;
  build: (firstName: string) => { preheader: string; heading: string; intro?: string; body: string; cta?: { label: string; href: string }; footnote?: string };
}

const SITE = 'https://paybacker.co.uk';

export const ONBOARDING_SEQUENCE: OnboardingEmail[] = [
  {
    key: 'welcome',
    dayOffset: 0,
    subject: 'Welcome to Paybacker, {{name}} — your money-back toolkit is ready',
    build: (name) => ({
      preheader: 'Your money-back toolkit is ready',
      heading: `Hi ${name}, welcome to Paybacker`,
      intro:
        "You just unlocked a toolkit that most UK consumers don't have. Paybacker uses AI and UK consumer law to help you fight unfair charges, track every subscription, and find cheaper deals.",
      body: [
        paragraph('Here is what you can do right now:'),
        card(
          orderedList([
            "<strong>Connect your bank account</strong><br/><span style=\"color:#6B7280;font-size:14px;\">We'll find every subscription, direct debit, and recurring payment automatically. Read-only, FCA regulated. Takes 30 seconds.</span>",
            '<strong>Write your first complaint letter</strong><br/><span style="color:#6B7280;font-size:14px;">Describe any billing issue in plain English. Our AI writes a professional letter citing the exact UK law that protects you.</span>',
            '<strong>Browse 53+ deals</strong><br/><span style="color:#6B7280;font-size:14px;">Compare energy, broadband, mobile, insurance, mortgages, and loans from verified UK providers. Free to browse.</span>',
          ]),
          { eyebrow: 'Get started' },
        ),
        callout(
          'Did you know?',
          'The average UK household overpays by over £1,000 per year on bills, subscriptions, and contracts they could challenge or switch.',
        ),
        paragraph('Questions? Just reply to this email. I read every one.'),
        paragraph('Paul, Founder'),
      ].join('\n'),
      cta: { label: 'Go to your dashboard', href: `${SITE}/dashboard` },
    }),
  },
  {
    key: 'day2_first_value',
    dayOffset: 2,
    subject: 'Your first complaint letter takes 30 seconds',
    build: (name) => ({
      preheader: 'How to write your first complaint letter in 30 seconds',
      heading: `Write your first complaint letter, ${name}`,
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
          '<strong>Issue:</strong> Energy supplier raised direct debit by £42 without proper notice.<br/><strong>Paybacker generated:</strong> Formal complaint citing Ofgem Standards of Conduct and Consumer Rights Act 2015 s.49-50.<br/><strong>Typical result:</strong> Refund, credit, or return to original tariff within 8 weeks, or the right to escalate to the Energy Ombudsman.',
        ),
        paragraph("You don't need to know any law. Just describe what happened and Paybacker handles the rest."),
      ].join('\n'),
      cta: { label: 'Write your first letter', href: `${SITE}/dashboard/complaints` },
      footnote:
        'Free accounts include 3 letters per month. <a href="' + SITE + '/pricing" style="color:#059669;">Upgrade for unlimited</a>.',
    }),
  },
  {
    key: 'day4_social_proof',
    dayOffset: 4,
    subject: 'UK consumers are owed billions — here is what you can claim',
    build: (name) => ({
      preheader: 'Three things worth checking today',
      heading: `You might be owed money right now, ${name}`,
      intro:
        "Most UK consumers don't realise how much money they're leaving on the table. Here are three things worth checking today.",
      body: [
        callout(
          'Flight delays — up to £520 per person',
          'Under UK261 regulations, if your flight was delayed over 3 hours in the last 6 years, you could be owed compensation. Paybacker writes the claim letter for you.',
        ),
        callout(
          'Broadband mid-contract price rises — free exit',
          'Ofcom rules mean if your broadband provider raises prices mid-contract without telling you upfront, you can leave penalty-free.',
        ),
        callout(
          'Energy credit balances — your money back',
          "If you've switched energy suppliers, your old provider must refund any credit balance within 10 working days. If they haven't, that's a valid complaint.",
        ),
      ].join('\n'),
      cta: { label: "Check what you're owed", href: `${SITE}/dashboard/complaints` },
    }),
  },
  {
    key: 'day7_features',
    dayOffset: 7,
    subject: 'Have you tried these yet, {{name}}?',
    build: (name) => ({
      preheader: 'Four features most people miss in week one',
      heading: `One week in. Here is what most people miss, ${name}.`,
      intro:
        "You've had Paybacker for a week. Here are the features that save the most money — and most people haven't tried them all yet.",
      body: [
        callout('Bank Connection', 'Connect your bank and Paybacker finds every subscription, direct debit, and recurring payment.'),
        callout('Spending Intelligence', 'See where your money goes each month, broken down by category. Set budgets and get alerts.'),
        callout('Disputes for Everything', 'HMRC tax rebates, council tax challenges, DVLA issues, NHS complaints, parking appeals.'),
        callout('Savings Challenges', "Try \"No Takeaways for 7 Days\" — Paybacker verifies progress using your bank data and awards loyalty points."),
        callout('AI Chatbot', 'Ask anything about UK consumer rights, your spending, or your subscriptions. Look for the chat bubble on any page.'),
        paragraph("Reply and tell me what you've found so far. Every bit of feedback shapes what we build next."),
        paragraph('Paul'),
      ].join('\n'),
      cta: { label: 'Explore your dashboard', href: `${SITE}/dashboard` },
    }),
  },
  {
    key: 'day10_upgrade',
    dayOffset: 10,
    subject: 'Unlock unlimited with Essential — £4.99/month',
    build: (name) => ({
      preheader: 'Ready for unlimited letters and daily auto-sync?',
      heading: `Ready for more, ${name}?`,
      intro:
        "Free accounts include 3 complaint letters per month and a one-time bank scan. If you've seen the value, the Essential plan unlocks everything.",
      body: [
        card(
          `<p style="margin:0;color:#0B1220;font-size:32px;font-weight:800;text-align:center;">£4.99<span style="color:#6B7280;font-size:14px;font-weight:400;">/month</span></p>`,
          { eyebrow: 'Essential plan' },
        ),
        card(
          orderedList([
            '<strong>Unlimited</strong> AI complaint and form letters',
            '<strong>3 bank accounts</strong> with daily auto-sync',
            '<strong>Monthly</strong> email and opportunity re-scans',
            '<strong>Full</strong> spending intelligence dashboard',
            'Cancellation emails citing UK consumer law',
            'Renewal reminders at 30, 14, and 7 days',
            'Contract end date tracking',
          ]),
          { eyebrow: "What's included" },
        ),
        paragraph('At the average complaint success rate, one letter pays for a year of Essential.'),
      ].join('\n'),
      cta: { label: 'Upgrade to Essential', href: `${SITE}/pricing` },
      footnote: 'Cancel anytime. No lock-in. Your data stays safe either way.',
    }),
  },
];

export async function sendOnboardingEmail(
  email: string,
  firstName: string,
  key: string,
): Promise<boolean> {
  const template = ONBOARDING_SEQUENCE.find((s) => s.key === key);
  if (!template) return false;
  const name = firstName || 'there';
  const built = template.build(name);
  const result = await sendPaybackerEmail({
    to: email,
    subject: template.subject.replace('{{name}}', name).replace('${name}', name),
    ...built,
  });
  if (!result.ok) {
    console.error(`Onboarding email ${key} failed for ${email}:`, result.error);
    return false;
  }
  return true;
}

/** Back-compat shim: callers that used the old `template.html(name)` API. */
export function renderOnboardingHtml(key: string, firstName: string): string | null {
  const template = ONBOARDING_SEQUENCE.find((s) => s.key === key);
  if (!template) return null;
  const built = template.build(firstName || 'there');
  return renderPaybackerEmail(built);
}
