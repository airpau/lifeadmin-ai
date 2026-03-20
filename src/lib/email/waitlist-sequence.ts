import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

export interface SequenceEmail {
  id: string;
  dayOffset: number; // days after signup
  subject: string;
  html: (name: string) => string;
}

const baseStyle = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  max-width: 600px;
  margin: 0 auto;
  background: #0f172a;
  color: #e2e8f0;
  padding: 40px 32px;
  border-radius: 16px;
`;

const h1Style = `color: #f59e0b; font-size: 26px; margin: 0 0 16px; line-height: 1.3;`;
const pStyle = `color: #94a3b8; font-size: 16px; line-height: 1.7; margin: 0 0 16px;`;
const boxStyle = `background: #1e293b; border-radius: 12px; padding: 24px; margin: 24px 0; border-left: 3px solid #f59e0b;`;
const ctaStyle = `display: inline-block; background: #f59e0b; color: #0f172a; font-weight: 700; font-size: 16px; padding: 14px 28px; border-radius: 8px; text-decoration: none; margin-top: 8px;`;
const footerStyle = `color: #334155; font-size: 13px; margin-top: 32px; padding-top: 24px; border-top: 1px solid #1e293b;`;

export const WAITLIST_SEQUENCE: SequenceEmail[] = [
  {
    id: 'welcome',
    dayOffset: 0,
    subject: "You're on the Paybacker waitlist 🎉",
    html: (name) => `
      <div style="${baseStyle}">
        <h1 style="${h1Style}">You're on the list, ${name}!</h1>
        <p style="${pStyle}">
          Thanks for joining Paybacker. We're building an AI that fights your bills, cancels forgotten subscriptions, and gets your money back — automatically.
        </p>
        <div style="${boxStyle}">
          <p style="color: #f59e0b; font-weight: 700; margin: 0 0 12px; font-size: 15px;">What to expect:</p>
          <ul style="color: #94a3b8; padding-left: 20px; line-height: 2; margin: 0;">
            <li>Early access invite when we launch</li>
            <li>3 months free for waitlist members</li>
            <li>Weekly tips on saving money with UK consumer law</li>
          </ul>
        </div>
        <p style="${pStyle}">
          The average UK adult overpays on bills and forgotten subscriptions every year. We're going to fix that.
        </p>
        <p style="${pStyle}">— Paul, Paybacker</p>
        <p style="${footerStyle}">
          You're receiving this because you joined the Paybacker waitlist.
          Reply to this email to unsubscribe.
        </p>
      </div>
    `,
  },
  {
    id: 'day2_education',
    dayOffset: 2,
    subject: 'How Paybacker finds money hiding in your inbox',
    html: (name) => `
      <div style="${baseStyle}">
        <h1 style="${h1Style}">How we find money in your inbox, ${name}</h1>
        <p style="${pStyle}">
          Here's exactly what Paybacker does when you connect your Gmail — and why it works so well.
        </p>
        <div style="${boxStyle}">
          <p style="color: #f59e0b; font-weight: 700; margin: 0 0 12px; font-size: 15px;">🔍 Step 1: Your inbox scanner runs</p>
          <p style="color: #94a3b8; margin: 0; line-height: 1.7;">Our AI reads your last 90 days of billing emails — energy, broadband, mobile, streaming. It looks for 4 things: overcharges, upcoming renewals, forgotten subscriptions, and missed refund windows.</p>
        </div>
        <div style="${boxStyle}">
          <p style="color: #f59e0b; font-weight: 700; margin: 0 0 12px; font-size: 15px;">💷 Step 2: It spots what you'd miss</p>
          <p style="color: #94a3b8; margin: 0; line-height: 1.7;">Most people don't notice when their broadband price quietly rises by £8/month. Or that they're still paying for a subscription they cancelled in their head 6 months ago. The AI catches all of it.</p>
        </div>
        <div style="${boxStyle}">
          <p style="color: #f59e0b; font-weight: 700; margin: 0 0 12px; font-size: 15px;">✅ Step 3: You approve, we handle it</p>
          <p style="color: #94a3b8; margin: 0; line-height: 1.7;">We generate the complaint letter or cancellation email — citing UK consumer law — and show it to you. One click to approve. We send it. You get your money back.</p>
        </div>
        <p style="${pStyle}">Early access is opening soon. You're already on the list.</p>
        <p style="${footerStyle}">
          Paybacker waitlist — reply to unsubscribe.
        </p>
      </div>
    `,
  },
  {
    id: 'day7_trust',
    dayOffset: 7,
    subject: 'Behind the scenes: how our AI writes complaints that actually work',
    html: (name) => `
      <div style="${baseStyle}">
        <h1 style="${h1Style}">The complaint letter that gets results, ${name}</h1>
        <p style="${pStyle}">
          Most complaint letters fail because they sound frustrated instead of legally informed. Here's what makes ours different.
        </p>
        <p style="${pStyle}">
          When Paybacker writes a complaint, it:
        </p>
        <div style="${boxStyle}">
          <ul style="color: #94a3b8; padding-left: 20px; line-height: 2.2; margin: 0;">
            <li><strong style="color: #e2e8f0;">Cites the exact legislation</strong> — Consumer Rights Act 2015, Ofcom, FCA rules. Companies take letters seriously when the law is named correctly.</li>
            <li><strong style="color: #e2e8f0;">Sets a 14-day deadline</strong> — legally significant for escalation to the Ombudsman.</li>
            <li><strong style="color: #e2e8f0;">Names the escalation path</strong> — Energy Ombudsman, Financial Ombudsman, Ofcom. Companies know what comes next if they don't respond.</li>
            <li><strong style="color: #e2e8f0;">States a specific remedy</strong> — refund amount, service credit, or account correction. Vague demands get vague responses.</li>
          </ul>
        </div>
        <p style="${pStyle}">
          The difference is knowing exactly what to say, and how to say it — citing the right section of the Consumer Rights Act 2015, naming the correct Ombudsman, setting the right deadline. That's what the AI does for you.
        </p>
        <p style="${pStyle}">— Paul, Paybacker</p>
        <p style="${footerStyle}">Paybacker waitlist — reply to unsubscribe.</p>
      </div>
    `,
  },
  {
    id: 'day5_education',
    dayOffset: 5,
    subject: '5 things your energy company hopes you never find out',
    html: (name) => `
      <div style="${baseStyle}">
        <h1 style="${h1Style}">5 things your energy company hopes you never find out, ${name}</h1>
        <p style="${pStyle}">
          UK energy companies collected £1.5 billion in excess profit in 2023. Some of that came from customers who simply didn't know their rights. Here's what they'd rather you didn't know.
        </p>
        <div style="${boxStyle}">
          <p style="color: #f59e0b; font-weight: 700; margin: 0 0 8px;">1. You can claim backdated refunds</p>
          <p style="color: #94a3b8; margin: 0; line-height: 1.7; font-size: 15px;">If you were overcharged, you're entitled to a refund going back up to 6 years. They won't volunteer this information.</p>
        </div>
        <div style="${boxStyle}">
          <p style="color: #f59e0b; font-weight: 700; margin: 0 0 8px;">2. A formal complaint triggers a legal clock</p>
          <p style="color: #94a3b8; margin: 0; line-height: 1.7; font-size: 15px;">Once you send a formal complaint, they have 8 weeks to resolve it — or you can escalate to the Energy Ombudsman, which costs them far more than just paying you.</p>
        </div>
        <div style="${boxStyle}">
          <p style="color: #f59e0b; font-weight: 700; margin: 0 0 8px;">3. "Price increases" have rules they must follow</p>
          <p style="color: #94a3b8; margin: 0; line-height: 1.7; font-size: 15px;">Under Ofgem rules, they must notify you in writing before increasing prices. If they didn't, you may have grounds for a complaint.</p>
        </div>
        <div style="${boxStyle}">
          <p style="color: #f59e0b; font-weight: 700; margin: 0 0 8px;">4. Exit fees are often unenforceable</p>
          <p style="color: #94a3b8; margin: 0; line-height: 1.7; font-size: 15px;">If they changed your tariff without consent, exit fees may not apply. Consumer Rights Act 2015, s.50 covers this.</p>
        </div>
        <div style="${boxStyle}">
          <p style="color: #f59e0b; font-weight: 700; margin: 0 0 8px;">5. You can cite the law by name in your complaint</p>
          <p style="color: #94a3b8; margin: 0; line-height: 1.7; font-size: 15px;">A letter citing "Consumer Rights Act 2015, s.54" lands very differently than "I'm unhappy with my bill." The legal reference signals you know what you're doing.</p>
        </div>
        <p style="${pStyle}">Paybacker writes letters that cite all of this — automatically.</p>
        <p style="${footerStyle}">Paybacker waitlist — reply to unsubscribe.</p>
      </div>
    `,
  },
  {
    id: 'day8_feature',
    dayOffset: 8,
    subject: 'The subscriptions agent: finding £47/month in forgotten charges',
    html: (name) => `
      <div style="${baseStyle}">
        <h1 style="${h1Style}">Found: £47/month in forgotten subscriptions, ${name}</h1>
        <p style="${pStyle}">
          When someone connects their Gmail to Paybacker, the subscriptions agent runs immediately. Here's the kind of thing it typically finds.
        </p>
        <div style="${boxStyle}">
          <p style="color: #f59e0b; font-weight: 700; margin: 0 0 12px;">What the AI looks for:</p>
          <ul style="color: #94a3b8; padding-left: 20px; line-height: 2.2; margin: 0;">
            <li>Recurring charges from services you forgot you signed up for</li>
            <li>Free trials that quietly converted to paid plans</li>
            <li>Duplicate subscriptions (two music services, two cloud storage plans)</li>
            <li>Annual renewals hitting your account without warning</li>
            <li>Services you cancelled in your head but never actually cancelled</li>
          </ul>
        </div>
        <p style="${pStyle}">
          For every subscription it finds, the AI drafts a cancellation email. Professional, polite, and legally grounded. You approve. We send it.
        </p>
        <p style="${pStyle}">
          Most people are surprised by at least one thing. The average? Around £40–60/month in subscriptions they'd genuinely forgotten about.
        </p>
        <p style="${pStyle}">Your early access invite is coming soon.</p>
        <p style="${footerStyle}">Paybacker waitlist — reply to unsubscribe.</p>
      </div>
    `,
  },
  {
    id: 'day14_urgency',
    dayOffset: 14,
    subject: 'Early access is opening soon — here\'s what you get',
    html: (name) => `
      <div style="${baseStyle}">
        <h1 style="${h1Style}">Early access is almost here, ${name}</h1>
        <p style="${pStyle}">
          We're opening Paybacker to our first users very soon. As a waitlist member, you're at the front of the queue — and you get something our regular users won't.
        </p>
        <div style="${boxStyle}">
          <p style="color: #f59e0b; font-weight: 700; margin: 0 0 12px; font-size: 17px;">Your early access benefits:</p>
          <ul style="color: #94a3b8; padding-left: 20px; line-height: 2.2; margin: 0;">
            <li>✅ <strong style="color: #e2e8f0;">3 months free</strong> on any paid plan</li>
            <li>✅ <strong style="color: #e2e8f0;">Founding member badge</strong> on your profile</li>
            <li>✅ <strong style="color: #e2e8f0;">Direct input</strong> on which agents we build next</li>
            <li>✅ <strong style="color: #e2e8f0;">Locked-in pricing</strong> — your rate never increases</li>
          </ul>
        </div>
        <p style="${pStyle}">
          When you get your invite, you'll be able to connect your Gmail, run your first scan, and see exactly what you've been overpaying — in about 3 minutes.
        </p>
        <p style="${pStyle}">
          Keep an eye on your inbox. Your invite is coming.
        </p>
        <a href="https://paybacker.co.uk" style="${ctaStyle}">
          Preview the app →
        </a>
        <p style="${footerStyle}">Paybacker waitlist — reply to unsubscribe.</p>
      </div>
    `,
  },
  {
    id: 'day21_renewal',
    dayOffset: 21,
    subject: 'Your energy contract might be renewing soon — here\'s what to do',
    html: (name) => `
      <div style="${baseStyle}">
        <h1 style="${h1Style}">Is your energy contract renewing soon, ${name}?</h1>
        <p style="${pStyle}">
          Most energy and broadband contracts auto-renew into a more expensive tariff. The provider is required to notify you — but the notice is usually buried in a boring email most people ignore.
        </p>
        <div style="${boxStyle}">
          <p style="color: #f59e0b; font-weight: 700; margin: 0 0 12px; font-size: 15px;">What happens at renewal (and what you can do):</p>
          <ul style="color: #94a3b8; padding-left: 20px; line-height: 2.2; margin: 0;">
            <li><strong style="color: #e2e8f0;">30 days before:</strong> Contact them to negotiate. You have the most leverage here.</li>
            <li><strong style="color: #e2e8f0;">On renewal day:</strong> You can still cancel within 14 days under the Consumer Contracts Regulations 2013.</li>
            <li><strong style="color: #e2e8f0;">After renewal:</strong> If they raised the price without adequate notice, you have a complaint.</li>
          </ul>
        </div>
        <p style="${pStyle}">
          Paybacker's inbox scanner detects upcoming renewals automatically — so you never miss the window to act.
        </p>
        <p style="${pStyle}">
          Early access is almost here. Keep an eye on your inbox.
        </p>
        <p style="${footerStyle}">Paybacker waitlist — reply to unsubscribe.</p>
      </div>
    `,
  },
  {
    id: 'day28_upgrade',
    dayOffset: 28,
    subject: 'Early access is here — your first month is on us',
    html: (name) => `
      <div style="${baseStyle}">
        <h1 style="${h1Style}">Early access is open, ${name} — and your first month is free</h1>
        <p style="${pStyle}">
          Paybacker is now in early access. As a waitlist member, you get your first month free on any paid plan — no questions asked.
        </p>
        <div style="${boxStyle}">
          <p style="color: #f59e0b; font-weight: 700; margin: 0 0 12px; font-size: 17px;">What you get from day one:</p>
          <ul style="color: #94a3b8; padding-left: 20px; line-height: 2.2; margin: 0;">
            <li>✅ Connect Gmail — inbox scanner runs immediately</li>
            <li>✅ See every overcharge, forgotten subscription, and renewal alert</li>
            <li>✅ Generate complaint letters citing the Consumer Rights Act 2015</li>
            <li>✅ AI-drafted cancellation emails for every unwanted subscription</li>
            <li>✅ One-click approve — we handle the rest</li>
          </ul>
        </div>
        <p style="${pStyle}">
          The Essential plan is £9.99/month — less than most forgotten subscriptions we find in the first scan.
        </p>
        <a href="https://paybacker.co.uk/auth/signup" style="${ctaStyle}">
          Claim your free month →
        </a>
        <p style="color: #64748b; font-size: 13px; margin-top: 16px;">
          Use code <strong style="color: #f59e0b;">WAITLIST</strong> at checkout for your free first month.
        </p>
        <p style="${footerStyle}">Paybacker — reply to unsubscribe.</p>
      </div>
    `,
  },
];

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
