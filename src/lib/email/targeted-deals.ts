import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import { OpportunityScore } from '@/lib/opportunity-scoring';

export function buildTargetedEmail(
  userName: string,
  recipientEmail: string,
  score: OpportunityScore,
  totalMonthlySpend: number
): { subject: string; html: string } | null {
  if (score.topOpportunities.length === 0) return null;

  const subjects: Record<string, string> = {
    critical: `${userName}, you could be overpaying by hundreds — action needed`,
    high: `${userName}, we found ${score.topOpportunities.length} ways to cut your bills`,
    medium: `${userName}, a quick check could save you money this month`,
    low: `${userName}, your weekly savings update`,
  };

  const subject = subjects[score.tier] || subjects.medium;

  const opportunityRows = score.topOpportunities.map((opp) => `
    <tr>
      <td style="padding: 16px 20px; border-bottom: 1px solid #1e293b;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
          <tr>
            <td style="vertical-align: top;">
              <div style="font-weight: 700; color: #ffffff; font-size: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${opp.provider}</div>
              <div style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${opp.category.replace('_', ' ')}</div>
              <div style="color: #34d399; font-size: 13px; margin-top: 6px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">${opp.reason}</div>
            </td>
            <td style="text-align: right; vertical-align: top; width: 120px;">
              <div style="font-weight: 800; color: #ffffff; font-size: 18px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">&#163;${opp.amount.toFixed(0)}</div>
              <div style="color: #475569; font-size: 11px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">/month</div>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top: 8px; margin-left: auto;">
                <tr>
                  <td align="center" style="border-radius: 6px; background-color: #34d399;">
                    <a href="https://paybacker.co.uk/dashboard/deals" style="display: inline-block; background-color: #34d399; color: #0a1628; padding: 6px 14px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">COMPARE</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  `).join('');

  const unsubUrl = `https://paybacker.co.uk/api/unsubscribe?email=${encodeURIComponent(recipientEmail)}`;

  const spendLine = totalMonthlySpend > 0
    ? ` across your &#163;${totalMonthlySpend.toFixed(0)}/month in tracked bills`
    : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Your Savings Opportunities</title>
</head>
<body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%;">

  <!-- Preheader -->
  <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #020617; mso-hide: all;">
    We found ${score.topOpportunities.length} savings ${score.topOpportunities.length === 1 ? 'opportunity' : 'opportunities'} for you this week.
  </div>

  <!-- Outer wrapper -->
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background-color: #020617;">
    <tr>
      <td align="center" style="padding: 24px 16px;">

        <!-- Main card -->
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="max-width: 600px; width: 100%;">

          <!-- Header -->
          <tr>
            <td style="background-color: #0a1628; padding: 20px 32px; border-radius: 12px 12px 0 0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-size: 22px; font-weight: 800; color: #ffffff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    Pay<span style="color: #34d399;">backer</span>
                  </td>
                  <td align="right" style="color: #475569; font-size: 12px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    Weekly Savings Update
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Greeting -->
          <tr>
            <td style="background-color: #0f172a; padding: 32px 32px 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="color: #e2e8f0; font-size: 16px; line-height: 1.7; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    Hi ${userName},<br><br>
                    Here are the savings opportunities we found for you this week${spendLine}:
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Opportunities section header -->
          <tr>
            <td style="background-color: #0f172a; padding: 0 24px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-top: 2px solid #34d399; border-radius: 12px 12px 0 0;">
                <tr>
                  <td style="padding: 14px 20px 6px; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    Your top opportunities
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Opportunity rows -->
          <tr>
            <td style="background-color: #0f172a; padding: 0 24px 8px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-radius: 0 0 12px 12px;">
                ${opportunityRows}
              </table>
            </td>
          </tr>

          <!-- CTA button -->
          <tr>
            <td style="background-color: #0f172a; padding: 16px 32px 36px;" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="border-radius: 10px; background-color: #34d399;">
                    <a href="https://paybacker.co.uk/dashboard/money-hub" style="display: inline-block; background-color: #34d399; color: #0a1628; padding: 16px 40px; border-radius: 10px; text-decoration: none; font-weight: 800; font-size: 15px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; mso-padding-alt: 16px 40px;">
                      View all opportunities &#8594;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding: 24px 32px;" align="center">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td align="center" style="color: #334155; font-size: 11px; line-height: 1.8; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
                    Paybacker LTD &middot; paybacker.co.uk<br>
                    <a href="https://paybacker.co.uk/dashboard/profile" style="color: #64748b; text-decoration: underline;">Manage preferences</a> &middot;
                    <a href="${unsubUrl}" style="color: #64748b; text-decoration: underline;">Unsubscribe</a> &middot;
                    <a href="https://paybacker.co.uk/privacy-policy" style="color: #64748b; text-decoration: underline;">Privacy</a>
                  </td>
                </tr>
              </table>
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

export async function sendTargetedDealEmail(
  email: string,
  userName: string,
  score: OpportunityScore,
  totalMonthlySpend: number
): Promise<boolean> {
  const emailData = buildTargetedEmail(userName, email, score, totalMonthlySpend);
  if (!emailData) return false;

  try {
    const { error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: REPLY_TO,
      subject: emailData.subject,
      html: emailData.html,
    });
    if (error) {
      console.error(`Targeted deal email failed for ${email}:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Targeted deal email error for ${email}:`, err);
    return false;
  }
}
