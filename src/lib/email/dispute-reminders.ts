import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import { renderEmail, emailStyles as s, emailTokens as t } from './layout';

export async function sendDisputeReminderEmail(
  email: string,
  firstName: string,
  dispute: {
    id: string;
    providerName: string;
    daysOld: number;
    amount?: number | null;
  },
  isEscalation: boolean,
): Promise<boolean> {
  const name = firstName || 'there';
  const amountStr = dispute.amount ? ` (£${dispute.amount.toFixed(2)})` : '';

  let subject: string;
  let body: string;
  let preheader: string;

  if (isEscalation) {
    subject = `Your ${dispute.providerName} dispute is ${dispute.daysOld} days old — time to escalate`;
    preheader = `8-week threshold passed — the ombudsman can now step in.`;
    body = `
<h1 style="${s.h1}">It's time to escalate your dispute, ${name}</h1>
<p style="${s.p}">Your dispute with <strong style="${s.strong}">${dispute.providerName}</strong>${amountStr} has been open for ${dispute.daysOld} days.</p>

<div style="${s.dangerBox}">
  <p style="color:${t.red};font-weight:700;margin:0 0 6px;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Your consumer rights</p>
  <p style="color:${t.textStrong};margin:0;font-size:14px;line-height:1.6;">Under UK consumer law, if a company has not resolved your complaint within 8 weeks (56 days), you have the right to escalate your case to the relevant ombudsman or regulator free of charge.</p>
</div>

<p style="${s.p}">The ombudsman has the power to force companies to refund you, pay compensation, and issue official apologies.</p>

<div style="text-align:center;margin:28px 0;">
  <a href="https://paybacker.co.uk/dashboard/complaints/${dispute.id}" style="${s.cta}">Draft escalation letter</a>
</div>

<div style="${s.box}">
  <p style="${s.h3}">How to proceed</p>
  <ol style="color:${t.text};margin:0;font-size:14px;line-height:1.7;padding-left:20px;">
    <li>Go to your dispute in the dashboard</li>
    <li>Ask our AI: &ldquo;Help me draft an ombudsman referral&rdquo;</li>
    <li>Use the drafted letter to open your case</li>
  </ol>
</div>
`;
  } else {
    subject = `Follow up on your ${dispute.providerName} dispute`;
    preheader = `Filed ${dispute.daysOld} days ago — a quick follow-up can keep the pressure on.`;
    body = `
<h1 style="${s.h1}">Checking in on your dispute, ${name}</h1>
<p style="${s.p}">Your dispute with <strong style="${s.strong}">${dispute.providerName}</strong>${amountStr} was filed ${dispute.daysOld} days ago.</p>

<div style="${s.box}">
  <p style="${s.h3}">Have you received a response?</p>
  <p style="color:${t.text};margin:0;font-size:14px;line-height:1.6;">Most companies are required by industry guidelines to acknowledge official complaints within 5 working days.</p>
</div>

<p style="${s.p}">If they haven't replied, now is the perfect time to send a quick follow-up to keep the pressure on.</p>

<div style="text-align:center;margin:28px 0;">
  <a href="https://paybacker.co.uk/dashboard/complaints/${dispute.id}" style="${s.cta}">Update dispute status</a>
</div>

<p style="${s.pSmall}">Tip: you can ask the AI chat on the dispute page to <em>&ldquo;Help me follow up with ${dispute.providerName}&rdquo;</em> and it will write the email for you.</p>
`;
  }

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: email,
      subject,
      html: renderEmail({ preheader, body }),
    });
    if (error) {
      console.error(`Dispute reminder email failed for ${email}:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Dispute reminder email error for ${email}:`, err);
    return false;
  }
}
