import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

interface PriceAlert {
  merchantNormalized: string;
  oldAmount: number;
  newAmount: number;
  increasePct: number;
  annualImpact: number;
}

const FONT = '-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif';

function buildAlertRow(alert: PriceAlert): string {
  return `
      <tr>
        <td style="padding:14px 24px;border-bottom:1px solid #1e3a5f;">
          <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
            <tr>
              <td style="font-size:14px;font-weight:700;color:#ffffff;font-family:${FONT};">${alert.merchantNormalized}</td>
              <td style="text-align:right;font-size:13px;font-weight:700;color:#ef4444;font-family:${FONT};">+${alert.increasePct}%</td>
            </tr>
            <tr>
              <td style="padding-top:4px;font-size:12px;color:#94a3b8;font-family:${FONT};">
                &pound;${alert.oldAmount.toFixed(2)} &rarr; <span style="color:#ef4444;">&pound;${alert.newAmount.toFixed(2)}</span>
              </td>
              <td style="text-align:right;padding-top:4px;font-size:12px;color:#34d399;font-family:${FONT};">
                +&pound;${alert.annualImpact.toFixed(0)}/yr
              </td>
            </tr>
            <tr>
              <td colspan="2" style="padding-top:8px;">
                <a href="https://paybacker.co.uk/dashboard/complaints?company=${encodeURIComponent(alert.merchantNormalized)}&issue=${encodeURIComponent(`price increase from £${alert.oldAmount.toFixed(2)} to £${alert.newAmount.toFixed(2)}`)}" style="font-size:12px;color:#34d399;text-decoration:underline;font-family:${FONT};">Write complaint letter &rarr;</a>
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
    : `${alertArray.length} price increases detected — £${totalAnnualImpact.toFixed(0)} extra per year`;

  const alertRows = alertArray.map(buildAlertRow).join('');

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

              <!-- Header badge -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding:24px 32px 16px;">
                    <table cellpadding="0" cellspacing="0" role="presentation">
                      <tr>
                        <td style="background-color:#2d1515;border:1px solid #7f1d1d;padding:6px 14px;">
                          <span style="font-size:12px;font-weight:700;color:#ef4444;font-family:${FONT};text-transform:uppercase;letter-spacing:0.06em;">
                            ${alertArray.length === 1 ? 'Price Increase Detected' : `${alertArray.length} Price Increases Detected`}
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0 32px 20px;border-bottom:1px solid #1e3a5f;">
                    <p style="margin:0;font-size:15px;color:#e2e8f0;font-family:${FONT};line-height:1.6;">
                      Hi ${userName}, we spotted ${alertArray.length === 1 ? 'a price increase' : `${alertArray.length} price increases`} on your payments${alertArray.length > 1 ? `, costing you an extra <strong style="color:#34d399;">&pound;${totalAnnualImpact.toFixed(2)}/year</strong>` : ''}.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Alert rows -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                ${alertRows}
              </table>

              <!-- Body copy -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td style="padding:16px 32px 8px;">
                    <p style="margin:0;font-size:13px;color:#94a3b8;font-family:${FONT};line-height:1.6;">
                      You may be able to dispute ${alertArray.length === 1 ? 'this increase' : 'these increases'} or switch to a better deal.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA -->
              <table width="100%" cellpadding="0" cellspacing="0" role="presentation">
                <tr>
                  <td align="center" style="padding:20px 32px 28px;">
                    <a href="https://paybacker.co.uk/dashboard/deals" style="display:inline-block;background-color:#34d399;color:#0a1628;font-size:15px;font-weight:700;padding:14px 32px;text-decoration:none;font-family:${FONT};">
                      Find Better Deals &rarr;
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

/**
 * Send a consolidated price increase alert email via Resend.
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
