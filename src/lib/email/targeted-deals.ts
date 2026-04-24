import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import { OpportunityScore } from '@/lib/opportunity-scoring';
import { renderEmail, emailStyles as s, emailTokens as t } from './layout';

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
    <div style="${s.dangerBox}">
      <div style="color:${t.red};font-weight:700;font-size:14px;">High opportunity alert</div>
      <div style="color:${t.textStrong};font-size:13px;margin-top:4px;">Your opportunity score is ${score.total} — there are significant savings available</div>
    </div>
  ` : score.tier === 'high' ? `
    <div style="${s.tipBox}">
      <div style="color:${t.mintDeep};font-weight:700;font-size:14px;">Savings opportunity</div>
      <div style="color:${t.textStrong};font-size:13px;margin-top:4px;">${score.topOpportunities.length} opportunities to save on your bills</div>
    </div>
  ` : '';

  const opportunityRows = score.topOpportunities.map((opp) => `
    <tr>
      <td style="padding:16px 20px;border-bottom:1px solid ${t.cardBorder};">
        <div style="font-weight:700;color:${t.textStrong};font-size:15px;">${opp.provider}</div>
        <div style="color:${t.textMuted};font-size:12px;text-transform:uppercase;letter-spacing:0.05em;margin-top:2px;">${opp.category.replace('_', ' ')}</div>
        <div style="color:${t.mintDeep};font-size:13px;margin-top:6px;">${opp.reason}</div>
      </td>
      <td style="padding:16px 20px;border-bottom:1px solid ${t.cardBorder};text-align:right;vertical-align:top;">
        <div style="font-weight:800;color:${t.textStrong};font-size:18px;">£${opp.amount.toFixed(0)}</div>
        <div style="color:${t.textMuted};font-size:11px;">/month</div>
        <a href="https://paybacker.co.uk/dashboard/deals" style="display:inline-block;margin-top:8px;background:${t.mint};color:#FFFFFF !important;padding:6px 14px;border-radius:6px;text-decoration:none;font-weight:700;font-size:12px;">COMPARE</a>
      </td>
    </tr>
  `).join('');

  const breakdownRows = score.breakdown.slice(0, 8).map((b) => `
    <tr>
      <td style="padding:8px 20px;color:${t.text};font-size:12px;">${b.reason}</td>
      <td style="padding:8px 20px;text-align:right;color:${t.mintDeep};font-size:12px;font-weight:600;">+${b.points}</td>
    </tr>
  `).join('');

  const scoreColor = score.tier === 'critical' ? t.red : score.tier === 'high' ? t.mintDeep : t.blue;
  const scoreBg = score.tier === 'critical' ? '#FEE2E2' : score.tier === 'high' ? t.mintWash : '#DBEAFE';
  const scoreLabel = score.tier === 'critical' ? 'Critical — significant savings available'
    : score.tier === 'high' ? 'High — multiple opportunities found'
    : 'Moderate — worth reviewing';

  const body = `
    <div style="background:${scoreBg};border-radius:12px;padding:28px 24px;text-align:center;margin:0 0 24px;">
      <div style="color:${t.textMuted};font-size:12px;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 6px;font-weight:700;">Your opportunity score</div>
      <div style="font-size:56px;font-weight:800;color:${scoreColor};letter-spacing:-0.03em;line-height:1;">${score.total}</div>
      <div style="color:${t.textStrong};font-size:13px;margin-top:6px;">${scoreLabel}</div>
    </div>

    ${urgencyBanner}

    <p style="${s.p}">Hi ${userName}, we've analysed your ${totalMonthlySpend > 0 ? `£${totalMonthlySpend.toFixed(0)}/month in tracked bills` : 'bills'} and identified these specific opportunities:</p>

    <div style="background:${t.cardBg};border:1px solid ${t.cardBorder};border-radius:12px;overflow:hidden;margin:0 0 24px;">
      <div style="padding:14px 20px 6px;color:${t.textMuted};font-size:11px;text-transform:uppercase;letter-spacing:0.1em;font-weight:600;">Your top opportunities</div>
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        ${opportunityRows}
      </table>
    </div>

    <div style="text-align:center;margin:24px 0;">
      <a href="https://paybacker.co.uk/dashboard/deals" style="${s.cta}">View your deals</a>
    </div>

    <div style="background:${t.cardBgMuted};border:1px solid ${t.cardBorder};border-radius:12px;margin:0 0 24px;">
      <div style="padding:14px 20px 6px;color:${t.textMuted};font-size:11px;text-transform:uppercase;letter-spacing:0.1em;">How we scored your opportunities</div>
      <table role="presentation" style="width:100%;border-collapse:collapse;">
        ${breakdownRows}
      </table>
      <div style="padding:12px 20px;color:${t.textMuted};font-size:11px;border-top:1px solid ${t.cardBorder};text-align:right;">
        Total score: <strong style="${s.strong};color:${t.mintDeep};">${score.total}</strong>
      </div>
    </div>
  `;

  return {
    subject,
    html: renderEmail({
      preheader: `Opportunity score ${score.total} — ${score.topOpportunities.length} ways to save on your bills.`,
      body,
    }),
  };
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
