import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

// ─── Shared styles (matches Paybacker brand: dark navy + amber) ──────────────

const wrap = `font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;max-width:600px;margin:0 auto;background:#0f172a;`;
const header = `background:#0f172a;padding:28px 32px 20px;border-bottom:1px solid #1e293b;`;
const body = `padding:32px;`;
const h1 = `color:#f59e0b;font-size:24px;font-weight:700;margin:0 0 16px;line-height:1.3;`;
const p = `color:#94a3b8;font-size:15px;line-height:1.75;margin:0 0 16px;`;
const box = `background:#1e293b;border-radius:10px;padding:20px 24px;margin:20px 0;border-left:3px solid #f59e0b;`;
const cta = `display:inline-block;background:#f59e0b;color:#0f172a;font-weight:700;font-size:15px;padding:13px 26px;border-radius:8px;text-decoration:none;margin:8px 0;`;
const footer = `padding:20px 32px 28px;border-top:1px solid #1e293b;`;
const footerText = `color:#334155;font-size:12px;line-height:1.6;margin:0;`;

const Logo = () => `
  <a href="https://paybacker.co.uk" style="text-decoration:none;">
    <span style="font-size:20px;font-weight:800;color:#ffffff;">Pay<span style="color:#f59e0b;">backer</span></span>
  </a>
`;

const Footer = (listName = 'waitlist') => `
  <div style="${footer}">
    <p style="${footerText}">
      <a href="https://paybacker.co.uk" style="color:#f59e0b;text-decoration:none;font-weight:600;">Paybacker LTD</a> · AI-powered money recovery for UK consumers<br/>
      You're receiving this because you joined the Paybacker ${listName}.<br/>
      <a href="https://paybacker.co.uk/legal/privacy" style="color:#475569;text-decoration:none;">Privacy Policy</a> &nbsp;·&nbsp;
      <a href="mailto:support@paybacker.co.uk?subject=Unsubscribe" style="color:#475569;text-decoration:none;">Unsubscribe</a>
    </p>
  </div>
`;

// ─── Sequence ─────────────────────────────────────────────────────────────────

export interface SequenceEmail {
  id: string;
  dayOffset: number;
  subject: string;
  html: (name: string) => string;
}

export const WAITLIST_SEQUENCE: SequenceEmail[] = [

  // Day 0
  {
    id: 'welcome',
    dayOffset: 0,
    subject: "You're on the Paybacker waitlist",
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">You're on the list, ${name}</h1>
    <p style="${p}">
      Thanks for joining Paybacker. We're building an AI that disputes overcharges, cancels forgotten subscriptions, and writes formal complaints — all automatically, all citing UK consumer law.
    </p>
    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 12px;font-size:14px;">WHAT YOU GET AS AN EARLY MEMBER</p>
      <ul style="color:#94a3b8;padding-left:18px;line-height:2.2;margin:0;font-size:14px;">
        <li>Early access invite before public launch</li>
        <li>3 months free on any paid plan</li>
        <li>Locked-in pricing — your rate never increases</li>
        <li>Direct input on which features we build next</li>
      </ul>
    </div>
    <p style="${p}">The average UK adult overpays by over £500/year on bills and forgotten subscriptions. We're fixing that.</p>
    <a href="https://paybacker.co.uk" style="${cta}">Preview the app →</a>
    <p style="${p}; margin-top:24px;">— Paul, Paybacker</p>
  </div>
  ${Footer()}
</div>`,
  },

  // Day 2
  {
    id: 'day2_education',
    dayOffset: 2,
    subject: 'How Paybacker finds money hiding in your inbox',
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">How we find money in your inbox, ${name}</h1>
    <p style="${p}">Here's exactly what happens when you connect your Gmail to Paybacker — and why it works.</p>

    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 8px;font-size:14px;">🔍 STEP 1 — INBOX SCAN</p>
      <p style="color:#94a3b8;margin:0;line-height:1.7;font-size:14px;">The AI scans 2 years of billing emails — energy, broadband, mobile, streaming. It looks for overcharges, upcoming renewals, forgotten subscriptions, and missed refund windows.</p>
    </div>

    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 8px;font-size:14px;">💷 STEP 2 — SPOTS WHAT YOU'D MISS</p>
      <p style="color:#94a3b8;margin:0;line-height:1.7;font-size:14px;">Most people don't notice when their broadband quietly rises by £8/month. Or that they're still paying for a subscription they cancelled in their head six months ago. The AI catches all of it.</p>
    </div>

    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 8px;font-size:14px;">✅ STEP 3 — YOU REVIEW AND SEND</p>
      <p style="color:#94a3b8;margin:0;line-height:1.7;font-size:14px;">Paybacker generates the complaint letter or cancellation email — citing UK consumer law — and shows it to you. Review it, edit if you like, and send it from your own email in under a minute.</p>
    </div>

    <p style="${p}">Your early access invite is coming soon.</p>
    <a href="https://paybacker.co.uk" style="${cta}">See how it works →</a>
  </div>
  ${Footer()}
</div>`,
  },

  // Day 5
  {
    id: 'day5_education',
    dayOffset: 5,
    subject: '5 things your energy company hopes you never find out',
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">5 things your energy company hopes you never find out, ${name}</h1>
    <p style="${p}">UK energy companies collected £1.5 billion in excess profit in 2023. Some of it came from customers who simply didn't know their rights.</p>

    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 6px;font-size:14px;">1. You can claim backdated refunds</p>
      <p style="color:#94a3b8;margin:0;line-height:1.7;font-size:14px;">If you were overcharged, you're entitled to a refund going back up to 6 years. They won't volunteer this.</p>
    </div>
    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 6px;font-size:14px;">2. A formal complaint starts a legal clock</p>
      <p style="color:#94a3b8;margin:0;line-height:1.7;font-size:14px;">They have 8 weeks to resolve it — or you escalate to the Energy Ombudsman, which costs them far more than just paying you.</p>
    </div>
    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 6px;font-size:14px;">3. Price increases have rules they must follow</p>
      <p style="color:#94a3b8;margin:0;line-height:1.7;font-size:14px;">Under Ofgem rules, they must notify you in writing before increasing prices. If they didn't, you may have grounds for a complaint.</p>
    </div>
    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 6px;font-size:14px;">4. Exit fees are often unenforceable</p>
      <p style="color:#94a3b8;margin:0;line-height:1.7;font-size:14px;">If they changed your tariff without consent, exit fees may not apply under Consumer Rights Act 2015, s.50.</p>
    </div>
    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 6px;font-size:14px;">5. Citing the law changes everything</p>
      <p style="color:#94a3b8;margin:0;line-height:1.7;font-size:14px;">A letter citing "Consumer Rights Act 2015, s.54" lands very differently than "I'm unhappy with my bill." Paybacker writes letters that cite all of this — automatically.</p>
    </div>

    <a href="https://paybacker.co.uk" style="${cta}">Join the early access list →</a>
  </div>
  ${Footer()}
</div>`,
  },

  // Day 7
  {
    id: 'day7_trust',
    dayOffset: 7,
    subject: 'Behind the scenes: why our complaint letters actually work',
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">The complaint letter that gets results, ${name}</h1>
    <p style="${p}">Most complaint letters fail because they sound frustrated instead of legally informed. Here's what makes Paybacker's different.</p>

    <div style="${box}">
      <ul style="color:#94a3b8;padding-left:18px;line-height:2.4;margin:0;font-size:14px;">
        <li><strong style="color:#e2e8f0;">Cites the exact legislation</strong> — Consumer Rights Act 2015, Ofcom, FCA rules. Companies respond differently when the law is named correctly.</li>
        <li><strong style="color:#e2e8f0;">Sets a 14-day response deadline</strong> — legally significant for Ombudsman escalation.</li>
        <li><strong style="color:#e2e8f0;">Names the escalation path</strong> — Energy Ombudsman, Financial Ombudsman, Ofcom. They know what comes next.</li>
        <li><strong style="color:#e2e8f0;">States a specific remedy</strong> — refund amount, service credit, or correction. Vague demands get vague responses.</li>
      </ul>
    </div>

    <p style="${p}">The difference is knowing exactly what to cite and how to frame it. That's what the AI does — in about 90 seconds.</p>
    <p style="${p}">— Paul, Paybacker</p>
    <a href="https://paybacker.co.uk" style="${cta}">Get early access →</a>
  </div>
  ${Footer()}
</div>`,
  },

  // Day 8
  {
    id: 'day8_feature',
    dayOffset: 8,
    subject: 'The subscriptions scan: finding £47/month in forgotten charges',
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">Found: £47/month in forgotten subscriptions, ${name}</h1>
    <p style="${p}">When someone connects their Gmail to Paybacker, the subscriptions agent runs immediately. Here's what it typically finds.</p>

    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 12px;font-size:14px;">WHAT THE AI LOOKS FOR</p>
      <ul style="color:#94a3b8;padding-left:18px;margin:0;line-height:2.2;font-size:14px;">
        <li>Recurring charges from services you forgot you signed up for</li>
        <li>Free trials that quietly converted to paid plans</li>
        <li>Duplicate subscriptions (two cloud storage plans, two music services)</li>
        <li>Annual renewals hitting your account without warning</li>
        <li>Services you cancelled in your head but never actually cancelled</li>
      </ul>
    </div>

    <p style="${p}">For every subscription found, Paybacker drafts a cancellation email citing your right to cancel under the Consumer Contracts Regulations 2013. You review it and send it from your own email.</p>
    <p style="${p}">Most people are surprised by at least one thing. The average? Around £40–60/month in charges they'd genuinely forgotten about.</p>

    <a href="https://paybacker.co.uk" style="${cta}">Get early access →</a>
  </div>
  ${Footer()}
</div>`,
  },

  // Day 14
  {
    id: 'day14_urgency',
    dayOffset: 14,
    subject: "Early access is opening soon — here's what you get",
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">Early access is almost here, ${name}</h1>
    <p style="${p}">We're opening Paybacker to our first users very soon. As a waitlist member, you're at the front of the queue — and you get something regular users won't.</p>

    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 12px;font-size:15px;">YOUR EARLY ACCESS BENEFITS</p>
      <ul style="color:#94a3b8;padding-left:18px;line-height:2.2;margin:0;font-size:14px;">
        <li>✅ <strong style="color:#e2e8f0;">3 months free</strong> on any paid plan</li>
        <li>✅ <strong style="color:#e2e8f0;">Founding member</strong> — locked-in pricing forever</li>
        <li>✅ <strong style="color:#e2e8f0;">Direct input</strong> on which agents we build next</li>
      </ul>
    </div>

    <p style="${p}">When you get your invite, you'll be able to connect your Gmail, run your first scan, and see exactly what you've been overpaying — in about 3 minutes.</p>

    <a href="https://paybacker.co.uk" style="${cta}">Preview the app →</a>
  </div>
  ${Footer()}
</div>`,
  },

  // Day 21
  {
    id: 'day21_renewal',
    dayOffset: 21,
    subject: "Your energy contract might be renewing soon — here's what to do",
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">Is your energy contract renewing soon, ${name}?</h1>
    <p style="${p}">Most energy and broadband contracts auto-renew into a more expensive tariff. The provider is required to notify you — but the notice is usually buried in a boring email most people ignore.</p>

    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 12px;font-size:14px;">WHAT TO DO AT RENEWAL</p>
      <ul style="color:#94a3b8;padding-left:18px;margin:0;line-height:2.2;font-size:14px;">
        <li><strong style="color:#e2e8f0;">30 days before:</strong> Contact them to negotiate — you have the most leverage here.</li>
        <li><strong style="color:#e2e8f0;">On renewal day:</strong> You can still cancel within 14 days under the Consumer Contracts Regulations 2013.</li>
        <li><strong style="color:#e2e8f0;">After renewal:</strong> If they raised the price without adequate notice, you have a formal complaint right.</li>
      </ul>
    </div>

    <p style="${p}">Paybacker's inbox scanner detects upcoming renewals automatically — so you never miss the window to act.</p>

    <a href="https://paybacker.co.uk" style="${cta}">Get early access →</a>
  </div>
  ${Footer()}
</div>`,
  },

  // Day 28
  {
    id: 'day28_upgrade',
    dayOffset: 28,
    subject: "Early access is open — your first month is on us",
    html: (name) => `
<div style="${wrap}">
  <div style="${header}">${Logo()}</div>
  <div style="${body}">
    <h1 style="${h1}">Early access is open, ${name} — your first month is free</h1>
    <p style="${p}">Paybacker is now in early access. As a waitlist member, your first month is free on any paid plan.</p>

    <div style="${box}">
      <p style="color:#f59e0b;font-weight:700;margin:0 0 12px;font-size:15px;">WHAT YOU GET FROM DAY ONE</p>
      <ul style="color:#94a3b8;padding-left:18px;line-height:2.2;margin:0;font-size:14px;">
        <li>Connect Gmail — inbox scanner runs immediately</li>
        <li>See every overcharge, subscription, and renewal alert</li>
        <li>Generate complaint letters citing Consumer Rights Act 2015</li>
        <li>AI cancellation emails for every unwanted subscription</li>
        <li>Review and send from your own email — in under a minute</li>
      </ul>
    </div>

    <p style="${p}">Essential is £9.99/month — less than most forgotten subscriptions we find in the first scan.</p>

    <a href="https://paybacker.co.uk/auth/signup" style="${cta}">Claim your free month →</a>

    <p style="color:#64748b;font-size:13px;margin-top:16px;">
      Use code <strong style="color:#f59e0b;">WAITLIST</strong> at checkout for your free first month.
    </p>
  </div>
  ${Footer()}
</div>`,
  },
];

// ─── Send helper ──────────────────────────────────────────────────────────────

export async function sendSequenceEmail(
  email: string,
  name: string,
  sequenceId: string
): Promise<boolean> {
  const template = WAITLIST_SEQUENCE.find((s) => s.id === sequenceId);
  if (!template) return false;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: email,
      subject: template.subject,
      html: template.html(name || 'there'),
    });
    return true;
  } catch (err) {
    console.error(`Failed to send sequence email ${sequenceId} to ${email}:`, err);
    return false;
  }
}
