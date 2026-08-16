/**
 * Registry of the /switch migration landing pages.
 *
 * These pages exist for people whose UK money app has closed and who are
 * looking for somewhere to go. They are time-sensitive acquisition
 * surfaces, not evergreen feature pages, so each one carries the closure
 * date, a link to the closing service's own announcement, and an honest
 * account of what Paybacker does and does not replace.
 *
 * Single source of truth for the hub grid at /switch, the cross-links at
 * the foot of each page, and the sitemap entries. Adding a page means:
 *   1. add an entry here,
 *   2. create src/app/(marketing)/switch/<slug>/page.tsx,
 *   3. nothing else — src/lib/site-routes.ts reads this array directly.
 *
 * House rule for anything added here: never disparage the service that
 * is closing. State the facts, cite their own announcement, and let the
 * comparison be accurate rather than flattering. A migration page that
 * oversells gets the user as far as the bank connection screen and no
 * further.
 */

export type SwitchSummary = {
  slug: string;
  /** The closing service, as they spell it themselves. */
  service: string;
  /** Card headline on the hub. */
  name: string;
  /** One line for the hub grid. Keep to a single sentence. */
  oneLiner: string;
  /** Human-readable closure date, e.g. '31 July 2026'. */
  closedOn: string;
  /** ISO date of closure — used for ordering and for the hub status chip. */
  closedOnIso: string;
  /** Chip text: what happened to user data. */
  dataOutcome: string;
  /** The closing service's own announcement. Never a third-party blog. */
  sourceUrl: string;
  sourceLabel: string;
};

export const SWITCH_BASE = 'https://paybacker.co.uk/switch';

export const SWITCHES: ReadonlyArray<SwitchSummary> = [
  {
    slug: 'moneyhub',
    service: 'Moneyhub',
    name: 'Moving on from the Moneyhub app',
    oneLiner:
      'The Moneyhub consumer app closed and accounts that were not migrated were deleted. What Paybacker replaces, what it does not, and what to do about the money you may already be owed.',
    closedOn: '31 July 2026',
    closedOnIso: '2026-07-31',
    dataOutcome: 'Accounts and data deleted where no action was taken',
    sourceUrl:
      'https://moneyhubhelp.zendesk.com/hc/en-gb/articles/48275693667217-Moneyhub-App-Closure-and-Your-Account-Options',
    sourceLabel: 'Moneyhub Help Centre: App Closure and Your Account Options, 30 June 2026',
  },
  {
    slug: 'money-dashboard',
    service: 'Money Dashboard',
    name: 'Moving on from Money Dashboard',
    oneLiner:
      'Money Dashboard Neon and Classic closed at the end of October 2023 and accounts were closed and deleted. What Paybacker replaces, what it does not, and where the recovery half fits in.',
    closedOn: '31 October 2023',
    closedOnIso: '2023-10-31',
    dataOutcome: 'Accounts closed and deleted, bank connections disconnected',
    // Money Dashboard announced the closure by email to users on
    // 3 October 2023 and no longer publishes a closure notice on its own
    // site, so the linked source is a contemporaneous trade report that
    // quotes the company's statement directly. Labelled as such on the
    // page — we do not present a news report as a first-party notice.
    sourceUrl: 'https://businesscloud.co.uk/news/money-dashboard-to-shut-down-budgeting-apps/',
    sourceLabel: 'BusinessCloud, 5 October 2023, quoting Money Dashboard',
  },
];

export const SWITCH_SLUGS: ReadonlyArray<string> = SWITCHES.map((s) => s.slug);

export function findSwitch(slug: string): SwitchSummary | undefined {
  return SWITCHES.find((s) => s.slug === slug);
}
