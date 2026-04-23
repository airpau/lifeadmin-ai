import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import { renderEmail, emailStyles as s, emailTokens as t } from './layout';

const MONEY_TIPS = [
  'Check your bank statements monthly. The average UK household has 2-3 subscriptions they have forgotten about.',
  'If your energy contract ended, you are likely on a variable tariff paying more than you need to. Compare deals.',
  'Under UK law (Consumer Contracts Regulations 2013), you have 14 days to cancel most online purchases for a full refund.',
  'Credit card purchases between £100 and £30,000 are protected under Section 75. If a company goes bust, your card provider must refund you.',
  'Broadband providers must let you leave penalty-free if they raise prices mid-contract (Ofcom rules).',
  'You can challenge your council tax band for free. Around 400,000 UK homes are in the wrong band.',
  'Flight delayed over 3 hours? You could be owed up to £520 per person under UK261 regulations.',
  'Energy suppliers must refund any credit balance within 10 working days of you switching. Chase them if they have not.',
  'Always negotiate your car insurance renewal quote. Insurers expect it, and you can often get 10-20% off just by calling.',
  'If you are paying for a gym you do not use, most contracts allow you to cancel with 30 days notice after the minimum term.',
];

interface DigestData {
  weekSpend: number;
  lastWeekSpend: number;
  topCategories: { category: string; total: number; percentage: number }[];
  upcomingRenewals: { provider: string; amount: number; date: string; daysUntil: number }[];
  budgetAlerts: { category: string; limit: number; spent: number; percentage: number }[];
  totalSaved: number;
  transactionCount: number;
}

export function buildWeeklyDigestEmail(
  userName: string,
  data: DigestData,
  tier: string,
): { subject: string; html: string } {
  const weekChange = data.lastWeekSpend > 0
    ? Math.round(((data.weekSpend - data.lastWeekSpend) / data.lastWeekSpend) * 100)
    : 0;
  const changeLabel = weekChange > 0 ? `+${weekChange}%` : `${weekChange}%`;
  const changeColor = weekChange > 10 ? t.red : weekChange < -5 ? t.mintDeep : t.textMuted;

  const tip = MONEY_TIPS[Math.floor(Math.random() * MONEY_TIPS.length)];

  const categoryRows = data.topCategories.slice(0, 5).map((cat) => `
    <tr>
      <td style="padding:10px 12px;border-bottom:1px solid ${t.cardBorder};color:${t.text};font-size:14px;">${cat.category}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${t.cardBorder};color:${t.textStrong};font-weight:600;font-size:14px;text-align:right;">£${cat.total.toFixed(2)}</td>
      <td style="padding:10px 12px;border-bottom:1px solid ${t.cardBorder};color:${t.textMuted};font-size:13px;text-align:right;">${cat.percentage.toFixed(0)}%</td>
    </tr>
  `).join('');

  const renewalRows = data.upcomingRenewals.slice(0, 5).map((r) => `
    <tr>
      <td style="padding:8px 12px;border-bottom:1px solid ${t.cardBorder};color:${t.text};font-size:13px;">${r.provider}</td>
      <td style="padding:8px 12px;border-bottom:1px solid ${t.cardBorder};color:${t.textStrong};font-size:13px;text-align:right;">£${r.amount.toFixed(2)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid ${t.cardBorder};color:${r.daysUntil <= 7 ? t.red : t.textMuted};font-size:13px;text-align:right;">${r.daysUntil} day${r.daysUntil !== 1 ? 's' : ''}</td>
    </tr>
  `).join('');

  const budgetSection = data.budgetAlerts.length > 0 ? `
    <div style="background:${t.cardBgMuted};border:1px solid ${t.cardBorder};border-radius:12px;padding:20px;margin:20px 0;">
      <h2 style="${s.h2};margin:0 0 12px;">Budget tracker</h2>
      ${data.budgetAlerts.map((b) => {
        const barColor = b.percentage >= 100 ? t.red : b.percentage >= 80 ? t.amber : t.mintDeep;
        const barWidth = Math.min(100, b.percentage);
        return `
          <div style="margin-bottom:12px;">
            <table role="presentation" style="width:100%;margin:0 0 4px;"><tr>
              <td style="color:${t.text};font-size:13px;">${b.category}</td>
              <td style="color:${t.textMuted};font-size:13px;text-align:right;">£${b.spent.toFixed(0)} / £${b.limit.toFixed(0)}</td>
            </tr></table>
            <div style="background:${t.cardBorder};border-radius:4px;height:6px;overflow:hidden;">
              <div style="background:${barColor};height:6px;width:${barWidth}%;border-radius:4px;"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  ` : '';

  const subject = data.weekSpend > 0
    ? `Your week: £${Math.round(data.weekSpend)} spent${weekChange !== 0 ? ` (${changeLabel} vs last week)` : ''}`
    : 'Your weekly money digest';

  const body = `
    <p style="${s.p}">Hi ${userName}, here's your financial snapshot for the past week.</p>

    <div style="background:${t.cardBgMuted};border:1px solid ${t.cardBorder};border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
      <p style="color:${t.textMuted};font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;font-weight:700;">This week's spending</p>
      <p style="color:${t.textStrong};font-size:36px;font-weight:800;margin:0;line-height:1.1;">£${Math.round(data.weekSpend)}</p>
      ${data.lastWeekSpend > 0 ? `<p style="color:${changeColor};font-size:14px;margin:8px 0 0;font-weight:600;">${changeLabel} vs last week (£${Math.round(data.lastWeekSpend)})</p>` : ''}
      <p style="color:${t.textMuted};font-size:12px;margin:8px 0 0;">${data.transactionCount} transactions</p>
    </div>

    ${data.topCategories.length > 0 ? `
      <h2 style="${s.h2}">Where your money went</h2>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 24px;">
        <thead><tr>
          <th style="padding:8px 12px;text-align:left;color:${t.textMuted};font-size:12px;border-bottom:2px solid ${t.cardBorder};">Category</th>
          <th style="padding:8px 12px;text-align:right;color:${t.textMuted};font-size:12px;border-bottom:2px solid ${t.cardBorder};">Amount</th>
          <th style="padding:8px 12px;text-align:right;color:${t.textMuted};font-size:12px;border-bottom:2px solid ${t.cardBorder};">Share</th>
        </tr></thead>
        <tbody>${categoryRows}</tbody>
      </table>
    ` : ''}

    ${tier !== 'free' ? budgetSection : ''}

    ${data.upcomingRenewals.length > 0 ? `
      <h2 style="${s.h2}">Renewals coming up</h2>
      <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 24px;">
        <thead><tr>
          <th style="padding:8px 12px;text-align:left;color:${t.textMuted};font-size:12px;border-bottom:2px solid ${t.cardBorder};">Provider</th>
          <th style="padding:8px 12px;text-align:right;color:${t.textMuted};font-size:12px;border-bottom:2px solid ${t.cardBorder};">Amount</th>
          <th style="padding:8px 12px;text-align:right;color:${t.textMuted};font-size:12px;border-bottom:2px solid ${t.cardBorder};">Due</th>
        </tr></thead>
        <tbody>${renewalRows}</tbody>
      </table>
    ` : ''}

    <div style="text-align:center;margin:28px 0;">
      <a href="https://paybacker.co.uk/dashboard/money-hub" style="${s.cta}">View full breakdown</a>
    </div>

    <div style="${s.box}">
      <p style="color:${t.mintDeep};font-size:12px;font-weight:700;margin:0 0 6px;text-transform:uppercase;letter-spacing:0.5px;">Money tip</p>
      <p style="color:${t.text};font-size:13px;line-height:1.55;margin:0;">${tip}</p>
    </div>
  `;

  return {
    subject,
    html: renderEmail({
      preheader: data.weekSpend > 0 ? `You spent £${Math.round(data.weekSpend)} this week across ${data.transactionCount} transactions.` : 'Your weekly money digest is ready.',
      body,
    }),
  };
}

export async function sendWeeklyDigestEmail(
  email: string,
  userName: string,
  data: DigestData,
  tier: string,
): Promise<boolean> {
  try {
    const { subject, html } = buildWeeklyDigestEmail(userName, data, tier);
    await resend.emails.send({
      from: FROM_EMAIL,
      replyTo: REPLY_TO,
      to: email,
      subject,
      html,
    });
    return true;
  } catch (err: any) {
    console.error(`[weekly-digest] Failed to send to ${email}:`, err.message);
    return false;
  }
}
