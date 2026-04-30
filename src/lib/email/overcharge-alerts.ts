import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import type { OverchargeAssessment } from '@/lib/overcharge-engine/types';

function scoreColor(score: number): string {
  if (score >= 70) return '#ef4444'; // red
  if (score >= 40) return '#059669'; // amber
  return '#059669'; // green
}

function confidenceBadge(confidence: string): string {
  const colors: Record<string, string> = { high: '#059669', medium: '#059669', low: '#6B7280' };
  return `<span style="background: ${colors[confidence] || '#6B7280'}; color: #FFFFFF; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; text-transform: uppercase;">${confidence}</span>`;
}

function buildAssessmentRow(a: OverchargeAssessment): string {
  return `
    <div style="background: #E5E7EB; border-radius: 12px; padding: 20px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <span style="color: #0B1220; font-weight: 700; font-size: 15px;">${a.merchantName}</span>
        <span style="color: ${scoreColor(a.overchargeScore)}; font-weight: 700; font-size: 16px;">${a.overchargeScore}/100</span>
      </div>
      <div style="margin-bottom: 8px;">${confidenceBadge(a.confidence)}</div>
      <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse: collapse;">
        <tr>
          <td style="color: #6B7280; font-size: 13px; padding: 4px 0;">You pay</td>
          <td style="color: #0B1220; font-size: 13px; font-weight: 600; padding: 4px 0; text-align: right;">&pound;${a.currentMonthly.toFixed(2)}/mo</td>
        </tr>
        ${a.bestDealMonthly ? `<tr>
          <td style="color: #6B7280; font-size: 13px; padding: 4px 0;">Best available</td>
          <td style="color: #059669; font-size: 13px; font-weight: 600; padding: 4px 0; text-align: right;">&pound;${a.bestDealMonthly.toFixed(2)}/mo</td>
        </tr>` : ''}
        <tr>
          <td style="color: #6B7280; font-size: 13px; padding: 4px 0;">Potential saving</td>
          <td style="color: #059669; font-size: 13px; font-weight: 700; padding: 4px 0; text-align: right;">&pound;${Math.round(a.estimatedAnnualSaving)}/yr</td>
        </tr>
      </table>
      <div style="margin-top: 12px; font-size: 12px; color: #6B7280;">
        ${a.signals.filter(s => s.score > 0).map(s => `<div style="padding: 2px 0;">&#8226; ${s.detail}</div>`).join('')}
      </div>
      <div style="margin-top: 12px;">
        <a href="https://paybacker.co.uk/dashboard/subscriptions" style="color: #059669; font-size: 12px; text-decoration: underline;">Review &amp; switch</a>
      </div>
    </div>`;
}

export async function sendOverchargeAlert(
  email: string,
  name: string,
  assessments: OverchargeAssessment[]
): Promise<boolean> {
  const totalSaving = assessments.reduce((s, a) => s + a.estimatedAnnualSaving, 0);
  const highCount = assessments.filter(a => a.overchargeScore >= 60).length;

  const subject = highCount > 0
    ? `You could save ~\u00a3${Math.round(totalSaving)}/yr on ${highCount} bill${highCount > 1 ? 's' : ''}`
    : `Bill check: ${assessments.length} subscription${assessments.length > 1 ? 's' : ''} reviewed`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #FFFFFF; color: #E5E7EB; padding: 32px 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #0B1220; font-size: 22px; margin: 0 0 8px;">Overcharge Report</h1>
        <p style="color: #6B7280; font-size: 14px; margin: 0;">Hi ${name}, we found potential savings on your bills.</p>
      </div>

      <div style="background: #E5E7EB; border-radius: 12px; padding: 20px; text-align: center; margin-bottom: 24px;">
        <div style="color: #059669; font-size: 32px; font-weight: 800;">&pound;${Math.round(totalSaving)}</div>
        <div style="color: #6B7280; font-size: 13px; margin-top: 4px;">estimated annual savings</div>
      </div>

      ${assessments.map(a => buildAssessmentRow(a)).join('')}

      <div style="text-align: center; margin-top: 24px;">
        <a href="https://paybacker.co.uk/dashboard/subscriptions" style="display: inline-block; background: #059669; color: #0B1220; font-weight: 700; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-size: 15px;">View All Assessments</a>
      </div>

      <div style="text-align: center; margin-top: 32px; padding-top: 20px; border-top: 1px solid #4B5563;">
        <p style="color: #6B7280; font-size: 11px; margin: 0;">Paybacker &mdash; Save money on your bills with AI</p>
      </div>
    </div>`;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: REPLY_TO,
      subject,
      html,
    });
    return true;
  } catch {
    return false;
  }
}
