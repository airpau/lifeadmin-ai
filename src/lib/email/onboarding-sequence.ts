import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import { renderEmail, emailStyles as s, emailTokens as t } from './layout';

export interface OnboardingEmail {
  key: string;
  dayOffset: number;
  subject: string;
  preheader: string;
  body: (firstName: string) => string;
}

export const ONBOARDING_SEQUENCE: OnboardingEmail[] = [
  // Day 0: Welcome
  {
    key: 'welcome',
    dayOffset: 0,
    subject: 'Welcome to Paybacker, {{name}} — your money-back toolkit is ready',
    preheader: 'Three first steps: connect a bank, write your first letter, browse deals.',
    body: (name) => `
<h1 style="${s.h1}">Hi ${name}, welcome to Paybacker</h1>
<p style="${s.p}">You just unlocked a toolkit most UK consumers don't have. Paybacker uses AI and UK consumer law to help you fight unfair charges, track every subscription, and find cheaper deals.</p>

<p style="${s.p}">Here's what you can do right now:</p>

<div style="${s.box}">
  <p style="margin:0 0 16px;"><span style="${s.stepNum}">1</span><strong style="${s.strong};font-size:15px;">Connect your bank account</strong></p>
  <p style="color:${t.textMuted};margin:0 0 20px;font-size:14px;padding-left:38px;line-height:1.55;">We'll find every subscription, direct debit, and recurring payment automatically. Read-only, FCA-regulated via Yapily. Takes 30 seconds.</p>

  <p style="margin:0 0 16px;"><span style="${s.stepNum}">2</span><strong style="${s.strong};font-size:15px;">Write your first complaint letter</strong></p>
  <p style="color:${t.textMuted};margin:0 0 20px;font-size:14px;padding-left:38px;line-height:1.55;">Describe any billing issue in plain English. Our AI writes a professional letter citing the exact UK law that protects you — energy, broadband, flights, debt, parking, council tax, HMRC and more.</p>

  <p style="margin:0 0 16px;"><span style="${s.stepNum}">3</span><strong style="${s.strong};font-size:15px;">Browse deals</strong></p>
  <p style="color:${t.textMuted};margin:0;font-size:14px;padding-left:38px;line-height:1.55;">Compare energy, broadband, mobile, insurance, mortgages and loans from verified UK providers. Free to browse, no signup needed.</p>
</div>

<div style="text-align:center;margin:28px 0;">
  <a href="https://paybacker.co.uk/dashboard" style="${s.cta}">Go to your dashboard</a>
</div>

<div style="${s.tipBox}">
  <p style="color:${t.mintDeep};font-weight:700;margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Did you know?</p>
  <p style="color:${t.textStrong};margin:0;font-size:14px;line-height:1.6;">The average UK household overpays by over £1,000 per year on bills, subscriptions and contracts they could challenge or switch. Paybacker helps you find and recover that money.</p>
</div>

<p style="${s.p}">Questions? Just reply to this email — I read every one.</p>
<p style="${s.p}">Paul, Founder</p>
`,
  },

  // Day 2: First value
  {
    key: 'day2_first_value',
    dayOffset: 2,
    subject: 'Your first complaint letter takes 30 seconds',
    preheader: 'Energy overcharges, broadband price rises, unexpected renewals — here is how it works.',
    body: (name) => `
<h1 style="${s.h1}">Write your first complaint letter, ${name}</h1>
<p style="${s.p}">The most common complaints on Paybacker are energy overcharges, broadband price rises, and unexpected subscription renewals. Here's exactly how it works.</p>

<div style="${s.box}">
  <p style="color:${t.mintDeep};font-weight:700;margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">How it works</p>
  <ol style="color:${t.text};padding-left:20px;margin:0;line-height:2.2;font-size:14px;">
    <li>Go to <strong style="${s.strong}">Complaints</strong> in your dashboard</li>
    <li>Type the company name and describe the issue in your own words</li>
    <li>Paybacker's AI writes a professional letter citing the exact UK legislation</li>
    <li>Copy it, tweak it if you want, and send it from your email</li>
  </ol>
</div>

<div style="${s.tipBox}">
  <p style="color:${t.mintDeep};font-weight:700;margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Real example</p>
  <p style="color:${t.textStrong};margin:0;font-size:14px;line-height:1.7;">
    <strong style="${s.strong}">Issue:</strong> Energy supplier raised direct debit by £42 without proper notice.<br/>
    <strong style="${s.strong}">Paybacker generated:</strong> Formal complaint citing Ofgem Standards of Conduct and Consumer Rights Act 2015 s.49–50.<br/>
    <strong style="${s.strong}">Typical result:</strong> Refund, credit, or return to the original tariff within 8 weeks — or the right to escalate to the Energy Ombudsman.
  </p>
</div>

<p style="${s.p}">You don't need to know any law. Just describe what happened and Paybacker handles the rest.</p>

<div style="text-align:center;margin:28px 0;">
  <a href="https://paybacker.co.uk/dashboard/complaints" style="${s.cta}">Write your first letter</a>
</div>

<p style="${s.pSmall}">Free accounts include 3 letters per month. <a href="https://paybacker.co.uk/pricing" style="${s.link}">Upgrade for unlimited</a>.</p>
`,
  },

  // Day 4: Social proof
  {
    key: 'day4_social_proof',
    dayOffset: 4,
    subject: 'UK consumers are owed billions — here is what you can claim',
    preheader: 'Flight delays, broadband price rises, energy credit balances — three things worth checking today.',
    body: (name) => `
<h1 style="${s.h1}">You might be owed money right now, ${name}</h1>
<p style="${s.p}">Most UK consumers don't realise how much money they're leaving on the table. Here are three things worth checking today.</p>

<div style="${s.box}">
  <p style="color:${t.mintDeep};font-weight:700;margin:0 0 8px;font-size:14px;">Flight delays = up to £520 per person</p>
  <p style="color:${t.text};margin:0;font-size:14px;line-height:1.7;">Under UK261 regulations, if your flight was delayed over 3 hours in the last 6 years, you could be owed compensation. Paybacker writes the claim letter for you.</p>
</div>

<div style="${s.box}">
  <p style="color:${t.mintDeep};font-weight:700;margin:0 0 8px;font-size:14px;">Broadband mid-contract price rises = free exit</p>
  <p style="color:${t.text};margin:0;font-size:14px;line-height:1.7;">Ofcom rules mean if your broadband provider raised prices mid-contract without telling you upfront, you can leave penalty-free. Many providers did exactly this.</p>
</div>

<div style="${s.box}">
  <p style="color:${t.mintDeep};font-weight:700;margin:0 0 8px;font-size:14px;">Energy credit balances = your money back</p>
  <p style="color:${t.text};margin:0;font-size:14px;line-height:1.7;">If you've switched energy suppliers, your old provider must refund any credit balance within 10 working days. If they haven't, that's a valid complaint.</p>
</div>

<div style="text-align:center;margin:28px 0;">
  <a href="https://paybacker.co.uk/dashboard/complaints" style="${s.cta}">Check what you're owed</a>
  <a href="https://paybacker.co.uk/deals" style="${s.ctaSecondary};margin-left:8px;">Browse deals</a>
</div>
`,
  },

  // Day 7: Feature discovery
  {
    key: 'day7_features',
    dayOffset: 7,
    subject: 'Have you tried these yet, {{name}}?',
    preheader: 'One week in — the four features that save the most money.',
    body: (name) => `
<h1 style="${s.h1}">One week in. Here's what most people miss, ${name}.</h1>
<p style="${s.p}">You've had Paybacker for a week. Here are five features that save the most money, and most people haven't tried them all yet.</p>

<div style="${s.box}">
  <p style="${s.h3}">Bank Connection</p>
  <p style="color:${t.text};margin:0;font-size:14px;line-height:1.6;">Connect your bank and Paybacker finds every subscription, direct debit, and recurring payment. You'll probably find ones you've forgotten about. <a href="https://paybacker.co.uk/dashboard/subscriptions" style="${s.link}">Connect now</a></p>
</div>

<div style="${s.box}">
  <p style="${s.h3}">Spending Intelligence</p>
  <p style="color:${t.text};margin:0;font-size:14px;line-height:1.6;">See where your money goes each month, broken down by category. Set budgets and get alerts when you're close to your limit. <a href="https://paybacker.co.uk/dashboard/money-hub" style="${s.link}">View Money Hub</a></p>
</div>

<div style="${s.box}">
  <p style="${s.h3}">Disputes for Everything</p>
  <p style="color:${t.text};margin:0;font-size:14px;line-height:1.6;">HMRC tax rebates, council tax challenges, DVLA issues, NHS complaints, parking appeals — Paybacker writes these too. <a href="https://paybacker.co.uk/dashboard/complaints" style="${s.link}">Start a dispute</a></p>
</div>

<div style="${s.box}">
  <p style="${s.h3}">Savings Challenges</p>
  <p style="color:${t.text};margin:0;font-size:14px;line-height:1.6;">Try "No Takeaways for 7 Days" or "Cancel an Unused Subscription". Paybacker verifies your progress using your bank data and awards loyalty points when you complete a challenge. <a href="https://paybacker.co.uk/dashboard/rewards" style="${s.link}">View challenges</a></p>
</div>

<div style="${s.box}">
  <p style="${s.h3}">AI Chatbot</p>
  <p style="color:${t.text};margin:0;font-size:14px;line-height:1.6;">Ask our chatbot anything about UK consumer rights, your spending, or your subscriptions. It can manage your finances through conversation — look for the chat bubble on any page.</p>
</div>

<div style="text-align:center;margin:28px 0;">
  <a href="https://paybacker.co.uk/dashboard" style="${s.cta}">Explore your dashboard</a>
</div>

<p style="${s.p}">Reply and tell me what you've found so far. Every bit of feedback shapes what we build next.</p>
<p style="${s.p}">Paul</p>
`,
  },

  // Day 10: Upgrade nudge (free users only)
  {
    key: 'day10_upgrade',
    dayOffset: 10,
    subject: 'Unlock unlimited with Essential — £4.99/month',
    preheader: 'One successful letter pays for a year of Essential.',
    body: (name) => `
<h1 style="${s.h1}">Ready for more, ${name}?</h1>
<p style="${s.p}">Free accounts include 3 complaint letters a month, 2 bank connections, and 1 email inbox. If you've seen the value, Essential unlocks the rest.</p>

<div style="background:${t.cardBgMuted};border:1px solid ${t.mintWash};border-radius:12px;padding:24px;margin:24px 0;text-align:center;">
  <p style="color:${t.mintDeep};font-weight:700;margin:0 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Essential Plan</p>
  <p style="color:${t.textStrong};font-size:32px;font-weight:800;margin:0;line-height:1.1;">£4.99<span style="color:${t.textMuted};font-size:14px;font-weight:400;">/month</span></p>
  <p style="color:${t.textMuted};font-size:13px;margin:6px 0 0;">or £44.99/yr — Founding rate locked in forever</p>
</div>

<div style="${s.box}">
  <ul style="color:${t.text};padding-left:18px;margin:0;line-height:2.1;font-size:14px;">
    <li><strong style="${s.strong}">Unlimited</strong> AI complaint and form letters</li>
    <li><strong style="${s.strong}">3 bank accounts</strong> with daily auto-sync</li>
    <li><strong style="${s.strong}">3 email inboxes</strong> with Watchdog reply monitoring</li>
    <li><strong style="${s.strong}">Full</strong> spending intelligence (all 20+ categories)</li>
    <li>AI cancellation emails with legal context</li>
    <li>Renewal reminders at 30, 14 and 7 days</li>
    <li>Money Hub budgets + savings goals</li>
    <li>Price-increase alerts by email</li>
  </ul>
</div>

<p style="${s.p}">At the average complaint success rate, one letter pays for a year of Essential.</p>

<div style="text-align:center;margin:28px 0;">
  <a href="https://paybacker.co.uk/pricing" style="${s.cta}">Upgrade to Essential</a>
</div>

<p style="${s.pSmall}">Cancel anytime. No lock-in. Your data stays safe either way.</p>
`,
  },
];

export async function sendOnboardingEmail(
  email: string,
  firstName: string,
  key: string,
): Promise<boolean> {
  const template = ONBOARDING_SEQUENCE.find((entry) => entry.key === key);
  if (!template) return false;

  try {
    const name = firstName || 'there';
    const subject = template.subject.replace(/\{\{name\}\}/g, name);
    const html = renderEmail({
      preheader: template.preheader,
      body: template.body(name),
    });
    await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: email,
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error(`Onboarding email ${key} failed for ${email}:`, err);
    return false;
  }
}
