import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

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
  daysUntilRenewal: number
): { subject: string; html: string } {
  const totalRenewing = renewals.reduce((sum, r) => sum + r.amount, 0);

  const subscriptions = renewals.filter(r => !isScheduledPayment(r));
  const payments = renewals.filter(r => isScheduledPayment(r));
  const hasSubscriptions = subscriptions.length > 0;
  const hasPayments = payments.length > 0;
  const onlyPayments = hasPayments && !hasSubscriptions;

  // Subject line
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

  // Urgency banner
  const urgencyColor = daysUntilRenewal <= 7 ? '#ef4444' : daysUntilRenewal <= 14 ? '#f59e0b' : '#3b82f6';
  const urgencyText = onlyPayments
    ? (daysUntilRenewal <= 7 ? 'Payments due soon' : daysUntilRenewal <= 14 ? 'Payments due in 2 weeks' : 'Upcoming payments')
    : (daysUntilRenewal <= 7 ? 'Renewing soon — act now' : daysUntilRenewal <= 14 ? 'Renewing in 2 weeks' : 'Upcoming renewal');

  const bannerSubtext = onlyPayments
    ? `£${totalRenewing.toFixed(2)} due in the next ${daysUntilRenewal} days`
    : `£${totalRenewing.toFixed(2)} renewing in the next ${daysUntilRenewal} days`;

  // Body text
  let bodyText: string;
  if (onlyPayments) {
    bodyText = daysUntilRenewal <= 7
      ? 'These payments are due very soon. Make sure you have enough in your account.'
      : 'These payments are coming up. Here is what is due.';
  } else if (!hasPayments) {
    bodyText = daysUntilRenewal <= 7
      ? 'These subscriptions are renewing very soon. Now is the time to check if you still need them or if there is a better deal available.'
      : 'These subscriptions are coming up for renewal. It is worth checking if you are still getting the best deal.';
  } else {
    bodyText = daysUntilRenewal <= 7
      ? 'Some of your subscriptions are renewing very soon and you also have scheduled payments due. Check for better deals on your subscriptions.'
      : 'You have subscriptions coming up for renewal and scheduled payments due. It is worth reviewing your subscriptions for better deals.';
  }

  const buildRows = (items: RenewalSubscription[], labelType: 'renews' | 'due') =>
    items.map((r) => `
      <tr>
        <td style="padding: 14px 16px; border-bottom: 1px solid #1e293b;">
          <div style="font-weight: 600; color: #ffffff; font-size: 14px;">${r.provider_name}</div>
          <div style="color: #64748b; font-size: 12px; margin-top: 2px;">${r.category || (labelType === 'renews' ? 'subscription' : 'payment')} · ${labelType} ${new Date(r.next_billing_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</div>
        </td>
        <td style="padding: 14px 16px; border-bottom: 1px solid #1e293b; text-align: right;">
          <div style="font-weight: 700; color: #ffffff; font-size: 16px;">£${r.amount.toFixed(2)}</div>
          <div style="color: #64748b; font-size: 11px;">/${r.billing_cycle}</div>
        </td>
      </tr>
    `).join('');

  // Table section(s)
  let tableContent: string;
  if (!hasPayments) {
    tableContent = `
    <table style="width: 100%; background: #0a1628; border: 1px solid #1e293b; border-radius: 16px; border-collapse: collapse; margin-bottom: 24px;">
      ${buildRows(subscriptions, 'renews')}
    </table>`;
  } else if (onlyPayments) {
    tableContent = `
    <table style="width: 100%; background: #0a1628; border: 1px solid #1e293b; border-radius: 16px; border-collapse: collapse; margin-bottom: 24px;">
      ${buildRows(payments, 'due')}
    </table>`;
  } else {
    // Mixed — two labelled sections
    tableContent = `
    <div style="color: #94a3b8; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Subscriptions renewing</div>
    <table style="width: 100%; background: #0f172a; border: 1px solid #1e293b; border-radius: 16px; border-collapse: collapse; margin-bottom: 20px;">
      ${buildRows(subscriptions, 'renews')}
    </table>
    <div style="color: #94a3b8; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">Upcoming payments</div>
    <table style="width: 100%; background: #0a1628; border: 1px solid #1e293b; border-radius: 16px; border-collapse: collapse; margin-bottom: 24px;">
      ${buildRows(payments, 'due')}
    </table>`;
  }

  // Deals section — only shown when there are cancellable subscriptions
  const dealsSection = hasSubscriptions ? `
    <div style="background: #0a1628; border: 1px solid #34d39944; border-radius: 16px; padding: 20px; margin-bottom: 24px;">
      <div style="color: #34d399; font-weight: 700; font-size: 14px; margin-bottom: 12px;">Better deals available</div>
      <div style="color: #94a3b8; font-size: 13px; line-height: 1.6; margin-bottom: 16px;">
        Before these renew, check if you can save by switching. Your personalised deals page shows alternatives based on your current providers.
      </div>
      <a href="https://paybacker.co.uk/dashboard/deals" style="display: inline-block; background: #34d399; color: #0a1628; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 15px;">See Your Personalised Deals &rarr;</a>
    </div>` : '';

  // "Did you know" tip — only relevant for subscriptions
  const didYouKnow = hasSubscriptions ? `
    <div style="background: #0a1628; border: 1px solid #34d39922; border-radius: 12px; padding: 16px; margin-bottom: 24px;">
      <div style="color: #34d399; font-weight: 600; font-size: 13px; margin-bottom: 4px;">Did you know?</div>
      <div style="color: #94a3b8; font-size: 12px; line-height: 1.5;">
        Paybacker can generate a cancellation email for any subscription in seconds, citing the correct UK consumer law. Just click on any subscription in your dashboard.
      </div>
    </div>` : '';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <div style="text-align: center; padding: 24px 0;">
      <div style="font-size: 24px; font-weight: 700; color: #ffffff; background: #0a1628; padding: 12px 20px; border-radius: 8px; display: inline-block;">Pay<span style="color: #34d399;">backer</span></div>
    </div>

    <!-- Urgency Banner -->
    <div style="background: ${urgencyColor}22; border: 1px solid ${urgencyColor}44; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
      <div style="color: ${urgencyColor}; font-weight: 700; font-size: 14px;">${urgencyText}</div>
      <div style="color: #94a3b8; font-size: 13px; margin-top: 4px;">${bannerSubtext}</div>
    </div>

    <div style="color: #e2e8f0; font-size: 15px; margin-bottom: 20px; line-height: 1.6;">
      Hi ${userName},<br><br>
      ${bodyText}
    </div>

    ${tableContent}

    ${dealsSection}

    <div style="text-align: center; margin: 24px 0;">
      <a href="https://paybacker.co.uk/dashboard/subscriptions" style="display: inline-block; background: #34d399; color: #0a1628; padding: 14px 28px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 15px;">${onlyPayments ? 'Review Payments' : 'Review Subscriptions'}</a>
    </div>

    ${didYouKnow}

    <div style="text-align: center; padding: 24px 0; border-top: 1px solid #1e293b;">
      <div style="color: #64748b; font-size: 12px; line-height: 1.6;">
        Paybacker LTD &middot; paybacker.co.uk<br>
        <a href="https://paybacker.co.uk/dashboard/profile" style="color: #34d399; text-decoration: none;">Manage preferences</a>
      </div>
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

/**
 * Send a renewal reminder email.
 */
export async function sendRenewalReminder(
  email: string,
  userName: string,
  renewals: RenewalSubscription[],
  daysUntilRenewal: number
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
