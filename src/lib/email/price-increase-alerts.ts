import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

interface PriceAlert {
  merchantNormalized: string;
  oldAmount: number;
  newAmount: number;
  increasePct: number;
  annualImpact: number;
}

function buildAlertRow(alert: PriceAlert): string {
  return `
    <div style="background: #1e293b; border-radius: 12px; padding: 20px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="color: #ffffff; font-weight: 700; font-size: 15px;">${alert.merchantNormalized}</span>
        <span style="color: #ef4444; font-weight: 700; font-size: 13px;">+${alert.increasePct}%</span>
      </div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
        <tr>
          <td style="color: #94a3b8; font-size: 13px; padding: 4px 0;">Was &pound;${alert.oldAmount.toFixed(2)}</td>
          <td style="color: #ef4444; font-size: 13px; font-weight: 600; padding: 4px 0; text-align: right;">Now &pound;${alert.newAmount.toFixed(2)}</td>
        </tr>
        <tr>
          <td colspan="2" style="color: #f59e0b; font-size: 12px; padding: 4px 0;">Extra &pound;${alert.annualImpact.toFixed(2)}/year</td>
        </tr>
      </table>
      <div style="margin-top: 8px;">
        <a href="https://paybacker.co.uk/dashboard/complaints?company=${encodeURIComponent(alert.merchantNormalized)}&issue=${encodeURIComponent(`price increase from £${alert.oldAmount.toFixed(2)} to £${alert.newAmount.toFixed(2)}`)}" style="color: #4ade80; font-size: 12px; text-decoration: underline;">Write complaint letter</a>
      </div>
    </div>`;
}

export function buildPriceIncreaseEmail(
  userName: string,
  alerts: PriceAlert | PriceAlert[]
): { subject: string; html: string } {
  const alertArray = Array.isArray(alerts) ? alerts : [alerts];
  const totalAnnualImpact = alertArray.reduce((sum, a) => sum + a.annualImpact, 0);

  const subject = alertArray.length === 1
    ? `Price increase detected: ${alertArray[0].merchantNormalized} went up by ${alertArray[0].increasePct}%`
    : `${alertArray.length} price increases detected - costing you £${totalAnnualImpact.toFixed(0)} extra per year`;

  const alertRows = alertArray.map(buildAlertRow).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <div style="text-align: center; padding: 24px 0;">
      <h1 style="color: #ffffff; font-size: 22px; margin: 0;">Pay<span style="color: #f59e0b;">backer</span></h1>
    </div>

    <div style="background: #0f172a; border-radius: 16px; padding: 32px; border: 1px solid #1e293b;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; background: #ef44441a; border: 1px solid #ef444433; border-radius: 12px; padding: 8px 16px;">
          <span style="color: #ef4444; font-weight: 700; font-size: 14px;">${alertArray.length === 1 ? 'Price Increase Detected' : `${alertArray.length} Price Increases Detected`}</span>
        </div>
      </div>

      <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
        Hi ${userName}, we spotted ${alertArray.length === 1 ? 'a price increase' : `${alertArray.length} price increases`} on your payments${alertArray.length > 1 ? `, costing you an extra <strong style="color: #f59e0b;">&pound;${totalAnnualImpact.toFixed(2)}/year</strong>` : ''}.
      </p>

      ${alertRows}

      <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 16px 0 24px;">
        You may be able to dispute ${alertArray.length === 1 ? 'this increase' : 'these increases'} or switch to a better deal.
      </p>

      <div style="text-align: center;">
        <a href="https://paybacker.co.uk/dashboard/deals" style="display: inline-block; background: #4ade80; color: #020617; font-weight: 700; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-size: 14px;">
          Find Better Deals
        </a>
      </div>
    </div>

    <div style="text-align: center; padding: 24px 0;">
      <p style="color: #475569; font-size: 12px; margin: 0;">
        Paybacker LTD &middot; <a href="https://paybacker.co.uk" style="color: #475569;">paybacker.co.uk</a>
      </p>
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

/**
 * Send a consolidated price increase alert email via Resend.
 * Accepts a single alert or array of alerts - all sent in ONE email.
 */
export async function sendPriceIncreaseAlert(
  email: string,
  userName: string,
  alerts: PriceAlert | PriceAlert[]
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
