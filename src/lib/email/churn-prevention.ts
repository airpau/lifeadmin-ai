import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import { renderEmail, emailStyles as s, emailTokens as t } from './layout';

type ChurnEmailType = 'inactive_7d' | 'inactive_14d' | 'pre_renewal';

const SUBJECTS: Record<ChurnEmailType, string> = {
  inactive_7d: 'We found new savings opportunities for you',
  inactive_14d: 'New savings detected since your last visit',
  pre_renewal: 'This month with Paybacker: here is what you saved',
};

function buildBody(type: ChurnEmailType, name: string, data: Record<string, any>): string {
  const cta = (text: string, href: string) =>
    `<div style="text-align:center;margin:28px 0;">
      <a href="${href}" style="${s.cta}">${text}</a>
    </div>`;

  if (type === 'inactive_7d') {
    const subCount = data.activeSubscriptions || 0;
    const monthlySpend = data.monthlySpend ? `£${Math.round(data.monthlySpend)}` : 'unknown';
    const expiringCount = data.expiringContracts || 0;

    return `
      <h1 style="${s.h1}">We've been keeping an eye on things, ${name}</h1>
      <p style="${s.p}">While you've been away, Paybacker has been monitoring your finances. Here's what we found:</p>

      <div style="${s.box}">
        <p style="color:${t.mintDeep};font-weight:700;margin:0 0 12px;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Your snapshot</p>
        <p style="color:${t.text};margin:0 0 8px;font-size:14px;"><strong style="${s.strong}">${subCount}</strong> active subscriptions costing <strong style="${s.strong}">${monthlySpend}/month</strong></p>
        ${expiringCount > 0 ? `<p style="color:${t.mintDeep};margin:0 0 8px;font-size:14px;font-weight:600;">${expiringCount} contract${expiringCount > 1 ? 's' : ''} expiring soon. Review before they auto-renew at a higher rate.</p>` : ''}
        <p style="color:${t.textMuted};margin:0;font-size:14px;">Log in to see if any of your providers have cheaper deals available.</p>
      </div>

      ${cta('Check your dashboard', 'https://paybacker.co.uk/dashboard')}

      <p style="${s.pSmall}">Tip: connect your bank account to automatically detect all subscriptions and get spending alerts.</p>`;
  }

  if (type === 'inactive_14d') {
    return `
      <h1 style="${s.h1}">It's been a while, ${name}</h1>
      <p style="${s.p}">We've noticed you haven't logged in for two weeks. Here are three quick things you can do in under 2 minutes:</p>

      <div style="${s.box}">
        <p style="${s.h3}">1. Run a quick scan</p>
        <p style="color:${t.text};margin:0 0 14px;font-size:14px;line-height:1.6;">Connect your email for 30 seconds and we'll find forgotten subscriptions, overcharges, and flight-delay claims you might qualify for.</p>
        <p style="${s.h3}">2. Review your renewals</p>
        <p style="color:${t.text};margin:0 0 14px;font-size:14px;line-height:1.6;">Your dashboard shows contracts coming up for renewal. Save hundreds by switching before they auto-renew.</p>
        <p style="${s.h3}">3. Write a complaint letter</p>
        <p style="color:${t.text};margin:0;font-size:14px;line-height:1.6;">Free accounts include 3 AI complaint letters per month. Describe an issue in plain English; we cite the exact UK law.</p>
      </div>

      ${cta('Jump back in', 'https://paybacker.co.uk/dashboard')}`;
  }

  // pre_renewal
  const letters = data.complaintLettersThisMonth || 0;
  const savings = data.potentialSavings ? `£${Math.round(data.potentialSavings)}` : '';
  return `
    <h1 style="${s.h1}">Your Paybacker month in review, ${name}</h1>
    <p style="${s.p}">Here's what Paybacker did for you this month — and a couple of things worth checking before your plan renews.</p>

    <div style="${s.box}">
      <p style="color:${t.text};margin:0 0 10px;font-size:14px;"><strong style="${s.strong}">${letters}</strong> AI complaint letter${letters === 1 ? '' : 's'} generated</p>
      ${savings ? `<p style="color:${t.mintDeep};margin:0 0 10px;font-size:14px;font-weight:600;">${savings} in detected savings across your bills</p>` : ''}
      <p style="color:${t.textMuted};margin:0;font-size:14px;">Keep your momentum — a quick dashboard visit pays back many times the subscription cost.</p>
    </div>

    ${cta('View your dashboard', 'https://paybacker.co.uk/dashboard')}`;
}

export async function sendChurnEmail(
  email: string,
  firstName: string,
  type: ChurnEmailType,
  data: Record<string, any> = {},
): Promise<boolean> {
  try {
    const name = firstName || 'there';
    const body = `
      ${buildBody(type, name, data)}
      <p style="${s.pMuted}">Paul, Founder</p>
    `;
    await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: email,
      subject: SUBJECTS[type],
      html: renderEmail({
        preheader: SUBJECTS[type],
        body,
      }),
    });
    return true;
  } catch (err: any) {
    console.error(`[churn] Failed to send ${type} to ${email}:`, err.message);
    return false;
  }
}
