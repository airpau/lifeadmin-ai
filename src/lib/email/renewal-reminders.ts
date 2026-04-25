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

  // Urgency badge
  const urgencyBg = daysUntilRenewal <= 7 ? '#fef2f2' : daysUntilRenewal <= 14 ? '#f0fdf4' : '#eff6ff';
  const urgencyBorder = daysUntilRenewal <= 7 ? '#fecaca' : daysUntilRenewal <= 14 ? '#bbf7d0' : '#bfdbfe';
  const urgencyColor = daysUntilRenewal <= 7 ? '#dc2626' : daysUntilRenewal <= 14 ? '#16a34a' : '#1d4ed8';
  const urgencyText = onlyPayments
    ? (daysUntilRenewal <= 7 ? 'Payments due soon' : daysUntilRenewal <= 14 ? 'Payments due in 2 weeks' : 'Upcoming payments')
    : (daysUntilRenewal <= 7 ? 'Renewing soon — act now' : daysUntilRenewal <= 14 ? 'Renewing in 2 weeks' : 'Upcoming renewal');

  const bannerSubtext = onlyPayments
    ? `&pound;${totalRenewing.toFixed(2)} due in the next ${daysUntilRenewal} days`
    : `&pound;${totalRenewing.toFixed(2)} renewing in the next ${daysUntilRenewal} days`;

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
    items.map((r, i) => `
      <tr style="background:${i % 2 === 0 ? '#ffffff' : '#f9fafb'};">
        <td style="padding:14px 16px; border-bottom:1px solid #e5e7eb;">
          <div style="color:#0a1628; font-size:14px; font-weight:600;">${r.provider_name}</div>
          <div style="color:#6b7280; font-size:12px; margin-top:2px;">${r.category || (labelType === 'renews' ? 'subscription' : 'payment')} &middot; ${labelType} ${new Date(r.next_billing_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</div>
        </td>
        <td style="padding:14px 16px; border-bottom:1px solid #e5e7eb; text-align:right;">
          <div style="color:#0a1628; font-size:16px; font-weight:700;">&pound;${r.amount.toFixed(2)}</div>
          <div style="color:#6b7280; font-size:11px;">/${r.billing_cycle}</div>
        </td>
      </tr>
    `).join('');

  // Table section(s)
  let tableContent: string;
  if (!hasPayments) {
    tableContent = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb; border-radius:8px; border-collapse:collapse; margin-bottom:24px;">
      ${buildRows(subscriptions, 'renews')}
    </table>`;
  } else if (onlyPayments) {
    tableContent = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb; border-radius:8px; border-collapse:collapse; margin-bottom:24px;">
      ${buildRows(payments, 'due')}
    </table>`;
  } else {
    tableContent = `
    <p style="color:#6b7280; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin:0 0 8px;">Subscriptions renewing</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb; border-radius:8px; border-collapse:collapse; margin-bottom:20px;">
      ${buildRows(subscriptions, 'renews')}
    </table>
    <p style="color:#6b7280; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em; margin:0 0 8px;">Upcoming payments</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb; border-radius:8px; border-collapse:collapse; margin-bottom:24px;">
      ${buildRows(payments, 'due')}
    </table>`;
  }

  // Deals section — only shown when there are cancellable subscriptions
  const dealsSection = hasSubscriptions ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:20px;">
          <p style="color:#16a34a; font-size:14px; font-weight:700; margin:0 0 10px;">Better deals available</p>
          <p style="color:#374151; font-size:13px; line-height:1.6; margin:0 0 16px;">
            Before these renew, check if you can save by switching. Your personalised deals page shows alternatives based on your current providers.
          </p>
          <table cellpadding="0" cellspacing="0">
            <tr>
              <td style="background:#059669; border-radius:6px; padding:12px 24px;">
                <a href="https://paybacker.co.uk/dashboard/deals" style="color:#ffffff; font-size:14px; font-weight:700; text-decoration:none;">See Your Personalised Deals &rarr;</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>` : '';

  const didYouKnow = hasSubscriptions ? `
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
      <tr>
        <td style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:8px; padding:16px;">
          <p style="color:#059669; font-size:13px; font-weight:600; margin:0 0 4px;">Did you know?</p>
          <p style="color:#6b7280; font-size:12px; line-height:1.5; margin:0;">
            Paybacker can generate a cancellation email for any subscription in seconds, citing the correct UK consumer law. Just click on any subscription in your dashboard.
          </p>
        </td>
      </tr>
    </table>` : '';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Upcoming renewals</title></head>
<body style="margin:0; padding:0; background:#f3f4f6; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;">
  <tr>
    <td align="center" style="padding:24px 16px;">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%;">

        <!-- Header -->
        <tr>
          <td style="background:#0a1628; border-radius:12px 12px 0 0; padding:20px 32px;">
            <span style="color:#ffffff; font-size:22px; font-weight:800; letter-spacing:-0.5px;">Pay<span style="color:#34d399;">backer</span></span>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="background:#ffffff; padding:32px 32px 24px;">

            <!-- Urgency badge -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
              <tr>
                <td style="background:${urgencyBg}; border:1px solid ${urgencyBorder}; border-radius:6px; padding:10px 16px; text-align:center;">
                  <div style="color:${urgencyColor}; font-size:14px; font-weight:700;">${urgencyText}</div>
                  <div style="color:#6b7280; font-size:13px; margin-top:4px;">${bannerSubtext}</div>
                </td>
              </tr>
            </table>

            <p style="color:#0a1628; font-size:15px; line-height:1.6; margin:0 0 20px;">
              Hi ${userName},<br><br>${bodyText}
            </p>

            ${tableContent}
            ${dealsSection}

            <!-- Review CTA -->
            <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
              <tr>
                <td style="background:#0a1628; border-radius:8px; padding:14px 28px;">
                  <a href="https://paybacker.co.uk/dashboard/subscriptions" style="color:#ffffff; font-size:14px; font-weight:700; text-decoration:none;">${onlyPayments ? 'Review Payments' : 'Review Subscriptions'} &rarr;</a>
                </td>
              </tr>
            </table>

            ${didYouKnow}

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb; border-top:1px solid #e5e7eb; border-radius:0 0 12px 12px; padding:20px 32px; text-align:center;">
            <p style="color:#6b7280; font-size:12px; line-height:1.6; margin:0;">
              Paybacker LTD &middot; <a href="https://paybacker.co.uk" style="color:#6b7280;">paybacker.co.uk</a>
              &middot; <a href="https://paybacker.co.uk/dashboard/profile" style="color:#6b7280;">Manage preferences</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
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
