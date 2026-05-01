/**
 * Weekly Paybacker newsletter.
 *
 * Marketing send to users who opted in via the signup checkbox
 * ("Send me the Paybacker newsletter — savings tips and product
 * updates"). Distinct from `weekly-money-digest.ts` (Mon 07:00 UTC) —
 * the digest is a personalised account summary with the user's own
 * subscriptions / spending / dispute progress, while THIS newsletter
 * is broadcast content: recent UK consumer-law changes, top recovery
 * opportunities, community stats, and one quick win.
 *
 * Designed to drive activation (free signup → first dispute → first
 * recovery) without overlapping any existing send slot:
 *   - weekly-money-digest sends Mon 07:00 — newsletter sends Thu 11:00
 *   - deal-alerts sends Mon 09:00
 *   - waitlist-emails sends Mon/Thu 09:00 (different audience)
 *   - onboarding-emails sends Tue/Fri 10:00 (different audience)
 *   - daily transactional emails (renewal, price-increase, dispute
 *     reminders, contract-expiry, trial-expiry, founding-member-expiry,
 *     downgrades, support-chase) all fire 08:00 / 09:00.
 * Thursday 11:00 UTC is empty in vercel.json and lands in mid-week
 * post-coffee inbox time for UK readers.
 *
 * Lawful basis: PECR reg. 22 — soft opt-in confirmed at signup, plus
 * RFC 8058 one-click unsubscribe in every send (handled by
 * `sendPaybackerEmail` when variant='marketing').
 */

import {
  card,
  paragraph,
  unorderedList,
  divider,
  type EmailCta,
} from './PaybackerEmailLayout';

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://paybacker.co.uk';

// ---------- Public types ----------

export interface NewsletterIssueData {
  /** ISO date the issue is dated. */
  issueDate: string;
  /** Greeting first name. Falls back to "there". */
  firstName?: string | null;
  /** Per-recipient unsubscribe URL (tokenised). REQUIRED for marketing variant. */
  unsubscribeUrl: string;

  /** Hero "this week's win" story. */
  hero: HeroStory;
  /** Recent UK consumer-law change explained in plain English. */
  lawUpdate: LawUpdate;
  /** Community stats from the Paybacker dataset. */
  index: PaybackerIndex;
  /** A 5-minute action the reader can take today. */
  quickWin: QuickWin;
  /** Featured legal rule of the week. */
  featuredRule: FeaturedRule;
}

export interface HeroStory {
  headline: string;
  amount_recovered_gbp: number;
  duration_days: number;
  merchant_industry: string; // e.g. "energy supplier", "broadband provider"
  legal_basis_short: string; // e.g. "Ofgem SLC 21B"
  story_html: string; // 2-3 sentences; safe-escaped HTML
  playbook_steps: string[]; // 3-step plain-English walkthrough
}

export interface LawUpdate {
  title: string;
  effective_or_recent: string; // e.g. "Effective 6 April 2025" or "Updated this month"
  what_it_means_html: string;
  who_it_helps: string;
  source_label: string; // e.g. "Digital Markets, Competition and Consumers Act 2024 — Part 4"
  source_url?: string;
}

export interface PaybackerIndex {
  /** ISO date span "26 Apr → 2 May 2026" */
  range_label: string;
  total_recovered_gbp: number;
  disputes_resolved: number;
  avg_per_dispute_gbp: number;
  top_industry: string;
  top_legal_basis: string;
  win_rate_pct: number;
}

export interface QuickWin {
  title: string;
  time_minutes: number;
  steps: string[];
  potential_saving_gbp_min: number;
  potential_saving_gbp_max: number;
}

export interface FeaturedRule {
  name: string;
  short_summary: string;
  why_most_people_miss_it: string;
  who_qualifies_html: string;
  use_it_for: string[]; // bullet list of typical scenarios
}

// ---------- Public renderers ----------

/**
 * Newsletter subject line. Front-loads the dataset number for open rate.
 */
export function newsletterSubject(d: NewsletterIssueData): string {
  const total = formatGBP(d.index.total_recovered_gbp, { compact: true });
  return `This week: ${total} recovered + ${d.lawUpdate.title}`;
}

export function newsletterPreheader(d: NewsletterIssueData): string {
  return `${d.hero.headline}, plus a 5-minute action that could save you £${d.quickWin.potential_saving_gbp_min}–£${d.quickWin.potential_saving_gbp_max}.`;
}

/**
 * Builds the body slot HTML. Combine with `renderPaybackerEmail` for
 * the full document, or pass through `sendPaybackerEmail`.
 */
export function newsletterBody(d: NewsletterIssueData): string {
  return [
    heroSection(d.hero),
    lawSection(d.lawUpdate),
    indexSection(d.index),
    quickWinSection(d.quickWin),
    featuredRuleSection(d.featuredRule),
    divider(),
    closingCta(),
    paragraph(
      `<span style="color:#6B7280;font-size:13px;">You can change which emails you get from your <a href="${SITE}/dashboard/settings/notifications" style="color:#059669;">notification preferences</a> at any time.</span>`,
      { muted: true },
    ),
  ].join('\n');
}

// ---------- Section builders ----------

function heroSection(h: HeroStory): string {
  const stepsHtml = unorderedList(h.playbook_steps.map(escapeHtml));
  const inner = `
    <p style="margin:0 0 6px;color:#6B7280;font-size:13px;">
      Real win from a Paybacker user this week
    </p>
    <p style="margin:0 0 14px;color:#0B1220;font-size:24px;font-weight:800;line-height:1.25;">
      £${h.amount_recovered_gbp.toLocaleString('en-GB')} back in ${h.duration_days} days
    </p>
    <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.7;">
      ${h.story_html}
    </p>
    <p style="margin:14px 0 6px;color:#0B1220;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">
      The 3-step playbook
    </p>
    ${stepsHtml}
    <p style="margin:14px 0 0;color:#6B7280;font-size:13px;">
      Cited: <strong>${escapeHtml(h.legal_basis_short)}</strong>. Industry: ${escapeHtml(h.merchant_industry)}.
    </p>
  `;
  return card(inner, { eyebrow: '£££ This week' });
}

function lawSection(u: LawUpdate): string {
  const inner = `
    <p style="margin:0 0 4px;color:#6B7280;font-size:13px;">${escapeHtml(u.effective_or_recent)}</p>
    <p style="margin:0 0 10px;color:#0B1220;font-size:18px;font-weight:700;line-height:1.3;">
      ${escapeHtml(u.title)}
    </p>
    <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.7;">
      ${u.what_it_means_html}
    </p>
    <p style="margin:0 0 8px;color:#0B1220;font-size:14px;">
      <strong>Who this helps:</strong> ${escapeHtml(u.who_it_helps)}
    </p>
    <p style="margin:8px 0 0;color:#6B7280;font-size:12px;">
      Source: ${u.source_url ? `<a href="${u.source_url}" style="color:#059669;">${escapeHtml(u.source_label)}</a>` : escapeHtml(u.source_label)}
    </p>
  `;
  return card(inner, { eyebrow: 'New in UK consumer law' });
}

function indexSection(i: PaybackerIndex): string {
  const tile = (label: string, value: string) => `
    <td style="padding:10px 6px;text-align:center;vertical-align:top;width:33.33%;">
      <div style="color:#0B1220;font-size:22px;font-weight:800;line-height:1.1;">${escapeHtml(value)}</div>
      <div style="color:#6B7280;font-size:11px;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em;">${escapeHtml(label)}</div>
    </td>
  `;
  const inner = `
    <p style="margin:0 0 6px;color:#6B7280;font-size:13px;">${escapeHtml(i.range_label)}</p>
    <p style="margin:0 0 14px;color:#0B1220;font-size:18px;font-weight:700;line-height:1.3;">
      The Paybacker Index
    </p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 12px;">
      <tr>
        ${tile('Total recovered', formatGBP(i.total_recovered_gbp, { compact: false }))}
        ${tile('Disputes resolved', i.disputes_resolved.toLocaleString('en-GB'))}
        ${tile('Win rate', `${i.win_rate_pct}%`)}
      </tr>
      <tr>
        ${tile('Avg recovery', formatGBP(i.avg_per_dispute_gbp))}
        ${tile('Top industry', i.top_industry)}
        ${tile('Top legal arg.', i.top_legal_basis)}
      </tr>
    </table>
    <p style="margin:0;color:#6B7280;font-size:12px;">
      Anonymised aggregates from real Paybacker disputes resolved in the last 7 days.
    </p>
  `;
  return card(inner, { eyebrow: 'Community dataset' });
}

function quickWinSection(q: QuickWin): string {
  const stepsHtml = unorderedList(q.steps.map(escapeHtml));
  const inner = `
    <p style="margin:0 0 4px;color:#6B7280;font-size:13px;">
      Time: ~${q.time_minutes} minutes &middot; Typical saving: £${q.potential_saving_gbp_min}–£${q.potential_saving_gbp_max}/yr
    </p>
    <p style="margin:0 0 12px;color:#0B1220;font-size:18px;font-weight:700;line-height:1.3;">
      ${escapeHtml(q.title)}
    </p>
    ${stepsHtml}
  `;
  return card(inner, { eyebrow: 'Quick win you can do today' });
}

function featuredRuleSection(r: FeaturedRule): string {
  const usesHtml = unorderedList(r.use_it_for.map(escapeHtml));
  const inner = `
    <p style="margin:0 0 6px;color:#0B1220;font-size:18px;font-weight:700;line-height:1.3;">
      ${escapeHtml(r.name)}
    </p>
    <p style="margin:0 0 12px;color:#374151;font-size:15px;line-height:1.7;">
      ${escapeHtml(r.short_summary)}
    </p>
    <p style="margin:0 0 6px;color:#0B1220;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">
      Who qualifies
    </p>
    <p style="margin:0 0 12px;color:#374151;font-size:14px;line-height:1.7;">
      ${r.who_qualifies_html}
    </p>
    <p style="margin:0 0 6px;color:#0B1220;font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">
      Use it for
    </p>
    ${usesHtml}
    <p style="margin:14px 0 0;color:#6B7280;font-size:13px;font-style:italic;">
      ${escapeHtml(r.why_most_people_miss_it)}
    </p>
  `;
  return card(inner, { eyebrow: 'Featured rule' });
}

function closingCta(): string {
  return paragraph(
    `<strong>Hit a charge that doesn't feel right?</strong> Paste it into Paybacker and we'll draft a complaint letter citing the exact UK law in 30 seconds — free for 3 letters a month.`,
  );
}

// ---------- Public CTA helper ----------

export function newsletterCta(): EmailCta {
  return {
    label: 'Open Paybacker',
    href: `${SITE}/dashboard?utm_source=newsletter&utm_medium=email&utm_campaign=weekly`,
  };
}

// ---------- Utilities ----------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatGBP(n: number, opts: { compact?: boolean } = {}): string {
  if (opts.compact && n >= 1000) {
    return `£${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k`;
  }
  return `£${Math.round(n).toLocaleString('en-GB')}`;
}
