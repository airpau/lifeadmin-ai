import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';

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
  const changeColor = weekChange > 10 ? '#ef4444' : weekChange < -5 ? '#f59e0b' : '#94a3b8';

  const tip = MONEY_TIPS[Math.floor(Math.random() * MONEY_TIPS.length)];

  // Category rows
  const categoryRows = data.topCategories.slice(0, 5).map(cat => `
    <tr>
      <td style="padding: 10px 12px; border-bottom: 1px solid #1e3a5f; color: #e2e8f0; font-size: 14px;">${cat.category}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #1e3a5f; color: white; font-weight: 600; font-size: 14px; text-align: right;">£${cat.total.toFixed(2)}</td>
      <td style="padding: 10px 12px; border-bottom: 1px solid #1e3a5f; color: #94a3b8; font-size: 13px; text-align: right;">${cat.percentage.toFixed(0)}%</td>
    </tr>
  `).join('');

  // Renewal rows
  const renewalRows = data.upcomingRenewals.slice(0, 5).map(r => `
    <tr>
      <td style="padding: 8px 12px; border-bottom: 1px solid #1e3a5f; color: #e2e8f0; font-size: 13px;">${r.provider}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #1e3a5f; color: white; font-size: 13px; text-align: right;">£${r.amount.toFixed(2)}</td>
      <td style="padding: 8px 12px; border-bottom: 1px solid #1e3a5f; color: ${r.daysUntil <= 7 ? '#ef4444' : '#94a3b8'}; font-size: 13px; text-align: right;">${r.daysUntil} day${r.daysUntil !== 1 ? 's' : ''}</td>
    </tr>
  `).join('');

  // Budget alerts
  const budgetSection = data.budgetAlerts.length > 0 ? `
    <div style="background: #162544; border-radius: 12px; padding: 20px; margin: 20px 0;">
      <h2 style="color: white; font-size: 16px; margin: 0 0 12px;">Budget Tracker</h2>
      ${data.budgetAlerts.map(b => {
        const barColor = b.percentage >= 100 ? '#ef4444' : b.percentage >= 80 ? '#f59e0b' : '#f59e0b';
        const barWidth = Math.min(100, b.percentage);
        return `
          <div style="margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
              <span style="color: #e2e8f0; font-size: 13px;">${b.category}</span>
              <span style="color: #94a3b8; font-size: 13px;">£${b.spent.toFixed(0)} / £${b.limit.toFixed(0)}</span>
            </div>
            <div style="background: #0f172a; border-radius: 4px; height: 6px; overflow: hidden;">
              <div style="background: ${barColor}; height: 6px; width: ${barWidth}%; border-radius: 4px;"></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  ` : '';

  const subject = data.weekSpend > 0
    ? `Your week: £${Math.round(data.weekSpend)} spent ${weekChange !== 0 ? `(${changeLabel} vs last week)` : ''}`
    : 'Your weekly money digest';

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; background: #0a1628; color: #e2e8f0; padding: 0; border-radius: 16px; overflow: hidden;">

      <!-- Header -->
      <div style="background: #0a1628; padding: 24px 32px; text-align: center; border-bottom: 1px solid #1e3a5f;">
        <span style="font-size: 22px; font-weight: bold; color: white;">Pay<span style="color: #34d399;">backer</span></span>
        <p style="color: #94a3b8; font-size: 12px; margin: 4px 0 0; text-transform: uppercase; letter-spacing: 1px;">Weekly Money Digest</p>
      </div>

      <div style="padding: 32px;">

        <!-- Greeting -->
        <p style="color: #94a3b8; font-size: 15px; margin: 0 0 24px;">Hi ${userName}, here is your financial snapshot for the past week.</p>

        <!-- Headline stat -->
        <div style="background: linear-gradient(135deg, #162544 0%, #1e3a5f 100%); border-radius: 12px; padding: 24px; text-align: center; margin-bottom: 24px; border: 1px solid #1e3a5f;">
          <p style="color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 1px; margin: 0 0 8px;">This week's spending</p>
          <p style="color: white; font-size: 36px; font-weight: bold; margin: 0;">£${Math.round(data.weekSpend)}</p>
          ${data.lastWeekSpend > 0 ? `
            <p style="color: ${changeColor}; font-size: 14px; margin: 8px 0 0;">
              ${changeLabel} vs last week (£${Math.round(data.lastWeekSpend)})
            </p>
          ` : ''}
          <p style="color: #64748b; font-size: 12px; margin: 8px 0 0;">${data.transactionCount} transactions</p>
        </div>

        <!-- Top categories -->
        ${data.topCategories.length > 0 ? `
          <h2 style="color: white; font-size: 16px; margin: 0 0 12px;">Where your money went</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <thead>
              <tr>
                <th style="padding: 8px 12px; text-align: left; color: #64748b; font-size: 12px; border-bottom: 2px solid #1e3a5f;">Category</th>
                <th style="padding: 8px 12px; text-align: right; color: #64748b; font-size: 12px; border-bottom: 2px solid #1e3a5f;">Amount</th>
                <th style="padding: 8px 12px; text-align: right; color: #64748b; font-size: 12px; border-bottom: 2px solid #1e3a5f;">Share</th>
              </tr>
            </thead>
            <tbody>
              ${categoryRows}
            </tbody>
          </table>
        ` : ''}

        <!-- Budget alerts (Essential+ only) -->
        ${tier !== 'free' ? budgetSection : ''}

        <!-- Upcoming renewals -->
        ${data.upcomingRenewals.length > 0 ? `
          <h2 style="color: white; font-size: 16px; margin: 0 0 12px;">Renewals coming up</h2>
          <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
            <thead>
              <tr>
                <th style="padding: 8px 12px; text-align: left; color: #64748b; font-size: 12px; border-bottom: 2px solid #1e3a5f;">Provider</th>
                <th style="padding: 8px 12px; text-align: right; color: #64748b; font-size: 12px; border-bottom: 2px solid #1e3a5f;">Amount</th>
                <th style="padding: 8px 12px; text-align: right; color: #64748b; font-size: 12px; border-bottom: 2px solid #1e3a5f;">Due</th>
              </tr>
            </thead>
            <tbody>
              ${renewalRows}
            </tbody>
          </table>
        ` : ''}

        <!-- CTA -->
        <div style="text-align: center; margin: 28px 0;">
          <a href="https://paybacker.co.uk/dashboard/money-hub" style="display: inline-block; background: #34d399; color: #0a1628; font-weight: bold; padding: 14px 32px; border-radius: 6px; text-decoration: none; font-size: 15px;">
            View Full Breakdown
          </a>
        </div>

        <!-- Money tip -->
        <div style="background: #162544; border-left: 3px solid #34d399; border-radius: 0 8px 8px 0; padding: 16px 20px; margin-bottom: 24px;">
          <p style="color: #34d399; font-size: 12px; font-weight: bold; margin: 0 0 6px;">MONEY TIP</p>
          <p style="color: #94a3b8; font-size: 13px; line-height: 1.5; margin: 0;">${tip}</p>
        </div>

        <!-- Footer -->
        <div style="border-top: 1px solid #1e3a5f; padding-top: 20px; text-align: center;">
          <p style="color: #64748b; font-size: 11px; margin: 0;">
            Paybacker LTD | ICO Registered | paybacker.co.uk
          </p>
          <p style="color: #475569; font-size: 11px; margin: 8px 0 0;">
            <a href="https://paybacker.co.uk/dashboard/profile" style="color: #34d399; text-decoration: none;">Manage preferences</a>
          </p>
        </div>
      </div>
    </div>
  `;

  return { subject, html };
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
