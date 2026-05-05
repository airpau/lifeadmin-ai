import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import { DealAlert } from '@/lib/email/deal-alerts';
import { OpportunityScore } from '@/lib/opportunity-scoring';

interface PriceAlert {
  merchantNormalized: string;
  oldAmount: number;
  newAmount: number;
  increasePct: number;
  annualImpact: number;
}

interface DigestSection {
  hasContent: boolean;
  html: string;
}

/**
 * Build the Price Increases section of the daily digest.
 */
function buildPriceSection(alerts: PriceAlert[]): DigestSection {
  if (alerts.length === 0) return { hasContent: false, html: '' };

  const totalAnnualImpact = alerts.reduce((sum, a) => sum + a.annualImpact, 0);

  const alertRows = alerts.map((alert) => `
    <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 12px; padding: 16px; margin-bottom: 10px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
        <span style="color: #7F1D1D; font-weight: 700; font-size: 15px;">${alert.merchantNormalized}</span>
        <span style="color: #DC2626; font-weight: 700; font-size: 13px;">+${alert.increasePct}%</span>
      </div>
      <div style="color: #4B5563; font-size: 13px;">
        Was £${alert.oldAmount.toFixed(2)} → Now £${alert.newAmount.toFixed(2)}
        <span style="color: #DC2626; font-weight: 600;">(extra £${alert.annualImpact.toFixed(0)}/yr)</span>
      </div>
    </div>
  `).join('');

  const html = `
    <div style="margin-bottom: 28px;">
      <div style="display: inline-block; background: #FEF2F2; border: 1px solid #FECACA; border-radius: 8px; padding: 6px 12px; margin-bottom: 12px;">
        <span style="color: #DC2626; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">💸 Price Increases Detected</span>
      </div>
      <div style="color: #374151; font-size: 14px; line-height: 1.6; margin-bottom: 14px;">
        We spotted <strong style="color: #DC2626;">${alerts.length} price increase${alerts.length === 1 ? '' : 's'}</strong> on your bills${totalAnnualImpact > 0 ? `, costing you an extra <strong>£${totalAnnualImpact.toFixed(0)} per year</strong>` : ''}.
      </div>
      ${alertRows}
      <div style="text-align: center; margin-top: 12px;">
        <a href="https://paybacker.co.uk/dashboard/deals" style="display: inline-block; color: #DC2626; font-size: 13px; text-decoration: underline; font-weight: 600;">Find better deals →</a>
      </div>
    </div>
  `;

  return { hasContent: true, html };
}

/**
 * Build the Deal Opportunities section of the daily digest.
 */
function buildDealsSection(alerts: DealAlert[]): DigestSection {
  if (alerts.length === 0) return { hasContent: false, html: '' };

  const topAlerts = alerts.slice(0, 3);

  const categoryIcons: Record<string, string> = {
    energy: '⚡', broadband: '📡', mobile: '📱', car_insurance: '🚗', insurance: '🛡️',
    pet_insurance: '🐾', mortgage: '🏠', credit_card: '💳', loan: '🏦', car_finance: '🚗',
    streaming: '📺', fitness: '💪',
  };

  const dealRows = topAlerts.map((a) => {
    const icon = categoryIcons[a.category] || '💰';
    return `
      <div style="background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 12px; padding: 14px; margin-bottom: 10px;">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="width: 32px; vertical-align: top; padding-right: 10px; font-size: 18px;">${icon}</td>
            <td style="vertical-align: top;">
              <div style="font-weight: 700; color: #0B1220; font-size: 14px;">${a.currentProvider}</div>
              <div style="color: #6B7280; font-size: 12px; margin-top: 2px;">${a.message}</div>
            </td>
            <td style="width: 90px; vertical-align: top; text-align: right; padding-left: 10px;">
              <div style="font-weight: 800; color: #0B1220; font-size: 16px;">£${a.currentAmount.toFixed(2)}</div>
              <div style="color: #4B5563; font-size: 11px;">/month</div>
            </td>
          </tr>
        </table>
      </div>
    `;
  }).join('');

  const html = `
    <div style="margin-bottom: 28px;">
      <div style="display: inline-block; background: #F0FDF4; border: 1px solid #BBF7D0; border-radius: 8px; padding: 6px 12px; margin-bottom: 12px;">
        <span style="color: #059669; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">💡 Switching Opportunities</span>
      </div>
      <div style="color: #374151; font-size: 14px; line-height: 1.6; margin-bottom: 14px;">
        We found <strong style="color: #059669;">${alerts.length} deal${alerts.length === 1 ? '' : 's'}</strong> where you could be paying less.
      </div>
      ${dealRows}
      <div style="text-align: center; margin-top: 12px;">
        <a href="https://paybacker.co.uk/dashboard/deals" style="display: inline-block; background: #059669; color: #FFFFFF; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 13px;">Compare & switch</a>
      </div>
    </div>
  `;

  return { hasContent: true, html };
}

/**
 * Build the Personalised Opportunity Score section of the daily digest.
 */
function buildScoreSection(score: OpportunityScore, totalMonthlySpend: number): DigestSection {
  if (score.topOpportunities.length === 0 || score.tier === 'low') {
    return { hasContent: false, html: '' };
  }

  const top = score.topOpportunities.slice(0, 2);
  const urgencyColor = score.tier === 'critical' ? '#DC2626' : score.tier === 'high' ? '#059669' : '#3B82F6';
  const urgencyBg = score.tier === 'critical' ? '#FEF2F2' : score.tier === 'high' ? '#F0FDF4' : '#EFF6FF';
  const urgencyBorder = score.tier === 'critical' ? '#FECACA' : score.tier === 'high' ? '#BBF7D0' : '#BFDBFE';

  const oppRows = top.map((opp) => `
    <div style="background: ${urgencyBg}; border: 1px solid ${urgencyBorder}; border-radius: 12px; padding: 14px; margin-bottom: 10px;">
      <div style="font-weight: 700; color: #0B1220; font-size: 14px;">${opp.provider}</div>
      <div style="color: #6B7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px;">${opp.category.replace('_', ' ')}</div>
      <div style="color: ${urgencyColor}; font-size: 13px; margin-top: 6px; font-weight: 600;">${opp.reason}</div>
      <div style="color: #0B1220; font-size: 13px; margin-top: 4px;">£${opp.amount.toFixed(0)}/month</div>
    </div>
  `).join('');

  const html = `
    <div style="margin-bottom: 28px;">
      <div style="display: inline-block; background: ${urgencyBg}; border: 1px solid ${urgencyBorder}; border-radius: 8px; padding: 6px 12px; margin-bottom: 12px;">
        <span style="color: ${urgencyColor}; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">🎯 Personalised Alert (score: ${score.total})</span>
      </div>
      <div style="color: #374151; font-size: 14px; line-height: 1.6; margin-bottom: 14px;">
        Based on your ${totalMonthlySpend > 0 ? `£${totalMonthlySpend.toFixed(0)}/month` : ''} tracked bills, these are your highest-impact opportunities:
      </div>
      ${oppRows}
    </div>
  `;

  return { hasContent: true, html };
}

/**
 * Build a unified daily digest email combining price increases, deal opportunities,
 * and personalised scoring — one email per user per day, replacing 3 separate crons.
 */
export function buildDailyDigestEmail(
  userName: string,
  priceIncreases: PriceAlert[],
  dealAlerts: DealAlert[],
  score: OpportunityScore | null,
  totalMonthlySpend: number,
): { subject: string; html: string } | null {
  const priceSection = buildPriceSection(priceIncreases);
  const dealsSection = buildDealsSection(dealAlerts);
  const scoreSection = score ? buildScoreSection(score, totalMonthlySpend) : { hasContent: false, html: '' };

  // Only send if at least one section has content
  if (!priceSection.hasContent && !dealsSection.hasContent && !scoreSection.hasContent) {
    return null;
  }

  // Build subject line based on what sections are present
  let subject: string;
  if (priceSection.hasContent && priceIncreases.length === 1) {
    subject = `Price increase: ${priceIncreases[0].merchantNormalized} went up ${priceIncreases[0].increasePct}%`;
  } else if (priceSection.hasContent) {
    subject = `${priceIncreases.length} price increases detected — your daily Paybacker digest`;
  } else if (scoreSection.hasContent && score!.tier === 'critical') {
    subject = `${userName}, you could be overpaying by hundreds — daily digest`;
  } else if (dealsSection.hasContent) {
    subject = `${userName}, we found ${dealAlerts.length} ways to save — daily digest`;
  } else {
    subject = `Your daily Paybacker digest`;
  }

  const today = new Date().toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin: 0; padding: 0; background-color: #F9FAFB; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div style="max-width: 600px; margin: 0 auto;">
    <!-- Preheader -->
    <div style="display: none; max-height: 0; overflow: hidden; font-size: 1px; line-height: 1px; color: #F9FAFB;">
      ${priceSection.hasContent ? `${priceIncreases.length} price increase${priceIncreases.length === 1 ? '' : 's'} detected. ` : ''}${dealsSection.hasContent ? `${dealAlerts.length} switching deal${dealAlerts.length === 1 ? '' : 's'} found. ` : ''}${scoreSection.hasContent ? `Opportunity score: ${score!.total}. ` : ''}Your daily Paybacker digest for ${today}.
    </div>

    <!-- Header -->
    <div style="background: #0B1220; padding: 24px 32px;">
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="font-size: 22px; font-weight: 800; color: #FFFFFF; letter-spacing: -0.02em;">Pay<span style="color: #059669;">backer</span></td>
          <td style="text-align: right; color: #9CA3AF; font-size: 12px;">Daily Digest · ${today}</td>
        </tr>
      </table>
    </div>

    <!-- Intro -->
    <div style="background: #FFFFFF; padding: 28px 32px; border-bottom: 1px solid #E5E7EB;">
      <div style="color: #374151; font-size: 15px; line-height: 1.7;">
        Hi ${userName},<br><br>
        Here's what we found for you today:
      </div>
    </div>

    <!-- Content Sections -->
    <div style="background: #FFFFFF; padding: 24px 32px;">
      ${priceSection.html}
      ${dealsSection.html}
      ${scoreSection.html}
    </div>

    <!-- Footer -->
    <div style="padding: 24px 32px; text-align: center;">
      <div style="color: #4B5563; font-size: 12px; line-height: 1.8;">
        Paybacker LTD · AI-powered money recovery<br>
        <a href="https://paybacker.co.uk/dashboard/profile" style="color: #6B7280; text-decoration: underline;">Manage email preferences</a> ·
        <a href="https://paybacker.co.uk/privacy-policy" style="color: #6B7280; text-decoration: underline;">Privacy policy</a>
      </div>
    </div>
  </div>
</body>
</html>`;

  return { subject, html };
}

/**
 * Send a daily digest email via Resend.
 */
export async function sendDailyDigestEmail(
  email: string,
  userName: string,
  priceIncreases: PriceAlert[],
  dealAlerts: DealAlert[],
  score: OpportunityScore | null,
  totalMonthlySpend: number,
): Promise<boolean> {
  const emailData = buildDailyDigestEmail(userName, priceIncreases, dealAlerts, score, totalMonthlySpend);
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
      console.error(`Daily digest email failed for ${email}:`, error);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`Daily digest email error for ${email}:`, err);
    return false;
  }
}
