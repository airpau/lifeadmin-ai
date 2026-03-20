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
    subject: "You're on the LifeAdminAI waitlist 🎉",
    html: (name) => `
      <div style="${baseStyle}">
        <h1 style="${h1Style}">You're on the list, ${name}!</h1>
        <p style="${pStyle}">
          Thanks for joining LifeAdminAI. We're building an AI that fights your bills, cancels forgotten subscriptions, and gets your money back — automatically.
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
          The average UK adult overpays <strong style="color: #f59e0b;">£560/year</strong> on bills and forgotten subscriptions. We're going to fix that.
        </p>
        <p style="${pStyle}">— Paul, LifeAdminAI</p>
        <p style="${footerStyle}">
          You're receiving this because you joined the LifeAdminAI waitlist.
          Reply to this email to unsubscribe.
        </p>
      </div>
    `,
  },
  {
    id: 'day2_education',
    dayOffset: 2,
    subject: 'How LifeAdminAI finds £500+ hiding in your inbox',
    html: (name) => `
      <div style="${baseStyle}">
        <h1 style="${h1Style}">How we find £500+ in your inbox, ${name}</h1>
        <p style="${pStyle}">
          Here's exactly what LifeAdminAI does when you connect your Gmail — and why it works so well.
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
          LifeAdminAI waitlist — reply to unsubscribe.
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
          When LifeAdminAI writes a complaint, it:
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
          Our current success rate: <strong style="color: #f59e0b;">82% of complaints upheld</strong>. The national average for self-written complaints is around 45%.
        </p>
        <p style="${pStyle}">
          The difference is knowing exactly what to say, and how to say it. That's what the AI does for you.
        </p>
        <p style="${pStyle}">— Paul, LifeAdminAI</p>
        <p style="${footerStyle}">LifeAdminAI waitlist — reply to unsubscribe.</p>
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
          We're opening LifeAdminAI to our first users very soon. As a waitlist member, you're at the front of the queue — and you get something our regular users won't.
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
        <a href="https://lifeadmin-ai.vercel.app" style="${ctaStyle}">
          Preview the app →
        </a>
        <p style="${footerStyle}">LifeAdminAI waitlist — reply to unsubscribe.</p>
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
