import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import { OpportunityScore } from '@/lib/opportunity-scoring';

/**
 * Build a targeted deal email based on opportunity score.
 * Higher scores get more urgent, specific messaging.
 */
export function buildTargetedEmail(
  userName: string,
  score: OpportunityScore,
  totalMonthlySpend: number
): { subject: string; html: string } | null {
  if (score.topOpportunities.length === 0) return null;

  const top = score.topOpportunities[0];

  // Subject line varies by urgency
  const subjects: Record<string, string> = {
    critical: `${userName}, you could be overpaying by hundreds — action needed`,
    high: `${userName}, we found ${score.topOpportunities.length} ways to cut your bills`,
    medium: `${userName}, a quick check could save you money this month`,
    low: `${userName}, your weekly savings update`,
  };

  const subject = subjects[score.tier] || subjects.medium;

  const urgencyBanner = score.tier === 'critical' ? `
    <div style="background: #ef444422; border: 1px solid #ef444444; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
      <div style="color: #ef4444; font-weight: 700; font-size: 14px;">HIGH OPPORTUNITY ALERT</div>
      <div style="color: #94a3b8; font-size: 13px; margin-top: 4px;">Your opportunity score is ${score.total} — there are significant savings available</div>
    </div>
  ` : score.tier === 'high' ? `
    <div style="background: #34d39922; border: 1px solid #34d39944; border-radius: 12px; padding: 16px; text-align: center; margin-bottom: 24px;">
      <div style="color: #34d399; font-weight: 700; font-size: 14px;">SAVINGS OPPORTUNITY</div>
      <div style="color: #94a3b8; font-size: 13px; margin-top: 4px;">${score.topOpportunities.length} opportunities to save on your bills</div>
    </div>
  ` : '';

  const opportunityRows = score.topOpportunities.map((opp) => `
    <tr>
      <td style="padding: 16px 20px; border-bottom: 1px solid #1e293b;">
        <div style="font-weight: 700; color: #ffffff; font-size: 15px;">${opp.provider}</div>
        <div style="color: #64748b; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px;">${opp.category.replace('_', ' ')}</div>
        <div style="color: #34d399; font-size: 13px; margin-top: 6px;">${opp.reason}</div>
      </td>
      <td style="padding: 16px 20px; border-bottom: 1px solid #1e293b; text-align: right; vertical-align: top;">
        <div style="font-weight: 800; color: #ffffff; font-size: 18px;">£${opp.amount.toFixed(0)}</div>
        <div style="color: #475569; font-size: 11px;">/month</div>
        <a href="https://paybacker.co.uk/dashboard/deals" style="display: inline-block; margin-top: 8px; background: #34d399; color: #0f172a; padding: 6px 14px; border-radius: 6px; text-decoration: none; font-weight: 700; font-size: 12px;">COMPARE</a>
      </td>
    </tr>
  `).join('');

  const breakdownRows = score.breakdown.slice(0, 8).map((b) => `
    <tr>
      <td style="padding: 8px 20px; color: #94a3b8; font-size: 12px;">${b.reason}</td>
      <td style="padding: 8px 20px; text-align: right; color: #34d399; font-size: 12px; font-weight: 600;">+${b.points}</td>
    </tr>
  `).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #020617; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto;">
    <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #020617;">
      Opportunity score: ${score.total} — ${score.topOpportunities.length} ways to save on your bills.
    </div>

    <div style="background: #0f172a; padding: 20px 32px; border-bottom: 1px solid #1e293b;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="font-size: 22px; font-weight: 800; color: #ffffff;">Pay<span style="color: #34d399;">backer</span></td>
          <td style="text-align: right; color: #475569; font-size: 12px;">Targeted Savings Alert</td>
        </tr>
      </table>
    </div>

    <div style="background: linear-gradient(180deg, #0f172a 0%, #1a1f35 100%); padding: 32px; text-align: center;">
      <div style="color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 6px;">Your opportunity score</div>
      <div style="font-size: 56px; font-weight: 800; color: ${score.tier === 'critical' ? '#ef4444' : score.tier === 'high' ? '#34d399' : '#3b82f6'}; letter-spacing: -0.03em; line-height: 1;">${score.total}</div>
      <div style="color: #475569; font-size: 13px; margin-top: 6px;">${score.tier === 'critical' ? 'Critical — significant savings available' : score.tier === 'high' ? 'High — multiple opportunities found' : 'Moderate — worth reviewing'}</div>
    </div>

    <div style="padding: 24px 32px;">
      ${urgencyBanner}

      <div style="color: #e2e8f0; font-size: 15px; line-height: 1.7; margin-bottom: 20px;">
        Hi ${userName},<br><br>
        We have analysed your ${totalMonthlySpend > 0 ? `£${totalMonthlySpend.toFixed(0)}/month in tracked bills` : 'bills'} and identified these specific opportunities:
      </div>
    </div>

    <div style="background: #0f172a; border-top: 2px solid ${score.tier === 'critical' ? '#ef4444' : '#34d399'}; margin: 0 24px; border-radius: 0 0 16px 16px;">
      <div style="padding: 14px 20px 6px; color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600;">Your top opportunities</div>
      <table style="width: 100%; border-collapse: collapse;">
        ${opportunityRows}
      </table>
    </div>

    <div style="padding: 28px; text-align: center;">
      <a href="https://paybacker.co.uk/dashboard/deals" style="display: inline-block; background: linear-gradient(135deg, #34d399 0%, #10b981 100%); color: #0f172a; padding: 16px 40px; border-radius: 12px; text-decoration: none; font-weight: 800; font-size: 15px; box-shadow: 0 4px 14px #34d39940;">VIEW YOUR DEALS</a>
    </div>

    <!-- Score breakdown -->
    <div style="margin: 0 24px 24px; background: #0f172a; border: 1px solid #1e293b; border-radius: 12px;">
      <div style="padding: 14px 20px 6px; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em;">How we scored your opportunities</div>
      <table style="width: 100%; border-collapse: collapse;">
        ${breakdownRows}
      </table>
      <div style="padding: 12px 20px; color: #475569; font-size: 11px; border-top: 1px solid #1e293b; text-align: right;">
        Total score: <strong style="color: #34d399;">${score.total}</strong>
      </div>
    </div>

    <div style="padding: 32px; text-align: center;">
      <div style="color: #334155; font-size: 11px; line-height: 1.8;">
        Paybacker LTD · paybacker.co.uk<br>
        <a href="https://paybacker.co.uk/dashboard/profile" style="color: #64748b; text-decoration: underline;">Manage preferences</a> ·
        <a href="https://paybacker.co.uk/legal/privacy" style="color: #64748b; text-decoration: underline;">Privacy</a>
      </div>
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

/**
 * Send a targeted deal email.
 */
export async function sendTargetedDealEmail(
  email: string,
  userName: string,
  score: OpportunityScore,
  totalMonthlySpend: number
): Promise<boolean> {
  const emailData = buildTargetedEmail(userName, score, totalMonthlySpend);
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
