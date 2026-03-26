import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

interface PriceAlert {
  merchantNormalized: string;
  oldAmount: number;
  newAmount: number;
  increasePct: number;
  annualImpact: number;
}

export function buildPriceIncreaseEmail(
  userName: string,
  alert: PriceAlert
): { subject: string; html: string } {
  const subject = `Price increase detected: ${alert.merchantNormalized} went up by ${alert.increasePct}%`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto; padding: 24px;">
    <div style="text-align: center; padding: 24px 0;">
      <h1 style="color: #4ade80; font-size: 22px; margin: 0;">Paybacker</h1>
    </div>

    <div style="background: #0f172a; border-radius: 16px; padding: 32px; border: 1px solid #1e293b;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="display: inline-block; background: #ef44441a; border: 1px solid #ef444433; border-radius: 12px; padding: 8px 16px;">
          <span style="color: #ef4444; font-weight: 700; font-size: 14px;">Price Increase Detected</span>
        </div>
      </div>

      <p style="color: #e2e8f0; font-size: 16px; line-height: 1.6; margin: 0 0 24px;">
        Hi ${userName}, we spotted a price increase on your <strong style="color: #ffffff;">${alert.merchantNormalized}</strong> payment.
      </p>

      <div style="background: #1e293b; border-radius: 12px; padding: 24px; margin-bottom: 24px;">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #334155;">
              <span style="color: #94a3b8; font-size: 13px;">Previous amount</span>
            </td>
            <td style="padding: 12px 0; border-bottom: 1px solid #334155; text-align: right;">
              <span style="color: #ffffff; font-size: 18px; font-weight: 600;">&pound;${alert.oldAmount.toFixed(2)}</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0; border-bottom: 1px solid #334155;">
              <span style="color: #94a3b8; font-size: 13px;">New amount</span>
            </td>
            <td style="padding: 12px 0; border-bottom: 1px solid #334155; text-align: right;">
              <span style="color: #ef4444; font-size: 18px; font-weight: 700;">&pound;${alert.newAmount.toFixed(2)}</span>
              <span style="color: #ef4444; font-size: 12px; margin-left: 6px;">+${alert.increasePct}%</span>
            </td>
          </tr>
          <tr>
            <td style="padding: 12px 0;">
              <span style="color: #94a3b8; font-size: 13px;">Annual impact</span>
            </td>
            <td style="padding: 12px 0; text-align: right;">
              <span style="color: #f59e0b; font-size: 18px; font-weight: 700;">&pound;${alert.annualImpact.toFixed(2)}/yr</span>
            </td>
          </tr>
        </table>
      </div>

      <p style="color: #94a3b8; font-size: 14px; line-height: 1.6; margin: 0 0 24px;">
        This costs you <strong style="color: #f59e0b;">&pound;${alert.annualImpact.toFixed(2)} more per year</strong>. You may be able to dispute this increase or switch to a better deal.
      </p>

      <div style="text-align: center; margin-bottom: 16px;">
        <a href="https://paybacker.co.uk/dashboard/complaints?company=${encodeURIComponent(alert.merchantNormalized)}&issue=${encodeURIComponent(`price increase from £${alert.oldAmount.toFixed(2)} to £${alert.newAmount.toFixed(2)}`)}" style="display: inline-block; background: #4ade80; color: #020617; font-weight: 700; padding: 14px 32px; border-radius: 12px; text-decoration: none; font-size: 14px;">
          Write Complaint Letter
        </a>
      </div>

      <div style="text-align: center;">
        <a href="https://paybacker.co.uk/dashboard/deals" style="color: #4ade80; font-size: 13px; text-decoration: underline;">
          Or find a better deal
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
 * Send a price increase alert email via Resend.
 */
export async function sendPriceIncreaseAlert(
  email: string,
  userName: string,
  alert: PriceAlert
): Promise<boolean> {
  const { subject, html } = buildPriceIncreaseEmail(userName, alert);

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
