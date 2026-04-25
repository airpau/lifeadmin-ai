import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

export interface MorningDigestPriceAlert {
  merchantNormalized: string;
  oldAmount: number;
  newAmount: number;
  increasePct: number;
  annualImpact: number;
}

export interface MorningDigestRenewal {
  provider_name: string;
  amount: number;
  category: string | null;
  next_billing_date: string;
  billing_cycle: string;
  contract_type?: string | null;
  provider_type?: string | null;
  daysUntilRenewal: number;
}

const PAYMENT_CONTRACT_TYPES = new Set(['loan', 'mortgage', 'lease']);
const PAYMENT_PROVIDER_TYPES = new Set(['loan', 'mortgage', 'credit_card']);
const PAYMENT_CATEGORIES = new Set(['loan', 'mortgage', 'credit_card', 'finance', 'debt']);

function isScheduledPayment(r: MorningDigestRenewal): boolean {
  if (r.contract_type && PAYMENT_CONTRACT_TYPES.has(r.contract_type.toLowerCase())) return true;
  if (r.provider_type && PAYMENT_PROVIDER_TYPES.has(r.provider_type.toLowerCase())) return true;
  if (r.category && PAYMENT_CATEGORIES.has(r.category.toLowerCase())) return true;
  return false;
}

const FONT = '-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif';

function buildPriceAlertsSection(alerts: MorningDigestPriceAlert[]): string {
  if (alerts.length === 0) return '';

  const totalAnnual = alerts.reduce((s, a) => s + a.annualImpact, 0);

  const rows = alerts.map((a) => `
      <tr>
        <td style="padding:14px 32px;border-bottom:1px solid #1e3a5f;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="font-size:14px;font-weight:700;color:#ffffff;font-family:${FONT};">${a.merchantNormalized}</td>
              <td style="text-align:right;font-size:13px;font-weight:700;color:#ef4444;font-family:${FONT};">+${a.increasePct}%</td>
            </tr>
            <tr>
              <td style="padding-top:4px;font-size:12px;color:#94a3b8;font-family:${FONT};">
                &pound;${a.oldAmount.toFixed(2)} &rarr; <span style="color:#ef4444;">&pound;${a.newAmount.toFixed(2)}</span>
              </td>
              <td style="text-align:right;padding-top:4px;font-size:12px;color:#34d399;font-family:${FONT};">
                +&pound;${a.annualImpact.toFixed(0)}/yr
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding-top:8px;">
                <a href="https://paybacker.co.uk/dashboard/complaints?company=${encodeURIComponent(a.merchantNormalized)}&issue=${encodeURIComponent(`price increase from £${a.oldAmount.toFixed(2)} to £${a.newAmount.toFixed(2)}`)}" style="font-size:12px;color:#34d399;text-decoration:underline;font-family:${FONT};">Write complaint letter &rarr;</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`).join('');

  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td style="padding:20px 32px 12px;">
          <table cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="background-color:#2d1515;border:1px solid #7f1d1d;padding:5px 12px;">
                <span style="font-size:11px;font-weight:700;color:#ef4444;font-family:${FONT};text-transform:uppercase;letter-spacing:0.06em;">
                  ${alerts.length === 1 ? '1 Price Increase Detected' : `${alerts.length} Price Increases Detected`}
                </span>
              </td>
            </tr>
          </table>
          <p style="margin:10px 0 0;font-size:13px;color:#94a3b8;font-family:${FONT};line-height:1.5;">
            ${alerts.length === 1 ? 'This increase costs' : 'These increases cost'} you an extra &pound;${totalAnnual.toFixed(0)} per year.
          </p>
        </td>
      </tr>
      ${rows}
    </table>`;
}

function buildRenewalsSection(renewals: MorningDigestRenewal[], hasPriceAlerts: boolean): string {
  if (renewals.length === 0) return '';

  const sorted = [...renewals].sort((a, b) => a.daysUntilRenewal - b.daysUntilRenewal);
  const hasCancellable = sorted.some((r) => !isScheduledPayment(r));

  const rows = sorted.map((r) => {
    const urgencyColor = r.daysUntilRenewal <= 7 ? '#ef4444' : '#94a3b8';
    const verb = isScheduledPayment(r) ? 'due' : 'renews';
    const dateLabel = new Date(r.next_billing_date).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'long',
    });
    return `
      <tr>
        <td style="padding:14px 32px;border-bottom:1px solid #1e3a5f;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="font-size:14px;font-weight:700;color:#ffffff;font-family:${FONT};">${r.provider_name}</td>
              <td style="text-align:right;font-size:15px;font-weight:700;color:#ffffff;font-family:${FONT};">&pound;${r.amount.toFixed(2)}</td>
            </tr>
            <tr>
              <td style="padding-top:4px;font-size:12px;color:#94a3b8;font-family:${FONT};">
                ${r.category || (isScheduledPayment(r) ? 'payment' : 'subscription')} &middot; ${verb} ${dateLabel}
              </td>
              <td style="text-align:right;padding-top:4px;font-size:12px;color:${urgencyColor};font-family:${FONT};">
                in ${r.daysUntilRenewal} days
              </td>
            </tr>
          </table>
        </td>
      </tr>`;
  }).join('');

  const borderTop = hasPriceAlerts ? 'border-top:1px solid #1e3a5f;' : '';

  const didYouKnow = hasCancellable ? `
      <tr>
        <td style="padding:14px 32px;border-top:1px solid #1e3a5f;">
          <p style="margin:0;font-size:12px;color:#94a3b8;font-family:${FONT};line-height:1.5;">
            <span style="color:#34d399;font-weight:600;">Did you know?</span> Paybacker generates a cancellation email for any subscription in seconds, citing UK consumer law. Click any subscription in your dashboard.
          </p>
        </td>
      </tr>` : '';

  return `
    <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
      <tr>
        <td style="padding:20px 32px 12px;${borderTop}">
          <table cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="background-color:#0d2a3b;border:1px solid #164e63;padding:5px 12px;">
                <span style="font-size:11px;font-weight:700;color:#38bdf8;font-family:${FONT};text-transform:uppercase;letter-spacing:0.06em;">
                  ${renewals.length} ${renewals.length === 1 ? 'Renewal' : 'Renewals'} Coming Up
                </span>
              </td>
            </tr>
          </table>
          <p style="margin:10px 0 0;font-size:13px;color:#94a3b8;font-family:${FONT};line-height:1.5;">
            ${hasCancellable ? 'Check if you still need these before they renew.' : 'Make sure you have enough in your account for these payments.'}
          </p>
        </td>
      </tr>
      ${rows}
      ${didYouKnow}
    </table>`;
}

export function buildMorningDigestEmail(
  userName: string,
  priceAlerts: MorningDigestPriceAlert[],
  renewals: MorningDigestRenewal[],
): { subject: string; html: string } {
  const hasPriceAlerts = priceAlerts.length > 0;
  const hasRenewals = renewals.length > 0;

  // Subject
  let subject: string;
  if (hasPriceAlerts && hasRenewals) {
    const minDays = Math.min(...renewals.map((r) => r.daysUntilRenewal));
    subject = `Paybacker digest: ${priceAlerts.length} price ${priceAlerts.length === 1 ? 'increase' : 'increases'} + ${renewals.length} ${renewals.length === 1 ? 'renewal' : 'renewals'} in ${minDays} days`;
  } else if (hasPriceAlerts) {
    const total = priceAlerts.reduce((s, a) => s + a.annualImpact, 0);
    subject = priceAlerts.length === 1
      ? `Price increase detected: ${priceAlerts[0].merchantNormalized} went up ${priceAlerts[0].increasePct}%`
      : `${priceAlerts.length} price increases detected — £${total.toFixed(0)} extra per year`;
  } else {
    const minDays = hasRenewals ? Math.min(...renewals.map((r) => r.daysUntilRenewal)) : 0;
    subject = renewals.length === 1
      ? `${renewals[0].provider_name} renews in ${minDays} days`
      : `${renewals.length} subscriptions renewing in ${minDays} days`;
  }

  const priceSection = buildPriceAlertsSection(priceAlerts);
  const renewalSection = buildRenewalsSection(renewals, hasPriceAlerts);

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
              </span><br>
              <span style="font-size:11px;color:#475569;font-family:${FONT};letter-spacing:0.08em;text-transform:uppercase;">Morning Digest</span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#0f1e35;">

              <!-- Greeting -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="padding:28px 32px 20px;border-bottom:1px solid #1e3a5f;">
                    <p style="margin:0;font-size:16px;color:#e2e8f0;font-family:${FONT};line-height:1.6;">
                      Good morning, <strong>${userName}</strong>. Here is your daily digest.
                    </p>
                  </td>
                </tr>
              </table>

              ${priceSection}
              ${renewalSection}

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding:24px 32px 28px;border-top:1px solid #1e3a5f;">
                    <a href="https://paybacker.co.uk/dashboard" style="display:inline-block;background-color:#34d399;color:#0a1628;font-size:15px;font-weight:700;padding:14px 36px;text-decoration:none;font-family:${FONT};">
                      Open Dashboard &rarr;
                    </a>
                  </td>
                </tr>
              </table>

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

export async function sendMorningDigest(
  email: string,
  userName: string,
  priceAlerts: MorningDigestPriceAlert[],
  renewals: MorningDigestRenewal[],
): Promise<boolean> {
  if (priceAlerts.length === 0 && renewals.length === 0) return false;

  const { subject, html } = buildMorningDigestEmail(userName, priceAlerts, renewals);

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: REPLY_TO,
      subject,
      html,
    });
    if (error) {
      console.error('morning-digest send failed:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('morning-digest send error:', err);
    return false;
  }
}
