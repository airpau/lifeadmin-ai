/**
 * Renewal-alert digest builder.
 *
 * Replaces the old one-message-per-subscription renewal blast (which sent
 * back-to-back WhatsApp messages at 09:00) with a SINGLE batched digest per
 * user. Standard subscription-management UX: one digest beats a drip of
 * individual pings.
 *
 * Two concerns live here so the cron stays thin and this stays unit-testable:
 *
 *  1. `formatRenewalAmount` — render an amount honestly using its STORED
 *     billing cycle instead of forcing "/month". The old template hard-coded
 *     "£{{3}}/month", so an annual council-tax balance (£2278.93) or a loan
 *     balance (£4690.11) rendered as "£2278.93/month" — alarming and wrong.
 *     When the cycle is unknown we show the bare amount (no period suffix)
 *     rather than inventing "/month".
 *
 *  2. `tierWindowDays` — value-tiered lead time. High-value contracts get
 *     more notice (you need time to switch a £50/mo energy deal); a £5/mo
 *     app only warrants a last-minute nudge. Each contract gets exactly ONE
 *     warning at its tier window:
 *        >= £50/mo  -> 30-day warning
 *        £10-50/mo  ->  7-day warning
 *        <  £10/mo  ->  3-day warning
 */

export type BillingCycle = string | null | undefined;

export interface RenewalAmount {
  /** Human-facing string, e.g. "£12.99/mo", "£2278.93", "£540.00/yr". */
  display: string;
  /** Monthly-equivalent in £, used for value tiering. */
  monthly: number;
}

/**
 * Render an amount with its real billing cycle and compute a monthly
 * equivalent for tiering. Unknown / missing cycle => no period suffix
 * (we never claim "/month" for an amount we can't place on a cycle).
 */
export function formatRenewalAmount(
  rawAmount: number | null | undefined,
  billingCycle: BillingCycle,
): RenewalAmount {
  const amt = Number(rawAmount);
  const safe = Number.isFinite(amt) ? amt : 0;
  const cycle = (billingCycle || '').toString().trim().toLowerCase();

  let monthly = safe;
  let suffix = '';
  if (cycle === 'yearly' || cycle === 'annually' || cycle === 'annual' || cycle === 'year') {
    monthly = safe / 12;
    suffix = '/yr';
  } else if (cycle === 'quarterly' || cycle === 'quarter') {
    monthly = safe / 3;
    suffix = '/qtr';
  } else if (cycle === 'weekly' || cycle === 'week') {
    monthly = safe * 4.345;
    suffix = '/wk';
  } else if (cycle === 'monthly' || cycle === 'month') {
    monthly = safe;
    suffix = '/mo';
  } else {
    // Unknown cycle (null, 'one_off', a balance figure, etc.) — show the
    // bare amount. Do NOT fabricate "/month".
    monthly = safe;
    suffix = '';
  }

  return { display: `£${safe.toFixed(2)}${suffix}`, monthly };
}

/**
 * Value-tiered lead time in days. One warning per contract at this window.
 */
export function tierWindowDays(monthlyEquivalent: number): 30 | 7 | 3 {
  if (monthlyEquivalent >= 50) return 30;
  if (monthlyEquivalent >= 10) return 7;
  return 3;
}

export interface RenewalDigestItem {
  providerName: string;
  /** Pre-formatted amount string from `formatRenewalAmount`. */
  amountDisplay: string;
  daysLeft: number;
}

export interface RenewalDigestBodies {
  /** Markdown, multi-line — Telegram + the logged agent-context copy. */
  telegram: string;
  /**
   * Single line — WhatsApp template variables reject raw newlines (Twilio
   * 21656), so the WhatsApp path is flattened with " · " separators.
   */
  whatsapp: string;
}

function daysPhrase(daysLeft: number): string {
  if (daysLeft <= 0) return 'today';
  if (daysLeft === 1) return 'tomorrow';
  return `in ${daysLeft} days`;
}

/**
 * Build the digest copy for all of a user's due renewals. Numbered so the
 * user can reply "CANCEL 1" / "CANCEL 2" — the Pocket Agent resolves the
 * number against this message in its conversation history (the cron logs
 * the digest as an outbound turn).
 */
export function buildRenewalDigest(items: RenewalDigestItem[]): RenewalDigestBodies {
  const n = items.length;
  const numbered = items.map(
    (it, i) => `${i + 1}. ${it.providerName} — ${it.amountDisplay}, renews ${daysPhrase(it.daysLeft)}`,
  );

  if (n === 1) {
    const it = items[0];
    const line = `${it.providerName} — ${it.amountDisplay}, renews ${daysPhrase(it.daysLeft)}`;
    return {
      telegram:
        `🔔 *Renewal coming up*\n\n${line}\n\n` +
        `Reply *CANCEL* to draft a cancellation letter, or *SWITCH* to see cheaper alternatives.`,
      whatsapp:
        `Renewal coming up: ${line}. ` +
        `Reply CANCEL to draft a cancellation letter, or SWITCH to see cheaper alternatives.`,
    };
  }

  return {
    telegram:
      `🔔 *${n} renewals coming up*\n\n${numbered.join('\n')}\n\n` +
      `Reply *CANCEL 1*, *CANCEL 2* … (or the provider name) to draft a cancellation letter, ` +
      `or *SWITCH 1* to see cheaper alternatives.`,
    whatsapp:
      `You have ${n} renewals coming up: ` +
      items
        .map((it, i) => `(${i + 1}) ${it.providerName} — ${it.amountDisplay}, renews ${daysPhrase(it.daysLeft)}`)
        .join(' · ') +
      `. Reply CANCEL 1, CANCEL 2 … (or the provider name) to draft a cancellation letter, or SWITCH 1 for cheaper alternatives.`,
  };
}
