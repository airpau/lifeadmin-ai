import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

// Mint/Navy design system styles
const wrap = `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;border-radius:16px;overflow:hidden;`;
const header = `background:#162544;padding:24px 32px;border-bottom:1px solid #1e3a5f;text-align:center;`;
const body = `padding:32px;`;
const h1 = `color:#ffffff;font-size:24px;font-weight:700;margin:0 0 16px;line-height:1.3;`;
const h2 = `color:#ffffff;font-size:18px;font-weight:600;margin:0 0 12px;`;
const p = `color:#94a3b8;font-size:15px;line-height:1.75;margin:0 0 16px;`;
const pWhite = `color:#e2e8f0;font-size:15px;line-height:1.75;margin:0 0 16px;`;
const box = `background:#162544;border-radius:12px;padding:20px 24px;margin:20px 0;border-left:3px solid #34d399;`;
const tipBox = `background:#162544;border-radius:12px;padding:16px 20px;margin:20px 0;border-left:3px solid #FB923C;`;
const cta = `display:inline-block;background:#34d399;color:#0f172a;font-weight:700;font-size:15px;padding:14px 28px;border-radius:12px;text-decoration:none;margin:8px 0;`;
const ctaSecondary = `display:inline-block;background:#1e3a5f;color:#e2e8f0;font-weight:600;font-size:14px;padding:12px 24px;border-radius:12px;text-decoration:none;margin:8px 0 8px 12px;border:1px solid #1e3a5f;`;
const footer = `padding:20px 32px 28px;border-top:1px solid #1e3a5f;`;
const footerText = `color:#475569;font-size:12px;line-height:1.6;margin:0;text-align:center;`;
const stepNum = `display:inline-block;width:28px;height:28px;background:#34d399;color:#0f172a;font-weight:700;font-size:14px;border-radius:50%;text-align:center;line-height:28px;margin-right:10px;`;
const badge = `display:inline-block;background:#34d399;color:#0f172a;font-weight:700;font-size:11px;padding:3px 10px;border-radius:6px;letter-spacing:0.05em;text-transform:uppercase;`;
const statCard = `display:inline-block;background:#162544;border:1px solid #1e3a5f;border-radius:10px;padding:16px 20px;text-align:center;margin:4px;min-width:120px;`;

const Logo = () => `
  <a href="https://paybacker.co.uk" style="text-decoration:none;">
    <span style="font-size:22px;font-weight:800;color:#ffffff;">Pay<span style="background:linear-gradient(135deg,#34d399,#FB923C);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;">backer</span></span>
  </a>
`;

const Footer = () => `
  <div style="${footer}">
    <p style="${footerText}">
      <a href="https://paybacker.co.uk" style="color:#34d399;text-decoration:none;font-weight:600;">Paybacker LTD</a> · ICO Registered · UK Company<br/>
      AI-powered money recovery for UK consumers<br/><br/>
      <a href="https://paybacker.co.uk/privacy-policy" style="color:#475569;text-decoration:none;">Privacy Policy</a> &nbsp;·&nbsp;
      <a href="https://paybacker.co.uk/legal/terms" style="color:#475569;text-decoration:none;">Terms</a> &nbsp;·&nbsp;
      <a href="mailto:support@paybacker.co.uk?subject=Unsubscribe" style="color:#475569;text-decoration:none;">Unsubscribe</a>
    </p>
  </div>
`;

export interface OnboardingEmail {
  key: string;
  dayOffset: number;
  subject: string;
  html: (firstName: string) => string;
}

export const ONBOARDING_SEQUENCE: OnboardingEmail[] = [

  // Day 0: Welcome
  {
    key: 'welcome',
    dayOffset: 0,
    subject: 'Welcome to Paybacker, {{name}} — your money-back toolkit is ready',
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">Hi ${name}, welcome to Paybacker</h1>
    <p style="${pWhite}">You just unlocked a toolkit that most UK consumers don't have. Paybacker uses AI and UK consumer law to help you fight unfair charges, track every subscription, and find cheaper deals.</p>

    <p style="${p}">Here is what you can do right now:</p>

    <div style="${box}">
      <p style="margin:0 0 16px;"><span style="${stepNum}">1</span><strong style="color:#e2e8f0;font-size:15px;">Connect your bank account</strong></p>
      <p style="color:#94a3b8;margin:0 0 20px;font-size:14px;padding-left:38px;">We'll find every subscription, direct debit, and recurring payment automatically. Read-only, FCA regulated via Yapily. Takes 30 seconds.</p>

      <p style="margin:0 0 16px;"><span style="${stepNum}">2</span><strong style="color:#e2e8f0;font-size:15px;">Write your first complaint letter</strong></p>
      <p style="color:#94a3b8;margin:0 0 20px;font-size:14px;padding-left:38px;">Describe any billing issue in plain English. Our AI writes a professional letter citing the exact UK law that protects you. Energy, broadband, flights, debt, parking, council tax, HMRC, and more.</p>

      <p style="margin:0 0 16px;"><span style="${stepNum}">3</span><strong style="color:#e2e8f0;font-size:15px;">Browse 53+ deals</strong></p>
      <p style="color:#94a3b8;margin:0;font-size:14px;padding-left:38px;">Compare energy, broadband, mobile, insurance, mortgages, and loans from verified UK providers. Free to browse, no signup needed.</p>
    </div>

    <div style="text-align:center;margin:28px 0;">
      <a href="https://paybacker.co.uk/dashboard" style="${cta}">Go to your dashboard</a>
    </div>

    <div style="${tipBox}">
      <p style="color:#FB923C;font-weight:700;margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Did you know?</p>
      <p style="color:#94a3b8;margin:0;font-size:14px;line-height:1.6;">The average UK household overpays by over £1,000 per year on bills, subscriptions, and contracts they could challenge or switch. Paybacker helps you find and recover that money.</p>
    </div>

    <p style="${p}">Questions? Just reply to this email. I read every one.</p>
    <p style="${p}">Paul, Founder</p>
  </div>
  ${Footer()}
</div>`,
  },

  // Day 2: First value
  {
    key: 'day2_first_value',
    dayOffset: 2,
    subject: 'Your first complaint letter takes 30 seconds',
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">Write your first complaint letter, ${name}</h1>
    <p style="${pWhite}">The most common complaints on Paybacker are energy overcharges, broadband price rises, and unexpected subscription renewals. Here is exactly how it works.</p>

    <div style="${box}">
      <p style="color:#34d399;font-weight:700;margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">How it works</p>
      <ol style="color:#e2e8f0;padding-left:20px;margin:0;line-height:2.4;font-size:14px;">
        <li>Go to <strong>Complaints</strong> in your dashboard</li>
        <li>Type the company name and describe the issue in your own words</li>
        <li>Paybacker's AI writes a professional letter citing the exact UK legislation</li>
        <li>Copy it, tweak it if you want, and send it from your email</li>
      </ol>
    </div>

    <div style="${tipBox}">
      <p style="color:#FB923C;font-weight:700;margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Real example</p>
      <p style="color:#94a3b8;margin:0;font-size:14px;line-height:1.7;">
        <strong style="color:#e2e8f0;">Issue:</strong> Energy supplier raised direct debit by £42 without proper notice.<br/>
        <strong style="color:#e2e8f0;">Paybacker generated:</strong> Formal complaint citing Ofgem Standards of Conduct and Consumer Rights Act 2015 s.49-50.<br/>
        <strong style="color:#e2e8f0;">Typical result:</strong> Refund, credit, or return to original tariff within 8 weeks, or the right to escalate to the Energy Ombudsman.
      </p>
    </div>

    <p style="${p}">You don't need to know any law. Just describe what happened and Paybacker handles the rest.</p>

    <div style="text-align:center;margin:28px 0;">
      <a href="https://paybacker.co.uk/dashboard/complaints" style="${cta}">Write your first letter</a>
    </div>

    <p style="color:#64748b;font-size:13px;margin:0;">Free accounts include 3 letters per month. <a href="https://paybacker.co.uk/pricing" style="color:#34d399;">Upgrade for unlimited</a>.</p>
  </div>
  ${Footer()}
</div>`,
  },

  // Day 4: Social proof
  {
    key: 'day4_social_proof',
    dayOffset: 4,
    subject: 'UK consumers are owed billions — here is what you can claim',
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">You might be owed money right now, ${name}</h1>
    <p style="${pWhite}">Most UK consumers don't realise how much money they're leaving on the table. Here are three things worth checking today.</p>

    <div style="${box}">
      <p style="color:#34d399;font-weight:700;margin:0 0 8px;font-size:14px;">Flight delays = up to £520 per person</p>
      <p style="color:#94a3b8;margin:0;font-size:14px;line-height:1.7;">Under UK261 regulations, if your flight was delayed over 3 hours in the last 6 years, you could be owed compensation. Paybacker writes the claim letter for you.</p>
    </div>

    <div style="${box}">
      <p style="color:#34d399;font-weight:700;margin:0 0 8px;font-size:14px;">Broadband mid-contract price rises = free exit</p>
      <p style="color:#94a3b8;margin:0;font-size:14px;line-height:1.7;">Ofcom rules mean if your broadband provider raises prices mid-contract without telling you upfront, you can leave penalty-free. Many providers did exactly this.</p>
    </div>

    <div style="${box}">
      <p style="color:#34d399;font-weight:700;margin:0 0 8px;font-size:14px;">Energy credit balances = your money back</p>
      <p style="color:#94a3b8;margin:0;font-size:14px;line-height:1.7;">If you've switched energy suppliers, your old provider must refund any credit balance within 10 working days. If they haven't, that's a valid complaint.</p>
    </div>

    <div style="text-align:center;margin:28px 0;">
      <a href="https://paybacker.co.uk/dashboard/complaints" style="${cta}">Check what you're owed</a>
      <a href="https://paybacker.co.uk/deals" style="${ctaSecondary}">Browse deals</a>
    </div>
  </div>
  ${Footer()}
</div>`,
  },

  // Day 7: Feature discovery
  {
    key: 'day7_features',
    dayOffset: 7,
    subject: 'Have you tried these yet, ${name}?',
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">One week in. Here is what most people miss, ${name}.</h1>
    <p style="${pWhite}">You've had Paybacker for a week. Here are four features that save the most money, and most people haven't tried them all yet.</p>

    <div style="${box}">
      <p style="color:#e2e8f0;font-weight:600;margin:0 0 6px;font-size:15px;">Bank Connection</p>
      <p style="color:#94a3b8;margin:0;font-size:14px;line-height:1.6;">Connect your bank and Paybacker finds every subscription, direct debit, and recurring payment. You'll probably find ones you've forgotten about. <a href="https://paybacker.co.uk/dashboard/subscriptions" style="color:#34d399;">Connect now</a></p>
    </div>

    <div style="${box}">
      <p style="color:#e2e8f0;font-weight:600;margin:0 0 6px;font-size:15px;">Spending Intelligence</p>
      <p style="color:#94a3b8;margin:0;font-size:14px;line-height:1.6;">See where your money goes each month, broken down by category. Set budgets and get alerts when you're close to your limit. <a href="https://paybacker.co.uk/dashboard/money-hub" style="color:#34d399;">View Money Hub</a></p>
    </div>

    <div style="${box}">
      <p style="color:#e2e8f0;font-weight:600;margin:0 0 6px;font-size:15px;">Disputes for Everything</p>
      <p style="color:#94a3b8;margin:0;font-size:14px;line-height:1.6;">HMRC tax rebates, council tax challenges, DVLA issues, NHS complaints, parking appeals. Paybacker writes these too. <a href="https://paybacker.co.uk/dashboard/complaints" style="color:#34d399;">Start a dispute</a></p>
    </div>

    <div style="${box}">
      <p style="color:#e2e8f0;font-weight:600;margin:0 0 6px;font-size:15px;">Savings Challenges</p>
      <p style="color:#94a3b8;margin:0;font-size:14px;line-height:1.6;">Try "No Takeaways for 7 Days" or "Cancel an Unused Subscription". Paybacker verifies your progress using your bank data and awards loyalty points when you complete a challenge. A fun way to save real money. <a href="https://paybacker.co.uk/dashboard/rewards" style="color:#34d399;">View challenges</a></p>
    </div>

    <div style="${box}">
      <p style="color:#e2e8f0;font-weight:600;margin:0 0 6px;font-size:15px;">AI Chatbot</p>
      <p style="color:#94a3b8;margin:0;font-size:14px;line-height:1.6;">Ask our chatbot anything about UK consumer rights, your spending, or your subscriptions. It can manage your finances through conversation. Look for the chat bubble on any page.</p>
    </div>

    <div style="text-align:center;margin:28px 0;">
      <a href="https://paybacker.co.uk/dashboard" style="${cta}">Explore your dashboard</a>
    </div>

    <p style="${p}">Reply and tell me what you've found so far. Every bit of feedback shapes what we build next.</p>
    <p style="${p}">Paul</p>
  </div>
  ${Footer()}
</div>`,
  },

  // Day 10: Upgrade nudge (free users only)
  {
    key: 'day10_upgrade',
    dayOffset: 10,
    subject: 'Unlock unlimited with Essential — £4.99/month',
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">Ready for more, ${name}?</h1>
    <p style="${pWhite}">Free accounts include 3 complaint letters per month and a one-time bank scan. If you've seen the value, the Essential plan unlocks everything.</p>

    <div style="background:#162544;border:1px solid #34d399;border-radius:12px;padding:24px;margin:24px 0;text-align:center;">
      <p style="color:#34d399;font-weight:700;margin:0 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Essential Plan</p>
      <p style="color:white;font-size:32px;font-weight:800;margin:0;">£4.99<span style="color:#94a3b8;font-size:14px;font-weight:400;">/month</span></p>
    </div>

    <div style="${box}">
      <ul style="color:#e2e8f0;padding-left:18px;margin:0;line-height:2.4;font-size:14px;">
        <li><strong>Unlimited</strong> AI complaint and form letters</li>
        <li><strong>1 bank account</strong> with daily auto-sync</li>
        <li><strong>Monthly</strong> email and opportunity re-scans</li>
        <li><strong>Full</strong> spending intelligence dashboard</li>
        <li>Cancellation emails citing UK consumer law</li>
        <li>Renewal reminders at 30, 14, and 7 days</li>
        <li>Contract end date tracking</li>
      </ul>
    </div>

    <p style="${p}">At the average complaint success rate, one letter pays for a year of Essential.</p>

    <div style="text-align:center;margin:28px 0;">
      <a href="https://paybacker.co.uk/pricing" style="${cta}">Upgrade to Essential</a>
    </div>

    <p style="color:#64748b;font-size:13px;margin:0;">Cancel anytime. No lock-in. Your data stays safe either way.</p>
  </div>
  ${Footer()}
</div>`,
  },
];

// Send helper
export async function sendOnboardingEmail(
  email: string,
  firstName: string,
  key: string
): Promise<boolean> {
  const template = ONBOARDING_SEQUENCE.find((s) => s.key === key);
  if (!template) return false;

  try {
    const name = firstName || 'there';
    await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: email,
      subject: template.subject.replace('{{name}}', name).replace('${name}', name),
      html: template.html(name),
    });
    return true;
  } catch (err) {
    console.error(`Onboarding email ${key} failed for ${email}:`, err);
    return false;
  }
}
