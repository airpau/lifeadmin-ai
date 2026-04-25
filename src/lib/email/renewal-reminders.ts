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
const PAYMENT_CONTRACT_TYPES = new Set(['loan', 'mortgage', 'lease']);
const PAYMENT_PROVIDER_TYPES = new Set(['loan', 'mortgage', 'credit_card']);
const PAYMENT_CATEGORIES = new Set(['loan', 'mortgage', 'credit_card', 'finance', 'debt']);

function isScheduledPayment(sub: RenewalSubscription): boolean {
  if (sub.contract_type && PAYMENT_CONTRACT_TYPES.has(sub.contract_type.toLowerCase())) return true;
  if (sub.provider_type && PAYMENT_PROVIDER_TYPES.has(sub.provider_type.toLowerCase())) return true;
  if (sub.category && PAYMENT_CATEGORIES.has(sub.category.toLowerCase())) return true;
  return false;
}

const FONT = '-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif';

export function buildRenewalEmail(
  userName: string,
  renewals: RenewalSubscription[],
  daysUntilRenewal: number
): { subject: string; html: string } {
  const totalRenewing = renewals.reduce((sum, r) => sum + r.amount, 0);

  const subscriptions = renewals.filter((r) => !isScheduledPayment(r));
  const payments = renewals.filter((r) => isScheduledPayment(r));
  const hasSubscriptions = subscriptions.length > 0;
  const hasPayments = payments.length > 0;
  const onlyPayments = hasPayments && !hasSubscriptions;

  // Subject
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
  const urgencyBg = daysUntilRenewal <= 7 ? '#2d1515' : daysUntilRenewal <= 14 ? '#052e16' : '#0d2a3b';
  const urgencyBorder = daysUntilRenewal <= 7 ? '#7f1d1d' : daysUntilRenewal <= 14 ? '#14532d' : '#164e63';
  const urgencyColor = daysUntilRenewal <= 7 ? '#ef4444' : daysUntilRenewal <= 14 ? '#34d399' : '#38bdf8';
  const urgencyText = onlyPayments
    ? (daysUntilRenewal <= 7 ? 'Payments Due Soon' : daysUntilRenewal <= 14 ? 'Payments Due in 2 Weeks' : 'Upcoming Payments')
    : (daysUntilRenewal <= 7 ? 'Renewing Soon — Act Now' : daysUntilRenewal <= 14 ? 'Renewing in 2 Weeks' : 'Upcoming Renewal');

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
      ? 'Some of your subscriptions are renewing very soon and you also have scheduled payments due.'
      : 'You have subscriptions coming up for renewal and scheduled payments due.';
  }

  const buildRows = (items: RenewalSubscription[], verb: string) =>
    items.map((r) => {
      const dateLabel = new Date(r.next_billing_date).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'long',
      });
      return `
          <tr>
            <td style="padding:13px 24px;border-bottom:1px solid #1e3a5f;">
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="font-size:14px;font-weight:700;color:#ffffff;font-family:${FONT};">${r.provider_name}</td>
                  <td style="text-align:right;font-size:15px;font-weight:700;color:#ffffff;font-family:${FONT};">&pound;${r.amount.toFixed(2)}</td>
                </tr>
                <tr>
                  <td style="padding-top:3px;font-size:12px;color:#94a3b8;font-family:${FONT};">
                    ${r.category || (verb === 'renews' ? 'subscription' : 'payment')} &middot; ${verb} ${dateLabel}
                  </td>
                  <td style="text-align:right;padding-top:3px;font-size:11px;color:#475569;font-family:${FONT};">/${r.billing_cycle}</td>
                </tr>
              </table>
            </td>
          </tr>`;
    }).join('');

  // Build table section(s)
  let tableContent: string;
  if (!hasPayments) {
    tableContent = `
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-top:1px solid #1e3a5f;">
          ${buildRows(subscriptions, 'renews')}
        </table>`;
  } else if (onlyPayments) {
    tableContent = `
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-top:1px solid #1e3a5f;">
          ${buildRows(payments, 'due')}
        </table>`;
  } else {
    tableContent = `
        <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="border-top:1px solid #1e3a5f;">
          <tr>
            <td style="padding:10px 24px 4px;">
              <span style="font-size:11px;font-weight:700;color:#475569;font-family:${FONT};text-transform:uppercase;letter-spacing:0.06em;">Subscriptions renewing</span>
            </td>
          </tr>
          ${buildRows(subscriptions, 'renews')}
          <tr>
            <td style="padding:10px 24px 4px;border-top:1px solid #1e3a5f;">
              <span style="font-size:11px;font-weight:700;color:#475569;font-family:${FONT};text-transform:uppercase;letter-spacing:0.06em;">Upcoming payments</span>
            </td>
          </tr>
          ${buildRows(payments, 'due')}
        </table>`;
  }

  const dealsSection = hasSubscriptions ? `
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="padding:16px 24px;border-top:1px solid #1e3a5f;border-bottom:1px solid #1e3a5f;background-color:#091824;">
                <p style="margin:0 0 6px;font-size:13px;font-weight:700;color:#34d399;font-family:${FONT};">Better deals available</p>
                <p style="margin:0 0 12px;font-size:13px;color:#94a3b8;font-family:${FONT};line-height:1.5;">Before these renew, check if you can save by switching. Your personalised deals page shows alternatives based on your current providers.</p>
                <a href="https://paybacker.co.uk/dashboard/deals" style="display:inline-block;background-color:#34d399;color:#0a1628;font-size:14px;font-weight:700;padding:12px 24px;text-decoration:none;font-family:${FONT};">
                  See Your Personalised Deals &rarr;
                </a>
              </td>
            </tr>
          </table>` : '';

  const didYouKnow = hasSubscriptions ? `
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="padding:14px 24px;">
                <p style="margin:0;font-size:12px;color:#94a3b8;font-family:${FONT};line-height:1.5;">
                  <span style="color:#34d399;font-weight:600;">Did you know?</span> Paybacker can generate a cancellation email for any subscription in seconds, citing the correct UK consumer law. Click any subscription in your dashboard.
                </p>
              </td>
            </tr>
          </table>` : '';

  const html = `<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
</head>
<body style="margin:0;padding:0;background-color:#0a1628;">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="background-color:#0a1628;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" role="presentation" style="max-width:600px;width:100%;">

          <!-- Logo -->
          <tr>
            <td align="center" style="padding-bottom:24px;">
              <span style="font-size:28px;font-weight:800;color:#ffffff;font-family:${FONT};letter-spacing:-0.5px;">
                Pay<span style="color:#34d399;">backer</span>
              </span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#0f1e35;">

              <!-- Urgency banner -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding:20px 32px 16px;">
                    <table cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td style="background-color:${urgencyBg};border:1px solid ${urgencyBorder};padding:6px 14px;">
                          <span style="font-size:12px;font-weight:700;color:${urgencyColor};font-family:${FONT};text-transform:uppercase;letter-spacing:0.06em;">${urgencyText}</span>
                        </td>
                      </tr>
                    </table>
                    <p style="margin:8px 0 0;font-size:13px;color:#94a3b8;font-family:${FONT};">${bannerSubtext}</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 24px 16px;border-bottom:1px solid #1e3a5f;">
                    <p style="margin:0;font-size:15px;color:#e2e8f0;font-family:${FONT};line-height:1.6;">
                      Hi ${userName},<br>
                      ${bodyText}
                    </p>
                  </td>
                </tr>
              </table>

              ${tableContent}

              ${dealsSection}

              <!-- Review CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding:20px 24px;">
                    <a href="https://paybacker.co.uk/dashboard/subscriptions" style="display:inline-block;background-color:#1e3a5f;color:#e2e8f0;font-size:14px;font-weight:600;padding:13px 28px;text-decoration:none;font-family:${FONT};">
                      ${onlyPayments ? 'Review Payments' : 'Review Subscriptions'} &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              ${didYouKnow}

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:20px 0 8px;">
              <p style="margin:0;font-size:12px;color:#475569;font-family:${FONT};">
                Paybacker LTD &middot;
                <a href="https://paybacker.co.uk" style="color:#475569;text-decoration:none;">paybacker.co.uk</a>
                &middot;
                <a href="https://paybacker.co.uk/dashboard/profile" style="color:#34d399;text-decoration:none;">Manage preferences</a>
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
