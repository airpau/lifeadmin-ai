import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

// ─── Shared styles ────────────────────────────────────────────────────────────

const wrap = `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;`;
const header = `background:#0f172a;padding:28px 32px 20px;border-bottom:1px solid #1e293b;`;
const body = `padding:32px;`;
const h1 = `color:#f59e0b;font-size:24px;font-weight:700;margin:0 0 16px;line-height:1.3;`;
const p = `color:#94a3b8;font-size:15px;line-height:1.75;margin:0 0 16px;`;
const box = `background:#1e293b;border-radius:10px;padding:20px 24px;margin:20px 0;border-left:3px solid #f59e0b;`;
const cta = `display:inline-block;background:#f59e0b;color:#0f172a;font-weight:700;font-size:15px;padding:13px 26px;border-radius:8px;text-decoration:none;margin:8px 0;`;
const ctaSecondary = `display:inline-block;background:#1e293b;color:#e2e8f0;font-weight:600;font-size:14px;padding:11px 22px;border-radius:8px;text-decoration:none;margin:8px 0 8px 12px;border:1px solid #334155;`;
const footer = `padding:20px 32px 28px;border-top:1px solid #1e293b;`;
const footerText = `color:#334155;font-size:12px;line-height:1.6;margin:0;`;
const badge = `display:inline-block;background:#f59e0b;color:#0f172a;font-weight:700;font-size:11px;padding:3px 8px;border-radius:4px;letter-spacing:0.05em;`;

const Logo = () => `
  <a href="https://paybacker.co.uk" style="text-decoration:none;">
    <span style="font-size:20px;font-weight:800;color:#ffffff;">Pay<span style="color:#f59e0b;">backer</span></span>
  </a>
`;

const Footer = () => `
  <div style="${footer}">
    <p style="${footerText}">
      <a href="https://paybacker.co.uk" style="color:#f59e0b;text-decoration:none;font-weight:600;">Paybacker LTD</a> · AI-powered money recovery for UK consumers<br/>
      You're receiving this because you created a Paybacker account.<br/>
      <a href="https://paybacker.co.uk/legal/privacy" style="color:#475569;text-decoration:none;">Privacy Policy</a> &nbsp;·&nbsp;
      <a href="mailto:hello@paybacker.co.uk?subject=Unsubscribe" style="color:#475569;text-decoration:none;">Unsubscribe</a>
    </p>
  </div>
`;

// ─── Sequence definition ───────────────────────────────────────────────────────

export interface OnboardingEmail {
  key: string;
  dayOffset: number;
  subject: string;
  html: (firstName: string) => string;
}

export const ONBOARDING_SEQUENCE: OnboardingEmail[] = [

  // ── Day 0: Welcome ──────────────────────────────────────────────────────────
  {
    key: 'welcome',
    dayOffset: 0,
    subject: 'Welcome to Paybacker — let\'s get your money back',
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">Welcome, ${name} — let's get your money back</h1>
    <p style="${p}">Your Paybacker account is live. Here's what you can do right now:</p>

    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 12px;font-size:14px;">⚡ QUICK START — 3 STEPS</p>
      <p style="color:#e2e8f0;font-weight:600;margin:0 0 4px;font-size:15px;">1. Connect Gmail</p>
      <p style="color:#94a3b8;margin:0 0 14px;font-size:14px;line-height:1.6;">Let our AI scan your inbox for subscriptions and billing errors. Read-only, secure, takes 30 seconds.</p>
      <p style="color:#e2e8f0;font-weight:600;margin:0 0 4px;font-size:15px;">2. Run the scanner</p>
      <p style="color:#94a3b8;margin:0 0 14px;font-size:14px;line-height:1.6;">See every overcharge, renewal, and forgotten subscription in your inbox — last 2 years covered.</p>
      <p style="color:#e2e8f0;font-weight:600;margin:0 0 4px;font-size:15px;">3. Generate your first letter</p>
      <p style="color:#94a3b8;margin:0;font-size:14px;line-height:1.6;">Write a formal complaint citing the Consumer Rights Act 2015 in under 2 minutes.</p>
    </div>

    <a href="https://paybacker.co.uk/dashboard/scanner" style="${cta}">Scan your inbox →</a>
    <a href="https://paybacker.co.uk/dashboard" style="${ctaSecondary}">Go to dashboard</a>

    <p style="${p}; margin-top:24px;">Questions? Just reply to this email — I read every one.</p>
    <p style="${p}">— Paul, Paybacker</p>
  </div>
  ${Footer()}
</div>`,
  },

  // ── Day 1: First complaint ───────────────────────────────────────────────────
  {
    key: 'day1_complaint',
    dayOffset: 1,
    subject: 'Your first complaint letter in 2 minutes',
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">Write your first complaint letter, ${name}</h1>
    <p style="${p}">The most common first complaint on Paybacker? An energy bill overcharge. Here's exactly how it works.</p>

    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 12px;font-size:14px;">REAL EXAMPLE</p>
      <p style="color:#94a3b8;margin:0;line-height:1.75;font-size:14px;">
        <strong style="color:#e2e8f0;">Problem:</strong> British Gas raised monthly direct debit by £42 without 30-day notice.<br/>
        <strong style="color:#e2e8f0;">Paybacker generated:</strong> Formal complaint citing Ofgem's Standards of Conduct and Consumer Rights Act 2015 s.50.<br/>
        <strong style="color:#e2e8f0;">Result:</strong> £126 refund + back to original tariff within 11 days.
      </p>
    </div>

    <p style="${p}">To write your first letter:</p>
    <ol style="color:#94a3b8;font-size:15px;line-height:2.2;padding-left:20px;margin:0 0 20px;">
      <li>Go to <strong style="color:#e2e8f0;">Complaints</strong> in your dashboard</li>
      <li>Describe the issue in plain English — no legal knowledge needed</li>
      <li>Paybacker writes the letter, citing the correct UK law</li>
      <li>Copy it, edit it if you like, and send it from your own email</li>
    </ol>

    <a href="https://paybacker.co.uk/dashboard/complaints" style="${cta}">Write your first letter →</a>

    <p style="${p}; margin-top:24px;font-size:13px;color:#64748b;">Free accounts include 3 complaint letters per month. <a href="https://paybacker.co.uk/pricing" style="color:#f59e0b;">Upgrade</a> for unlimited.</p>
  </div>
  ${Footer()}
</div>`,
  },

  // ── Day 3: Subscription scanner ─────────────────────────────────────────────
  {
    key: 'day3_subscriptions',
    dayOffset: 3,
    subject: 'Found any subscriptions? Here\'s how to cancel them',
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">How to find and cancel forgotten subscriptions, ${name}</h1>
    <p style="${p}">The average UK adult pays for 4–7 subscriptions they barely use. Our scanner reads your inbox to surface all of them.</p>

    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 12px;font-size:14px;">WHAT THE SCANNER FINDS</p>
      <ul style="color:#94a3b8;padding-left:18px;margin:0;line-height:2.2;font-size:14px;">
        <li>Monthly and annual subscriptions (Netflix, Adobe, gym, software)</li>
        <li>Free trials that silently converted to paid</li>
        <li>Duplicate services (two cloud storage plans, etc.)</li>
        <li>Annual renewals you didn't notice charging</li>
        <li>Services you meant to cancel but never did</li>
      </ul>
    </div>

    <p style="${p}">Once found, Paybacker generates a professional cancellation email for each — citing your right to cancel under the Consumer Contracts Regulations 2013. You copy it and send it from your own email.</p>

    <a href="https://paybacker.co.uk/dashboard/subscriptions" style="${cta}">Scan for subscriptions →</a>
    <a href="https://paybacker.co.uk/dashboard/scanner" style="${ctaSecondary}">Run opportunity scan</a>

    <p style="${p}; margin-top:24px;">If Gmail isn't connected yet, <a href="https://paybacker.co.uk/dashboard/profile" style="color:#f59e0b;">connect it here</a> — the scanner won't find anything without it.</p>
  </div>
  ${Footer()}
</div>`,
  },

  // ── Day 7: Weekly summary prompt ────────────────────────────────────────────
  {
    key: 'day7_review',
    dayOffset: 7,
    subject: 'Your week 1 Paybacker check-in',
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">One week in — what have you found, ${name}?</h1>
    <p style="${p}">You've had access for a week. Here's a quick check on the three things worth reviewing:</p>

    <div style="${box}">
      <p style="color:#e2e8f0;font-weight:600;margin:0 0 6px;">1. Opportunity Scanner</p>
      <p style="color:#94a3b8;margin:0 0 16px;font-size:14px;">Have you run it? It covers 2 years of inbox history — energy, broadband, billing errors, renewals. Takes 30 seconds.</p>

      <p style="color:#e2e8f0;font-weight:600;margin:0 0 6px;">2. Subscriptions</p>
      <p style="color:#94a3b8;margin:0 0 16px;font-size:14px;">The "Detect from Inbox" button on the Subscriptions page finds every recurring charge from your emails automatically.</p>

      <p style="color:#e2e8f0;font-weight:600;margin:0 0 6px;">3. Complaint letters</p>
      <p style="color:#94a3b8;margin:0;font-size:14px;">If you spotted an overcharge or billing error, the Complaints agent writes the letter citing the exact UK law that applies.</p>
    </div>

    <a href="https://paybacker.co.uk/dashboard" style="${cta}">Review your dashboard →</a>

    <p style="${p}; margin-top:24px;">Reply to this email and tell me what you've found so far — good or bad. Every bit of feedback makes the product better.</p>
    <p style="${p}">— Paul</p>
  </div>
  ${Footer()}
</div>`,
  },

  // ── Day 10: Upgrade nudge ────────────────────────────────────────────────────
  {
    key: 'day10_upgrade',
    dayOffset: 10,
    subject: 'Unlock unlimited complaint letters — Essential plan',
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">Hit your letter limit, ${name}?</h1>
    <p style="${p}">Free accounts include 3 complaint letters per month. If you've used them — or you can see more opportunities to chase — the Essential plan unlocks everything.</p>

    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 12px;font-size:15px;">Essential — £9.99/month</p>
      <ul style="color:#94a3b8;padding-left:18px;margin:0;line-height:2.2;font-size:14px;">
        <li><strong style="color:#e2e8f0;">Unlimited</strong> AI complaint letters</li>
        <li><strong style="color:#e2e8f0;">Unlimited</strong> inbox scanning</li>
        <li><strong style="color:#e2e8f0;">Unlimited</strong> subscription tracking</li>
        <li>AI cancellation emails for every subscription</li>
        <li>Letters citing Consumer Rights Act 2015, Ofcom, FCA rules</li>
        <li>Cancel anytime — no lock-in</li>
      </ul>
    </div>

    <p style="${p}">At the average success rate, one complaint letter pays for a year of Essential.</p>

    <a href="https://paybacker.co.uk/pricing" style="${cta}">Upgrade to Essential →</a>

    <p style="${p}; margin-top:24px;font-size:13px;color:#64748b;">Not ready? Free accounts still get 3 letters/month — reset on the 1st of each month.</p>
  </div>
  ${Footer()}
</div>`,
  },

  // ── Day 14: Pro features ─────────────────────────────────────────────────────
  {
    key: 'day14_pro',
    dayOffset: 14,
    subject: 'The full Paybacker toolkit — everything available now',
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">Two weeks in — here's everything Paybacker can do, ${name}</h1>
    <p style="${p}">A quick look at the full toolkit, in case you haven't explored everything yet.</p>

    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 4px;font-size:13px;">AVAILABLE NOW — FREE</p>
      <ul style="color:#94a3b8;padding-left:18px;margin:0 0 16px;line-height:2;font-size:14px;">
        <li>3 complaint letters/month (Consumer Rights Act 2015 citations)</li>
        <li>Subscription tracker + manual add</li>
        <li>Dashboard overview</li>
      </ul>
      <p style="color:#f59e0b;font-weight:700;margin:0 0 4px;font-size:13px;">AVAILABLE NOW — ESSENTIAL (£9.99/mo)</p>
      <ul style="color:#94a3b8;padding-left:18px;margin:0 0 16px;line-height:2;font-size:14px;">
        <li>Unlimited complaint letters</li>
        <li>Gmail inbox scanner (2 years of history)</li>
        <li>Subscription detection from inbox</li>
        <li>AI cancellation emails</li>
      </ul>
      <p style="color:#f59e0b;font-weight:700;margin:0 0 4px;font-size:13px;">COMING SOON — PRO (£19.99/mo)</p>
      <ul style="color:#94a3b8;padding-left:18px;margin:0;line-height:2;font-size:14px;">
        <li>Open Banking integration (full financial picture)</li>
        <li>Savings Agent (energy, broadband, insurance comparisons)</li>
        <li>Forms &amp; Government Agent (HMRC, council tax)</li>
        <li>Nightly auto-scan</li>
      </ul>
    </div>

    <a href="https://paybacker.co.uk/dashboard/complaints" style="${cta}">Write a complaint →</a>
    <a href="https://paybacker.co.uk/pricing" style="${ctaSecondary}">View pricing</a>
  </div>
  ${Footer()}
</div>`,
  },

  // ── Day 21: Social proof ─────────────────────────────────────────────────────
  {
    key: 'day21_social_proof',
    dayOffset: 21,
    subject: 'How people are using Paybacker to get money back',
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">Real complaints, real results, ${name}</h1>
    <p style="${p}">Here are three types of complaints that typically succeed — and what makes them work.</p>

    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 8px;font-size:14px;">💡 ENERGY OVERCHARGE</p>
      <p style="color:#94a3b8;margin:0;font-size:14px;line-height:1.7;">Citing Ofgem's Standards of Conduct and Consumer Rights Act 2015 s.49–50, a formal complaint about an unexplained direct debit increase typically results in an explanation, a credit, or a return to the previous rate within 8 weeks — or the right to escalate to the Energy Ombudsman.</p>
    </div>

    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 8px;font-size:14px;">📡 BROADBAND PRICE RISE</p>
      <p style="color:#94a3b8;margin:0;font-size:14px;line-height:1.7;">Under Ofcom rules, mid-contract price rises not disclosed at point of sale trigger an exit right. A complaint letter citing this gives you either a waived exit fee or a credit — your choice.</p>
    </div>

    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 8px;font-size:14px;">🔄 FORGOTTEN SUBSCRIPTION</p>
      <p style="color:#94a3b8;margin:0;font-size:14px;line-height:1.7;">Cancellation emails citing the Consumer Contracts Regulations 2013 right to cancel — sent professionally rather than emotionally — get a much higher response rate than "please cancel my account" messages.</p>
    </div>

    <p style="${p}">Have you had a win with Paybacker? <a href="mailto:hello@paybacker.co.uk?subject=My Paybacker win" style="color:#f59e0b;">Reply and tell me</a> — I'd love to share your story (anonymously if you prefer).</p>

    <a href="https://paybacker.co.uk/dashboard/complaints" style="${cta}">Write a complaint now →</a>
  </div>
  ${Footer()}
</div>`,
  },

  // ── Day 28: Month summary + referral ────────────────────────────────────────
  {
    key: 'day28_referral',
    dayOffset: 28,
    subject: 'Your first month with Paybacker — and a favour',
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">One month in, ${name}</h1>
    <p style="${p}">You've had Paybacker for a month. Whether you've written one complaint or ten, you now have a tool that most people don't — the ability to fight back, quickly and with the law on your side.</p>

    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 12px;font-size:14px;">THINGS WORTH DOING THIS MONTH</p>
      <ul style="color:#94a3b8;padding-left:18px;margin:0;line-height:2.2;font-size:14px;">
        <li><a href="https://paybacker.co.uk/dashboard/scanner" style="color:#f59e0b;">Run the opportunity scanner</a> — covers 2 years of emails</li>
        <li><a href="https://paybacker.co.uk/dashboard/subscriptions" style="color:#f59e0b;">Check for forgotten subscriptions</a> — "Detect from Inbox"</li>
        <li><a href="https://paybacker.co.uk/dashboard/complaints" style="color:#f59e0b;">Write a complaint</a> — especially if any bills went up recently</li>
      </ul>
    </div>

    <p style="${p}"><strong style="color:#e2e8f0;">A favour:</strong> If Paybacker has been useful, the best thing you can do is tell one person about it. We're a small team building something genuinely useful for UK consumers — word of mouth is everything at this stage.</p>

    <a href="https://paybacker.co.uk" style="${cta}">Share Paybacker →</a>

    <p style="${p}; margin-top:24px;">Thank you for being an early user. Your feedback shapes what we build next.</p>
    <p style="${p}">— Paul, Paybacker</p>
  </div>
  ${Footer()}
</div>`,
  },
];

// ─── Send helper ──────────────────────────────────────────────────────────────

export async function sendOnboardingEmail(
  email: string,
  firstName: string,
  key: string
): Promise<boolean> {
  const template = ONBOARDING_SEQUENCE.find((s) => s.key === key);
  if (!template) return false;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: email,
      subject: template.subject,
      html: template.html(firstName || 'there'),
    });
    return true;
  } catch (err) {
    console.error(`Onboarding email ${key} failed for ${email}:`, err);
    return false;
  }
}
