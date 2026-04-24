import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import { renderEmail, emailStyles as s, emailTokens as t } from './layout';

interface PriceAlert {
  merchantNormalized: string;
  oldAmount: number;
  newAmount: number;
  increasePct: number;
  annualImpact: number;
}

function buildAlertRow(alert: PriceAlert): string {
  const complaintQuery = encodeURIComponent(`price increase from £${alert.oldAmount.toFixed(2)} to £${alert.newAmount.toFixed(2)}`);
  return `
    <div style="background:${t.cardBgMuted};border:1px solid ${t.cardBorder};border-radius:12px;padding:20px;margin:0 0 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 8px;">
        <tr>
          <td style="color:${t.textStrong};font-weight:700;font-size:15px;">${alert.merchantNormalized}</td>
          <td style="color:${t.red};font-weight:700;font-size:13px;text-align:right;">+${alert.increasePct}%</td>
        </tr>
      </table>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="color:${t.textMuted};font-size:13px;padding:4px 0;">Was &pound;${alert.oldAmount.toFixed(2)}</td>
          <td style="color:${t.red};font-size:13px;font-weight:600;padding:4px 0;text-align:right;">Now &pound;${alert.newAmount.toFixed(2)}</td>
        </tr>
        <tr>
          <td colspan="2" style="color:${t.mintDeep};font-size:12px;font-weight:600;padding:4px 0;">Extra &pound;${alert.annualImpact.toFixed(2)}/year</td>
        </tr>
      </table>
      <div style="margin-top:10px;">
        <a href="https://paybacker.co.uk/dashboard/complaints?company=${encodeURIComponent(alert.merchantNormalized)}&issue=${complaintQuery}" style="${s.link};font-size:12px;">Write complaint letter</a>
      </div>
    </div>`;
}

export function buildPriceIncreaseEmail(
  userName: string,
  alerts: PriceAlert | PriceAlert[],
): { subject: string; html: string } {
  const alertArray = Array.isArray(alerts) ? alerts : [alerts];
  const totalAnnualImpact = alertArray.reduce((sum, a) => sum + a.annualImpact, 0);

  const subject = alertArray.length === 1
    ? `Price increase detected: ${alertArray[0].merchantNormalized} went up by ${alertArray[0].increasePct}%`
    : `${alertArray.length} price increases detected — costing you £${totalAnnualImpact.toFixed(0)} extra per year`;

  const alertRows = alertArray.map(buildAlertRow).join('');

  const body = `
    <div style="text-align:center;margin:0 0 24px;">
      <span style="display:inline-block;background:#FEE2E2;border:1px solid #FECACA;border-radius:999px;padding:6px 14px;color:${t.red};font-weight:700;font-size:13px;">
        ${alertArray.length === 1 ? 'Price increase detected' : `${alertArray.length} price increases detected`}
      </span>
    </div>

    <p style="${s.p}">
      Hi ${userName}, we spotted ${alertArray.length === 1 ? 'a price increase' : `${alertArray.length} price increases`} on your payments${alertArray.length > 1 ? `, costing you an extra <strong style="${s.strong};color:${t.mintDeep};">&pound;${totalAnnualImpact.toFixed(2)}/year</strong>` : ''}.
    </p>

    ${alertRows}

    <p style="${s.pMuted}">
      You may be able to dispute ${alertArray.length === 1 ? 'this increase' : 'these increases'} or switch to a better deal.
    </p>

    <div style="text-align:center;margin:24px 0;">
      <a href="https://paybacker.co.uk/dashboard/deals" style="${s.cta}">Find better deals</a>
    </div>
  `;

  const html = renderEmail({
    preheader: alertArray.length === 1
      ? `${alertArray[0].merchantNormalized} raised its price by ${alertArray[0].increasePct}%.`
      : `£${totalAnnualImpact.toFixed(2)}/yr of extra charges detected.`,
    body,
  });

  return { subject, html };
}

/**
 * Send a consolidated price increase alert email via Resend.
 * Accepts a single alert or array of alerts — all sent in ONE email.
 */
export async function sendPriceIncreaseAlert(
  email: string,
  userName: string,
  alerts: PriceAlert | PriceAlert[],
): Promise<boolean> {
  const { subject, html } = buildPriceIncreaseEmail(userName, alerts);

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: REPLY_TO,
      subject,
      html,
    });

    if (error) {
      console.error('Failed to send price increase alert:', error);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Error sending price increase alert:', err);
    return false;
  }
}
