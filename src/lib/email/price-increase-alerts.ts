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
    <tr>
      <td style="padding:0 0 10px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="background:#fffbf5; border:1px solid #fde68a; border-radius:8px;">
          <tr>
            <td style="padding:16px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td><span style="color:#0a1628; font-size:15px; font-weight:600;">${alert.merchantNormalized}</span></td>
                  <td align="right"><span style="color:#b45309; font-size:14px; font-weight:700;">+${alert.increasePct}%</span></td>
                </tr>
                <tr>
                  <td style="padding-top:4px;"><span style="color:#6b7280; font-size:13px;">Was &pound;${alert.oldAmount.toFixed(2)} &rarr; now &pound;${alert.newAmount.toFixed(2)}</span></td>
                  <td align="right" style="padding-top:4px;"><span style="color:#b45309; font-size:12px; font-weight:600;">+&pound;${alert.annualImpact.toFixed(2)}/yr</span></td>
                </tr>
                <tr>
                  <td colspan="2" style="padding-top:10px;">
                    <a href="https://paybacker.co.uk/dashboard/complaints?company=${encodeURIComponent(alert.merchantNormalized)}&issue=${encodeURIComponent(`price increase from £${alert.oldAmount.toFixed(2)} to £${alert.newAmount.toFixed(2)}`)}" style="color:#059669; font-size:13px; text-decoration:underline;">Write complaint letter &rarr;</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>`;
}

export function buildPriceIncreaseEmail(
  userName: string,
  alerts: PriceAlert | PriceAlert[]
): { subject: string; html: string } {
  const alertArray = Array.isArray(alerts) ? alerts : [alerts];
  const totalAnnualImpact = alertArray.reduce((sum, a) => sum + a.annualImpact, 0);

  const subject = alertArray.length === 1
    ? `Price increase detected: ${alertArray[0].merchantNormalized} went up by ${alertArray[0].increasePct}%`
    : `${alertArray.length} price increases detected — costing you &pound;${totalAnnualImpact.toFixed(0)} extra per year`;

  const alertRows = alertArray.map(buildAlertRow).join('');

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Price increase detected</title></head>
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

            <!-- Badge -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
              <tr>
                <td style="background:#fff7ed; border:1px solid #fde68a; border-radius:6px; padding:5px 12px;">
                  <span style="color:#b45309; font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:0.06em;">${alertArray.length === 1 ? 'Price increase detected' : `${alertArray.length} price increases detected`}</span>
                </td>
              </tr>
            </table>

            <p style="color:#0a1628; font-size:16px; line-height:1.6; margin:0 0 24px;">
              Hi ${userName}, we spotted ${alertArray.length === 1 ? 'a price increase' : `${alertArray.length} price increases`} on your recurring payments${alertArray.length > 1 ? `, costing you an extra <strong>&pound;${totalAnnualImpact.toFixed(2)}/year</strong>` : ''}.
            </p>

            <!-- Alert rows -->
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
              ${alertRows}
            </table>

            <p style="color:#6b7280; font-size:14px; line-height:1.6; margin:0 0 24px;">
              You may be able to dispute ${alertArray.length === 1 ? 'this increase' : 'these increases'} or switch to a better deal.
            </p>

            <!-- CTA -->
            <table cellpadding="0" cellspacing="0" style="margin-bottom:8px;">
              <tr>
                <td style="background:#059669; border-radius:8px; padding:14px 28px;">
                  <a href="https://paybacker.co.uk/dashboard/deals" style="color:#ffffff; font-size:14px; font-weight:700; text-decoration:none;">Find Better Deals &rarr;</a>
                </td>
              </tr>
            </table>

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
