import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import type { OverchargeAssessment } from '@/lib/overcharge-engine/types';
import { renderEmail, emailStyles as s, emailTokens as t } from './layout';

function scoreColor(score: number): string {
  if (score >= 70) return t.red;
  if (score >= 40) return t.amber;
  return t.mintDeep;
}

function confidenceBadge(confidence: string): string {
  const bg = confidence === 'high' ? t.mint : confidence === 'medium' ? t.amber : t.textMuted;
  return `<span style="background:${bg};color:#FFFFFF;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:0.05em;">${confidence}</span>`;
}

function buildAssessmentRow(a: OverchargeAssessment): string {
  return `
    <div style="background:${t.cardBgMuted};border:1px solid ${t.cardBorder};border-radius:12px;padding:20px;margin:0 0 12px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 8px;">
        <tr>
          <td style="color:${t.textStrong};font-weight:700;font-size:15px;">${a.merchantName}</td>
          <td style="color:${scoreColor(a.overchargeScore)};font-weight:700;font-size:16px;text-align:right;">${a.overchargeScore}/100</td>
        </tr>
      </table>
      <div style="margin:0 0 8px;">${confidenceBadge(a.confidence)}</div>
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">
        <tr>
          <td style="color:${t.textMuted};font-size:13px;padding:4px 0;">You pay</td>
          <td style="color:${t.textStrong};font-size:13px;font-weight:600;padding:4px 0;text-align:right;">&pound;${a.currentMonthly.toFixed(2)}/mo</td>
        </tr>
        ${a.bestDealMonthly ? `<tr>
          <td style="color:${t.textMuted};font-size:13px;padding:4px 0;">Best available</td>
          <td style="color:${t.mintDeep};font-size:13px;font-weight:600;padding:4px 0;text-align:right;">&pound;${a.bestDealMonthly.toFixed(2)}/mo</td>
        </tr>` : ''}
        <tr>
          <td style="color:${t.textMuted};font-size:13px;padding:4px 0;">Potential saving</td>
          <td style="color:${t.mintDeep};font-size:13px;font-weight:700;padding:4px 0;text-align:right;">&pound;${Math.round(a.estimatedAnnualSaving)}/yr</td>
        </tr>
      </table>
      <div style="margin:12px 0 0;font-size:12px;color:${t.textMuted};">
        ${a.signals.filter((sig) => sig.score > 0).map((sig) => `<div style="padding:2px 0;">&#8226; ${sig.detail}</div>`).join('')}
      </div>
      <div style="margin-top:12px;">
        <a href="https://paybacker.co.uk/dashboard/subscriptions" style="${s.link};font-size:12px;">Review &amp; switch</a>
      </div>
    </div>`;
}

export async function sendOverchargeAlert(
  email: string,
  name: string,
  assessments: OverchargeAssessment[],
): Promise<boolean> {
  const totalSaving = assessments.reduce((sum, a) => sum + a.estimatedAnnualSaving, 0);
  const highCount = assessments.filter((a) => a.overchargeScore >= 60).length;

  const subject = highCount > 0
    ? `You could save ~£${Math.round(totalSaving)}/yr on ${highCount} bill${highCount > 1 ? 's' : ''}`
    : `Bill check: ${assessments.length} subscription${assessments.length > 1 ? 's' : ''} reviewed`;

  const body = `
    <h1 style="${s.h1}">Overcharge report</h1>
    <p style="${s.p}">Hi ${name}, we found potential savings on your bills.</p>

    <div style="background:${t.mintWash};border:1px solid ${t.mintWash};border-radius:12px;padding:20px;text-align:center;margin:0 0 24px;">
      <div style="color:${t.mintDeep};font-size:32px;font-weight:800;line-height:1;">&pound;${Math.round(totalSaving)}</div>
      <div style="color:${t.textStrong};font-size:13px;margin-top:6px;">estimated annual savings</div>
    </div>

    ${assessments.map(buildAssessmentRow).join('')}

    <div style="text-align:center;margin:24px 0;">
      <a href="https://paybacker.co.uk/dashboard/subscriptions" style="${s.cta}">View all assessments</a>
    </div>
  `;

  try {
    await resend.emails.send({
      from: FROM_EMAIL,
      to: email,
      replyTo: REPLY_TO,
      subject,
      html: renderEmail({
        preheader: highCount > 0 ? `£${Math.round(totalSaving)}/yr in potential savings across your bills.` : `Bill check complete — ${assessments.length} reviewed.`,
        body,
      }),
    });
    return true;
  } catch {
    return false;
  }
}
