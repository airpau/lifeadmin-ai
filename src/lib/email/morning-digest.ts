import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

export interface DigestPriceAlert {
  merchantNormalized: string;
  oldAmount: number;
  newAmount: number;
  increasePct: number;
  annualImpact: number;
}

export interface DigestRenewal {
  provider_name: string;
  amount: number;
  category: string | null;
  next_billing_date: string;
  billing_cycle: string;
  daysUntil: number;
  contract_type?: string | null;
  provider_type?: string | null;
}

const PAYMENT_CONTRACT_TYPES = new Set(['loan', 'mortgage', 'lease']);
const PAYMENT_PROVIDER_TYPES = new Set(['loan', 'mortgage', 'credit_card']);
const PAYMENT_CATEGORIES = new Set(['loan', 'mortgage', 'credit_card', 'finance', 'debt']);

function isScheduledPayment(r: DigestRenewal): boolean {
  if (r.contract_type && PAYMENT_CONTRACT_TYPES.has(r.contract_type.toLowerCase())) return true;
  if (r.provider_type && PAYMENT_PROVIDER_TYPES.has(r.provider_type.toLowerCase())) return true;
  if (r.category && PAYMENT_CATEGORIES.has(r.category.toLowerCase())) return true;
  return false;
}

function urgencyColor(days: number): string {
  return days <= 7 ? '#dc2626' : days <= 14 ? '#d97706' : '#2563eb';
}

function urgencyBg(days: number): string {
  return days <= 7 ? '#fef2f2' : days <= 14 ? '#fffbeb' : '#eff6ff';
}

function urgencyLabel(days: number): string {
  return days <= 7 ? 'Renewing Soon — Act Now' : days <= 14 ? 'Renewing in 2 Weeks' : 'Upcoming Renewal';
}

function buildPriceRow(alert: DigestPriceAlert): string {
  const complaintUrl = `https://paybacker.co.uk/dashboard/complaints?company=${encodeURIComponent(alert.merchantNormalized)}&issue=${encodeURIComponent(`price increase from £${alert.oldAmount.toFixed(2)} to £${alert.newAmount.toFixed(2)}`)}`;
  return `
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #fecaca;border-radius:8px;margin-bottom:8px;background:#fffafa;">
            <tr>
              <td style="padding:14px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="font-size:15px;font-weight:700;color:#0f172a;">${alert.merchantNormalized}</td>
                    <td align="right" style="font-size:14px;font-weight:700;color:#dc2626;white-space:nowrap;">+${alert.increasePct}%</td>
                  </tr>
                  <tr>
                    <td style="padding-top:5px;font-size:13px;color:#64748b;">Was &pound;${alert.oldAmount.toFixed(2)} &rarr; now &pound;${alert.newAmount.toFixed(2)}</td>
                    <td align="right" style="padding-top:5px;font-size:12px;font-weight:600;color:#dc2626;white-space:nowrap;">+&pound;${alert.annualImpact.toFixed(2)}/yr</td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding-top:10px;">
                      <a href="${complaintUrl}" style="font-size:12px;color:#34d399;text-decoration:underline;">Write complaint letter &rarr;</a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>`;
}

function buildRenewalRow(r: DigestRenewal, isLast: boolean): string {
  const isPayment = isScheduledPayment(r);
  const dateLabel = new Date(r.next_billing_date).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
  const typeLabel = isPayment ? 'payment due' : 'renews';
  const catLabel = r.category || (isPayment ? 'payment' : 'subscription');
  const borderStyle = isLast ? '' : 'border-bottom:1px solid #f1f5f9;';
  return `
              <tr>
                <td style="padding:13px 16px;${borderStyle}">
                  <p style="margin:0;font-size:14px;font-weight:600;color:#0f172a;">${r.provider_name}</p>
                  <p style="margin:3px 0 0;font-size:12px;color:#64748b;">${catLabel} &middot; ${typeLabel} ${dateLabel}</p>
                </td>
                <td align="right" style="padding:13px 16px;${borderStyle}white-space:nowrap;">
                  <p style="margin:0;font-size:15px;font-weight:700;color:#0f172a;">&pound;${r.amount.toFixed(2)}</p>
                  <p style="margin:2px 0 0;font-size:11px;color:#94a3b8;">/${r.billing_cycle}</p>
                </td>
              </tr>`;
}

export function buildMorningDigestEmail(
  userName: string,
  priceAlerts: DigestPriceAlert[],
  renewals: DigestRenewal[],
): { subject: string; html: string } {
  const hasAlerts = priceAlerts.length > 0;
  const hasRenewals = renewals.length > 0;

  // Subject line
  let subject: string;
  if (hasAlerts && hasRenewals) {
    const totalImpact = priceAlerts.reduce((s, a) => s + a.annualImpact, 0);
    subject = `${priceAlerts.length} price ${priceAlerts.length === 1 ? 'increase' : 'increases'} + ${renewals.length} ${renewals.length === 1 ? 'renewal' : 'renewals'} — your Paybacker digest`;
  } else if (hasAlerts) {
    const totalImpact = priceAlerts.reduce((s, a) => s + a.annualImpact, 0);
    subject = priceAlerts.length === 1
      ? `Price increase: ${priceAlerts[0].merchantNormalized} went up ${priceAlerts[0].increasePct}%`
      : `${priceAlerts.length} price increases detected — costing you £${totalImpact.toFixed(0)} extra per year`;
  } else {
    const minDays = Math.min(...renewals.map(r => r.daysUntil));
    subject = minDays <= 7
      ? `${renewals.length} ${renewals.length === 1 ? 'subscription renews' : 'subscriptions renew'} in ${minDays} days`
      : `Heads up: ${renewals.length} upcoming ${renewals.length === 1 ? 'renewal' : 'renewals'}`;
  }

  // Price increases section
  let priceSection = '';
  if (hasAlerts) {
    const totalImpact = priceAlerts.reduce((s, a) => s + a.annualImpact, 0);
    priceSection = `
        <!-- ===== PRICE INCREASES ===== -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:${hasRenewals ? '28px' : '8px'};">
          <tr>
            <td style="padding-bottom:12px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:12px 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="font-size:14px;font-weight:700;color:#dc2626;">${priceAlerts.length === 1 ? '&#9888;&#65039; Price Increase Detected' : `&#9888;&#65039; ${priceAlerts.length} Price Increases Detected`}</td>
                        <td align="right" style="font-size:13px;font-weight:600;color:#dc2626;white-space:nowrap;">&pound;${totalImpact.toFixed(2)}/yr extra</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td>
              ${priceAlerts.map(buildPriceRow).join('')}
            </td>
          </tr>
          <tr>
            <td style="padding-top:14px;">
              <p style="margin:0 0 12px;font-size:13px;color:#64748b;line-height:1.5;">You may be able to dispute ${priceAlerts.length === 1 ? 'this increase' : 'these increases'} or switch to a better deal.</p>
              <a href="https://paybacker.co.uk/dashboard/deals" style="display:inline-block;background:#34d399;color:#0f172a;font-weight:700;font-size:13px;padding:11px 22px;border-radius:8px;text-decoration:none;">Find Better Deals &rarr;</a>
            </td>
          </tr>
        </table>`;
  }

  // Divider between sections
  const divider = hasAlerts && hasRenewals ? `
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:28px;">
          <tr>
            <td style="border-top:1px solid #e2e8f0;font-size:0;line-height:0;">&nbsp;</td>
          </tr>
        </table>` : '';

  // Renewals section
  let renewalSection = '';
  if (hasRenewals) {
    const minDays = Math.min(...renewals.map(r => r.daysUntil));
    const bg = urgencyBg(minDays);
    const color = urgencyColor(minDays);
    const label = urgencyLabel(minDays);
    const totalAmt = renewals.reduce((s, r) => s + r.amount, 0);
    const hasSubscriptions = renewals.some(r => !isScheduledPayment(r));
    const sortedRenewals = [...renewals].sort((a, b) =>
      new Date(a.next_billing_date).getTime() - new Date(b.next_billing_date).getTime()
    );

    renewalSection = `
        <!-- ===== RENEWALS ===== -->
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:14px;">
          <tr>
            <td style="background:${bg};border:1px solid ${color}44;border-radius:8px;padding:12px 16px;">
              <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:14px;font-weight:700;color:${color};">${label}</td>
                  <td align="right" style="font-size:13px;color:${color};white-space:nowrap;">&pound;${totalAmt.toFixed(2)} due</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:8px;border-collapse:collapse;margin-bottom:16px;">
          <tbody>
            ${sortedRenewals.map((r, i) => buildRenewalRow(r, i === sortedRenewals.length - 1)).join('')}
          </tbody>
        </table>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:${hasSubscriptions ? '10px' : '0'};">
          <tr>
            <td>
              <a href="https://paybacker.co.uk/dashboard/subscriptions" style="display:inline-block;background:#f1f5f9;color:#334155;font-weight:600;font-size:13px;padding:11px 22px;border-radius:8px;text-decoration:none;">Review Subscriptions</a>
            </td>
          </tr>
        </table>
        ${hasSubscriptions ? `
        <table width="100%" cellpadding="0" cellspacing="0" border="0">
          <tr>
            <td style="padding-top:8px;">
              <a href="https://paybacker.co.uk/dashboard/deals" style="display:inline-block;background:#34d399;color:#0f172a;font-weight:700;font-size:13px;padding:11px 22px;border-radius:8px;text-decoration:none;">See Better Deals &rarr;</a>
            </td>
          </tr>
        </table>` : ''}`;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <title>Paybacker Morning Digest</title>
</head>
<body style="margin:0;padding:0;background-color:#f0f4f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0f4f8;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#0a1628;border-radius:16px 16px 0 0;padding:28px 40px;text-align:center;">
              <p style="margin:0;font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-0.5px;">Pay<span style="color:#34d399;">backer</span></p>
              <p style="margin:6px 0 0;font-size:12px;color:#64748b;letter-spacing:1px;text-transform:uppercase;">Morning Digest</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:32px 40px 28px;">

              <!-- Greeting -->
              <p style="margin:0 0 24px;font-size:16px;color:#0f172a;line-height:1.6;">Hi ${userName},</p>

              ${priceSection}
              ${divider}
              ${renewalSection}

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#0a1628;border-radius:0 0 16px 16px;padding:20px 40px;text-align:center;">
              <p style="margin:0 0 6px;font-size:12px;color:#64748b;">Paybacker LTD &middot; <a href="https://paybacker.co.uk" style="color:#34d399;text-decoration:none;">paybacker.co.uk</a></p>
              <p style="margin:0;font-size:12px;">
                <a href="https://paybacker.co.uk/dashboard/profile" style="color:#475569;text-decoration:underline;">Manage email preferences</a>
                &nbsp;&middot;&nbsp;
                <a href="https://paybacker.co.uk/dashboard/profile" style="color:#475569;text-decoration:underline;">Unsubscribe</a>
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
  priceAlerts: DigestPriceAlert[],
  renewals: DigestRenewal[],
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
      console.error('Morning digest send failed:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Morning digest send error:', err);
    return false;
  }
}
