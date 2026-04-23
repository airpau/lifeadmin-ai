import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import { renderEmail, emailStyles as s, emailTokens as t } from './layout';

interface RenewalSubscription {
  provider_name: string;
  amount: number;
  category: string | null;
  next_billing_date: string;
  billing_cycle: string;
  contract_type?: string | null;
  provider_type?: string | null;
}

// Contract/provider types that are scheduled payments, not cancellable subscriptions.
// Loans, mortgages, and similar cannot be "switched" mid-term, so renewal language and
// deals CTAs are inappropriate for them.
const PAYMENT_CONTRACT_TYPES = new Set(['loan', 'mortgage', 'lease']);
const PAYMENT_PROVIDER_TYPES = new Set(['loan', 'mortgage', 'credit_card']);
const PAYMENT_CATEGORIES = new Set(['loan', 'mortgage', 'credit_card', 'finance', 'debt']);

function isScheduledPayment(sub: RenewalSubscription): boolean {
  if (sub.contract_type && PAYMENT_CONTRACT_TYPES.has(sub.contract_type.toLowerCase())) return true;
  if (sub.provider_type && PAYMENT_PROVIDER_TYPES.has(sub.provider_type.toLowerCase())) return true;
  if (sub.category && PAYMENT_CATEGORIES.has(sub.category.toLowerCase())) return true;
  return false;
}

/**
 * Build a renewal reminder email for upcoming subscription renewals and/or scheduled payments.
 * Subscriptions (Netflix, gym, broadband) get "renewing soon" language and deals CTAs.
 * Loans, mortgages, and direct debits get "upcoming payment" language with no deals section.
 */
export function buildRenewalEmail(
  userName: string,
  renewals: RenewalSubscription[],
  daysUntilRenewal: number,
): { subject: string; html: string } {
  const totalRenewing = renewals.reduce((sum, r) => sum + r.amount, 0);

  const subscriptions = renewals.filter((r) => !isScheduledPayment(r));
  const payments = renewals.filter((r) => isScheduledPayment(r));
  const hasSubscriptions = subscriptions.length > 0;
  const hasPayments = payments.length > 0;
  const onlyPayments = hasPayments && !hasSubscriptions;

  let subject: string;
  if (onlyPayments) {
    subject = daysUntilRenewal <= 7
      ? `${userName}, ${renewals.length} ${renewals.length === 1 ? 'payment' : 'payments'} due in ${daysUntilRenewal} days`
      : `Heads up: ${renewals.length} upcoming ${renewals.length === 1 ? 'payment' : 'payments'}`;
  } else if (!hasPayments) {
    subject = daysUntilRenewal <= 7
      ? `${userName}, ${renewals.length} ${renewals.length === 1 ? 'subscription renews' : 'subscriptions renew'} in ${daysUntilRenewal} days`
      : `Heads up: ${renewals.length} ${renewals.length === 1 ? 'renewal' : 'renewals'} coming up`;
  } else {
    subject = daysUntilRenewal <= 7
      ? `${userName}, upcoming renewals and payments in ${daysUntilRenewal} days`
      : `Heads up: renewals and payments coming up`;
  }

  // Urgency banner palette — red for imminent, mint for 2-week, blue for further out.
  const urgencyColor = daysUntilRenewal <= 7 ? t.red : daysUntilRenewal <= 14 ? t.mintDeep : t.blue;
  const urgencyBg = daysUntilRenewal <= 7 ? '#FEE2E2' : daysUntilRenewal <= 14 ? t.mintWash : '#DBEAFE';
  const urgencyBorder = daysUntilRenewal <= 7 ? '#FECACA' : daysUntilRenewal <= 14 ? '#BBF7D0' : '#BFDBFE';
  const urgencyText = onlyPayments
    ? (daysUntilRenewal <= 7 ? 'Payments due soon' : daysUntilRenewal <= 14 ? 'Payments due in 2 weeks' : 'Upcoming payments')
    : (daysUntilRenewal <= 7 ? 'Renewing soon — act now' : daysUntilRenewal <= 14 ? 'Renewing in 2 weeks' : 'Upcoming renewal');

  const bannerSubtext = onlyPayments
    ? `£${totalRenewing.toFixed(2)} due in the next ${daysUntilRenewal} days`
    : `£${totalRenewing.toFixed(2)} renewing in the next ${daysUntilRenewal} days`;

  let bodyText: string;
  if (onlyPayments) {
    bodyText = daysUntilRenewal <= 7
      ? 'These payments are due very soon. Make sure you have enough in your account.'
      : 'These payments are coming up. Here is what is due.';
  } else if (!hasPayments) {
    bodyText = daysUntilRenewal <= 7
      ? 'These subscriptions are renewing very soon. Now is the time to check if you still need them, or if there is a better deal available.'
      : 'These subscriptions are coming up for renewal. It is worth checking if you are still getting the best deal.';
  } else {
    bodyText = daysUntilRenewal <= 7
      ? 'Some of your subscriptions are renewing very soon and you also have scheduled payments due. Check for better deals on your subscriptions.'
      : 'You have subscriptions coming up for renewal and scheduled payments due. It is worth reviewing your subscriptions for better deals.';
  }

  const buildRows = (items: RenewalSubscription[], labelType: 'renews' | 'due') =>
    items.map((r) => `
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid ${t.cardBorder};">
          <div style="font-weight:600;color:${t.textStrong};font-size:14px;">${r.provider_name}</div>
          <div style="color:${t.textMuted};font-size:12px;margin-top:2px;">${r.category || (labelType === 'renews' ? 'subscription' : 'payment')} · ${labelType} ${new Date(r.next_billing_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</div>
        </td>
        <td style="padding:14px 16px;border-bottom:1px solid ${t.cardBorder};text-align:right;">
          <div style="font-weight:700;color:${t.textStrong};font-size:16px;">£${r.amount.toFixed(2)}</div>
          <div style="color:${t.textMuted};font-size:11px;">/${r.billing_cycle}</div>
        </td>
      </tr>
    `).join('');

  let tableContent: string;
  if (!hasPayments) {
    tableContent = `
    <table role="presentation" style="width:100%;background:${t.cardBg};border:1px solid ${t.cardBorder};border-radius:12px;border-collapse:separate;border-spacing:0;margin:0 0 24px;">
      ${buildRows(subscriptions, 'renews')}
    </table>`;
  } else if (onlyPayments) {
    tableContent = `
    <table role="presentation" style="width:100%;background:${t.cardBg};border:1px solid ${t.cardBorder};border-radius:12px;border-collapse:separate;border-spacing:0;margin:0 0 24px;">
      ${buildRows(payments, 'due')}
    </table>`;
  } else {
    tableContent = `
    <div style="color:${t.textMuted};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;">Subscriptions renewing</div>
    <table role="presentation" style="width:100%;background:${t.cardBg};border:1px solid ${t.cardBorder};border-radius:12px;border-collapse:separate;border-spacing:0;margin:0 0 20px;">
      ${buildRows(subscriptions, 'renews')}
    </table>
    <div style="color:${t.textMuted};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;margin:0 0 8px;">Upcoming payments</div>
    <table role="presentation" style="width:100%;background:${t.cardBg};border:1px solid ${t.cardBorder};border-radius:12px;border-collapse:separate;border-spacing:0;margin:0 0 24px;">
      ${buildRows(payments, 'due')}
    </table>`;
  }

  const dealsSection = hasSubscriptions ? `
    <div style="${s.tipBox}">
      <div style="color:${t.mintDeep};font-weight:700;font-size:14px;margin:0 0 8px;">Better deals available</div>
      <p style="color:${t.text};font-size:13px;line-height:1.6;margin:0 0 14px;">
        Before these renew, check if you can save by switching. Your personalised deals page shows alternatives based on your current providers.
      </p>
      <a href="https://paybacker.co.uk/dashboard/deals" style="${s.cta}">See your personalised deals &rarr;</a>
    </div>` : '';

  const didYouKnow = hasSubscriptions ? `
    <div style="${s.box}">
      <div style="color:${t.mintDeep};font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;margin:0 0 6px;">Did you know?</div>
      <p style="color:${t.text};font-size:13px;line-height:1.55;margin:0;">
        Paybacker can generate a cancellation email for any subscription in seconds, citing the correct UK consumer law. Just click any subscription in your dashboard.
      </p>
    </div>` : '';

  const body = `
    <div style="background:${urgencyBg};border:1px solid ${urgencyBorder};border-radius:12px;padding:16px;text-align:center;margin:0 0 24px;">
      <div style="color:${urgencyColor};font-weight:700;font-size:14px;">${urgencyText}</div>
      <div style="color:${t.textStrong};font-size:13px;margin-top:4px;">${bannerSubtext}</div>
    </div>

    <p style="${s.p}">Hi ${userName},</p>
    <p style="${s.p}">${bodyText}</p>

    ${tableContent}

    ${dealsSection}

    <div style="text-align:center;margin:24px 0;">
      <a href="https://paybacker.co.uk/dashboard/subscriptions" style="${s.ctaSecondary}">${onlyPayments ? 'Review payments' : 'Review subscriptions'}</a>
    </div>

    ${didYouKnow}
  `;

  const html = renderEmail({
    preheader: bannerSubtext,
    body,
  });

  return { subject, html };
}

/**
 * Send a renewal reminder email.
 */
export async function sendRenewalReminder(
  email: string,
  userName: string,
  renewals: RenewalSubscription[],
  daysUntilRenewal: number,
): Promise<boolean> {
  if (renewals.length === 0) return false;

  const { subject, html } = buildRenewalEmail(userName, renewals, daysUntilRenewal);

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: REPLY_TO,
      subject,
      html,
    });
    if (error) {
      console.error(`Renewal reminder failed for ${email}:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Renewal reminder error for ${email}:`, err);
    return false;
  }
}
