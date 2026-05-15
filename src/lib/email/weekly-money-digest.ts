/**
 * Weekly money digest — migrated to canonical PaybackerEmailLayout (2026-05-01).
 *
 * Earlier hand-rolled inline styles used near-white text (#E5E7EB) on a white
 * wrap, which rendered as unreadable low-contrast in Gmail iOS dark mode. The
 * canonical layout fixes contrast at the source and shares chrome (logo,
 * footer, button styling) with every other Paybacker email.
 */

import { resend, FROM_EMAIL, REPLY_TO } from '@/lib/resend';
import { fmtGBP } from '@/lib/spending';
import {
  renderPaybackerEmail,
  paragraph,
  card,
  callout,
} from './PaybackerEmailLayout';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';

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

const COLOR = {
  ink: '#0B1220',
  inkSoft: '#374151',
  inkMuted: '#6B7280',
  border: '#E5E7EB',
  surfaceAlt: '#F9FAFB',
  brand: '#059669',
  danger: '#EF4444',
};

function headlineStat(data: DigestData, weekChange: number, changeLabel: string): string {
  const changeColor = weekChange > 10 ? COLOR.danger : weekChange < -5 ? COLOR.brand : COLOR.inkMuted;
  const compareLine =
    data.lastWeekSpend > 0
      ? `<p style="color:${changeColor};font-size:14px;margin:8px 0 0;">${changeLabel} vs last week (${fmtGBP(data.lastWeekSpend)})</p>`
      : '';
  return `
    <div style="background:${COLOR.surfaceAlt};border:1px solid ${COLOR.border};border-radius:12px;padding:24px;text-align:center;margin:0 0 24px;">
      <p style="color:${COLOR.inkMuted};font-size:12px;text-transform:uppercase;letter-spacing:1px;margin:0 0 8px;">This week's spending</p>
      <p style="color:${COLOR.ink};font-size:36px;font-weight:700;margin:0;">${fmtGBP(data.weekSpend)}</p>
      ${compareLine}
      <p style="color:${COLOR.inkMuted};font-size:12px;margin:8px 0 0;">${data.transactionCount} transactions</p>
    </div>
  `;
}

function categoriesTable(rows: DigestData['topCategories']): string {
  if (rows.length === 0) return '';
  const body = rows
    .slice(0, 5)
    .map(
      (cat) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid ${COLOR.border};color:${COLOR.inkSoft};font-size:14px;">${escapeHtml(cat.category)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid ${COLOR.border};color:${COLOR.ink};font-weight:600;font-size:14px;text-align:right;">${fmtGBP(cat.total, { fractionDigits: 2 })}</td>
          <td style="padding:10px 12px;border-bottom:1px solid ${COLOR.border};color:${COLOR.inkMuted};font-size:13px;text-align:right;">${cat.percentage.toFixed(0)}%</td>
        </tr>
      `,
    )
    .join('');
  return `
    <h2 style="color:${COLOR.ink};font-size:16px;margin:0 0 12px;">Where your money went</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <thead>
        <tr>
          <th style="padding:8px 12px;text-align:left;color:${COLOR.inkMuted};font-size:12px;border-bottom:2px solid ${COLOR.border};">Category</th>
          <th style="padding:8px 12px;text-align:right;color:${COLOR.inkMuted};font-size:12px;border-bottom:2px solid ${COLOR.border};">Amount</th>
          <th style="padding:8px 12px;text-align:right;color:${COLOR.inkMuted};font-size:12px;border-bottom:2px solid ${COLOR.border};">Share</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function renewalsTable(rows: DigestData['upcomingRenewals']): string {
  if (rows.length === 0) return '';
  const body = rows
    .slice(0, 5)
    .map((r) => {
      const dueColor = r.daysUntil <= 7 ? COLOR.danger : COLOR.inkMuted;
      return `
        <tr>
          <td style="padding:8px 12px;border-bottom:1px solid ${COLOR.border};color:${COLOR.inkSoft};font-size:13px;">${escapeHtml(r.provider)}</td>
          <td style="padding:8px 12px;border-bottom:1px solid ${COLOR.border};color:${COLOR.ink};font-size:13px;text-align:right;">${fmtGBP(r.amount, { fractionDigits: 2 })}</td>
          <td style="padding:8px 12px;border-bottom:1px solid ${COLOR.border};color:${dueColor};font-size:13px;text-align:right;">${r.daysUntil} day${r.daysUntil !== 1 ? 's' : ''}</td>
        </tr>
      `;
    })
    .join('');
  return `
    <h2 style="color:${COLOR.ink};font-size:16px;margin:0 0 12px;">Renewals coming up</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:24px;">
      <thead>
        <tr>
          <th style="padding:8px 12px;text-align:left;color:${COLOR.inkMuted};font-size:12px;border-bottom:2px solid ${COLOR.border};">Provider</th>
          <th style="padding:8px 12px;text-align:right;color:${COLOR.inkMuted};font-size:12px;border-bottom:2px solid ${COLOR.border};">Amount</th>
          <th style="padding:8px 12px;text-align:right;color:${COLOR.inkMuted};font-size:12px;border-bottom:2px solid ${COLOR.border};">Due</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
}

function budgetSection(rows: DigestData['budgetAlerts']): string {
  if (rows.length === 0) return '';
  const items = rows
    .map((b) => {
      const barColor = b.percentage >= 100 ? COLOR.danger : COLOR.brand;
      const barWidth = Math.min(100, b.percentage);
      return `
        <div style="margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="color:${COLOR.inkSoft};font-size:13px;">${escapeHtml(b.category)}</span>
            <span style="color:${COLOR.inkMuted};font-size:13px;">${fmtGBP(b.spent)} / ${fmtGBP(b.limit)}</span>
          </div>
          <div style="background:${COLOR.border};border-radius:4px;height:6px;overflow:hidden;">
            <div style="background:${barColor};height:6px;width:${barWidth}%;border-radius:4px;"></div>
          </div>
        </div>
      `;
    })
    .join('');
  return card(
    `<h2 style="color:${COLOR.ink};font-size:16px;margin:0 0 12px;">Budget tracker</h2>${items}`,
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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
  const tip = MONEY_TIPS[Math.floor(Math.random() * MONEY_TIPS.length)];

  const body = [
    paragraph(`Hi ${escapeHtml(userName)}, here is your financial snapshot for the past week.`),
    headlineStat(data, weekChange, changeLabel),
    categoriesTable(data.topCategories),
    tier !== 'free' ? budgetSection(data.budgetAlerts) : '',
    renewalsTable(data.upcomingRenewals),
    callout('Money tip', tip),
  ]
    .filter(Boolean)
    .join('\n');

  const subject = data.weekSpend > 0
    ? `Your week: ${fmtGBP(data.weekSpend)} spent ${weekChange !== 0 ? `(${changeLabel} vs last week)` : ''}`.trim()
    : 'Your weekly money digest';

  const html = renderPaybackerEmail({
    preheader: `Your weekly money snapshot — ${fmtGBP(data.weekSpend)} spent, ${data.transactionCount} transactions`,
    heading: 'Your weekly money digest',
    body,
    cta: { label: 'View full breakdown', href: `${SITE}/dashboard/money-hub` },
  });

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
