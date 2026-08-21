/**
 * Email-scan lookback window — tier resolution + conversion copy.
 *
 * WHY THIS EXISTS
 * ---------------
 * Every message an inbox scan reads costs us an Anthropic call, so scan
 * DEPTH is the largest uncapped variable cost on the free tier. Before
 * this module, every scan path swept two years of history regardless of
 * plan (Gmail via a hardcoded `newer_than:730d`, IMAP via a literal
 * `730`, Outlook via no date bound at all).
 *
 * The window is now a proper tier limit — `PLAN_LIMITS[tier].emailScanDays`
 * — resolved here through `getEffectiveTier` so an active onboarding
 * trial gets the paid window, and so a user who downgrades simply gets
 * the shallower window on their next scan rather than an error.
 *
 * The second job of this module is the CONVERSION SURFACE. Capping the
 * free tier is only worth doing if the user is told, honestly, what the
 * cap means. `buildScanWindowNotice` produces copy that states the window
 * we scanned, the count we actually found, and what a deeper scan would
 * cover — WITHOUT claiming or implying how much a deeper scan would find.
 * We do not know that. Never add an estimate here.
 */
import { PLAN_LIMITS, getEffectiveTier, type PlanTier } from './plan-limits';
import { isPlanTier } from './tier-rank';

/**
 * The deepest sweep any tier gets, in days.
 *
 * Dropped from 730 to 90 on 2026-08-21 when the paid window was levelled
 * to match free. It MUST move in step with PLAN_LIMITS[*].emailScanDays:
 * `capped` below is `days < FULL_EMAIL_SCAN_DAYS`, so leaving this at 730
 * while every tier scans 90 would mark every scan as capped and show a
 * paying customer an upsell for a window that no longer exists.
 *
 * Kept as a named constant rather than deleted because the tier hook is
 * still wired up. If a deeper window is ever worth selling again, this
 * and the plan limits are the two numbers to change.
 */
export const FULL_EMAIL_SCAN_DAYS = 90;

export interface EmailScanWindow {
  /** Lookback in days actually applied to this scan. */
  days: number;
  /** Effective tier (trial-aware) the window was derived from. */
  tier: PlanTier;
  /** True when this tier gets less than the full sweep. */
  capped: boolean;
  /** What the paid tiers get, for honest comparison copy. */
  fullWindowDays: number;
  /** ISO timestamp of the oldest email included in this scan. */
  sinceISO: string;
}

/** Resolve the lookback window for a user. Trial-aware via getEffectiveTier. */
export async function resolveEmailScanWindow(userId: string): Promise<EmailScanWindow> {
  const tier = await getEffectiveTier(userId);
  return windowForTier(tier);
}

/** Pure variant — for callers that already hold the effective tier. */
export function windowForTier(tier: PlanTier): EmailScanWindow {
  // Unknown/legacy tier strings fall back to the free window rather than
  // the expensive one. Fail closed on cost.
  //
  // The fallback stays, but it must not be SILENT: an unrecognised tier here
  // means a plan was added without a PLAN_LIMITS entry, and the symptom
  // (a paying subscriber quietly getting the Free 90-day sweep) is
  // indistinguishable from correct behaviour without this log.
  if (!isPlanTier(tier)) {
    console.error(
      `[email-scan-window] unknown tier "${tier}" has no PLAN_LIMITS entry — applying the Free scan window. Add it to PLAN_LIMITS in src/lib/plan-limits.ts.`,
    );
  }
  const days = PLAN_LIMITS[tier]?.emailScanDays ?? PLAN_LIMITS.free.emailScanDays;
  return {
    days,
    tier,
    capped: days < FULL_EMAIL_SCAN_DAYS,
    fullWindowDays: FULL_EMAIL_SCAN_DAYS,
    sinceISO: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString(),
  };
}

/**
 * Clamp an incremental-scan cursor to the tier window.
 *
 * Incremental scans pass `last_scanned_at`, which is normally recent. But
 * a dormant account can carry a cursor older than the free window, which
 * would quietly re-open the two-year sweep. Returns the later of the two.
 */
export function clampSinceToWindow(sinceISO: string | null, w: EmailScanWindow): string | null {
  if (!sinceISO) return null;
  const cursor = new Date(sinceISO).getTime();
  if (!Number.isFinite(cursor)) return w.sinceISO;
  const floor = new Date(w.sinceISO).getTime();
  return cursor >= floor ? sinceISO : w.sinceISO;
}

/** Render a day count as the phrase we use in user-facing copy. */
export function describeWindow(days: number): string {
  if (days >= 730) return '2 years';
  if (days >= 365) return `${Math.round(days / 365)} year${days >= 730 ? 's' : ''}`;
  if (days >= 60) return `${Math.round(days / 30)} months`;
  return `${days} days`;
}

/**
 * The upgrade-prompt payload returned alongside every scan result.
 *
 * `null` for paid tiers — a paying user should never see an upsell after
 * a scan they already pay for.
 */
export interface ScanWindowNotice {
  /** Days actually scanned. */
  scannedDays: number;
  /** Days a paid scan covers. */
  fullWindowDays: number;
  scannedLabel: string;
  fullWindowLabel: string;
  /** Oldest email included, ISO. Lets the UI say "back to 3 May". */
  sinceISO: string;
  headline: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
}

/**
 * Build the honest "what you got / what you did not" notice.
 *
 * Rules this copy must keep to:
 *  1. State the real window and the real count. No rounding up, no
 *     "you could be missing hundreds".
 *  2. Never estimate what the deeper scan would find. We have not looked,
 *     so we cannot say.
 *  3. Say what the deeper window is FOR, not what it will pay out.
 *  4. Return null for paid tiers.
 */
export function buildScanWindowNotice(
  w: EmailScanWindow,
  opportunityCount: number,
): ScanWindowNotice | null {
  if (!w.capped) return null;

  const scannedLabel = describeWindow(w.days);
  const fullWindowLabel = describeWindow(w.fullWindowDays);

  const found = opportunityCount === 1
    ? 'found 1 opportunity'
    : `found ${opportunityCount} opportunities`;

  return {
    scannedDays: w.days,
    fullWindowDays: w.fullWindowDays,
    scannedLabel,
    fullWindowLabel,
    sinceISO: w.sinceISO,
    headline: `Scanned the last ${scannedLabel} and ${found}.`,
    body:
      `Your free plan scans ${scannedLabel} of inbox history. Essential and Pro scan ${fullWindowLabel}, `
      + `which is where forgotten subscriptions, old contract renewals and past overcharges sit. `
      + `Anything older than ${scannedLabel} was not looked at in this scan, so we cannot tell you what is in there.`,
    ctaLabel: 'Compare plans',
    ctaHref: '/pricing?src=scan_window',
  };
}
