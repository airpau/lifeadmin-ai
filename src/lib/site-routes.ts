/**
 * The canonical map of the public site.
 *
 * Everything that needs to enumerate public URLs reads from here:
 * src/app/sitemap.ts, src/app/llms.txt/route.ts and
 * src/app/llms-full.txt/route.ts. Dynamic route families (company
 * complaint guides, solution pages, deal categories, free tools) are
 * derived from the same modules the routes themselves render from, so
 * adding a company or a tool cannot silently drop it from the sitemap.
 *
 * Blog posts are the one exception: they live in Supabase, so the
 * sitemap fetches them at build time. See BLOG_STATIC_SLUGS for the
 * three that are hardcoded routes rather than database rows.
 *
 * Invariant to preserve: nothing listed here may be disallowed in
 * src/app/robots.ts. Search Console flags a sitemapped URL that robots
 * blocks as an error, and it wastes crawl budget. There is a unit-style
 * assertion of this in assertSitemapNotBlocked() below.
 */

import { COMPANIES } from '@/data/companies';
import { SOLUTION_SLUGS } from '@/app/solutions/_data/solutions';
import { DEAL_CATEGORY_SLUGS } from '@/app/deals/_data/categories';
import { TOOLS } from '@/app/(marketing)/tools/_data/tools';
import { SWITCHES } from '@/app/(marketing)/switch/_data/switches';

export const BASE_URL = 'https://paybacker.co.uk';

export type ChangeFrequency =
  | 'always'
  | 'hourly'
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'yearly'
  | 'never';

export interface RouteEntry {
  /** Path with a leading slash. '' means the homepage. */
  path: string;
  /** Short human label. Used by llms.txt. */
  title: string;
  /** One line describing what the reader gets. Used by llms.txt. */
  summary: string;
  changeFrequency: ChangeFrequency;
  priority: number;
}

/** Paths that robots.ts disallows. Kept here so the assertion can see them. */
export const DISALLOWED_PREFIXES = [
  '/dashboard',
  '/auth',
  '/api',
  '/preview',
  '/onboarding',
  '/brief',
  '/docs/paybacker-assistant',
  '/docs/claude-desktop',
  '/ico-notice',
  '/unsubscribe',
  '/account-deletion',
  '/upgrade',
  '/join',
];

/* ------------------------------------------------------------------ */
/* Core commercial surface                                             */
/* ------------------------------------------------------------------ */

export const CORE_ROUTES: RouteEntry[] = [
  {
    path: '',
    title: 'Paybacker',
    summary:
      'What Paybacker is: a UK app that spots unfair charges, drafts the dispute letter citing the exact law, and tracks the case to the end.',
    changeFrequency: 'weekly',
    priority: 1,
  },
  {
    path: '/check',
    title: 'Free case check',
    summary:
      'Describe a UK consumer problem and get a case-strength assessment, the statutes and regulator rules that apply with a link to each official source, the escalation route, and a full draft letter. No account needed.',
    changeFrequency: 'weekly',
    priority: 0.95,
  },
  {
    path: '/tools',
    title: 'Free UK consumer rights tools',
    // Count derived from the registry so it cannot go stale when a tool
    // is added. TOOLS is imported above.
    summary: `${TOOLS.length} no-signup calculators and eligibility checkers covering flight delay compensation, section 75, parking tickets, energy overcharges, broadband and mobile price rises, council tax bands and household money maths.`,
    changeFrequency: 'weekly',
    priority: 0.9,
  },
  {
    path: '/switch',
    title: 'Moving on from a closed UK money app',
    // Count derived from the registry so it cannot go stale when a
    // migration page is added. SWITCHES is imported above.
    summary: `Honest, source-linked guides for people whose UK money app has closed, covering ${SWITCHES.length} services. What Paybacker replaces, what it does not, and how to reconnect through Open Banking.`,
    changeFrequency: 'weekly',
    priority: 0.85,
  },
  {
    path: '/complaints',
    title: 'Company complaint guides',
    summary: `How to complain to ${COMPANIES.length} named UK companies, grouped by sector, with the rules, deadlines and escalation route for each.`,
    changeFrequency: 'weekly',
    priority: 0.9,
  },
  {
    path: '/templates',
    title: 'UK consumer letter templates',
    summary: 'Free letter templates citing real UK legislation, by problem type.',
    changeFrequency: 'monthly',
    priority: 0.85,
  },
  {
    path: '/pricing',
    title: 'Pricing',
    summary:
      'Free forever tier, Essential at £4.99/month, Pro at £9.99/month. No success fee is ever charged on money you recover.',
    changeFrequency: 'weekly',
    priority: 0.9,
  },
  {
    path: '/how-it-works',
    title: 'How Paybacker works',
    summary: 'The five tools in the app and how they fit together.',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/pocket-agent',
    title: 'Pocket Agent',
    summary: 'Paybacker on WhatsApp and Telegram: alerts, dispute updates and letters by chat.',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/deals',
    title: 'Compare UK deals',
    summary: 'Switching deals across energy, broadband, mobile, insurance and more.',
    changeFrequency: 'weekly',
    priority: 0.8,
  },
  // NOTE: /dispute-success-rates is deliberately NOT listed. It carries
  // robots: { index: false } in its own metadata until the dataset
  // reaches 1,000 cases, and a noindex URL in a sitemap is a Search
  // Console error. Add it here when the noindex comes off.
  {
    path: '/blog',
    title: 'The Paybacker Journal',
    summary: 'Essays on UK consumer law, overcharging and how to fight back.',
    changeFrequency: 'weekly',
    priority: 0.7,
  },
  {
    path: '/wins',
    title: 'Recovered so far',
    summary: 'The running anonymised total recovered by Paybacker users.',
    changeFrequency: 'weekly',
    priority: 0.6,
  },
  {
    path: '/about',
    title: 'About Paybacker',
    summary: 'Who built Paybacker and why. Paybacker LTD, company no. 15289174, England and Wales.',
    changeFrequency: 'monthly',
    priority: 0.8,
  },
  {
    path: '/careers',
    title: 'Careers',
    summary: 'Open roles at Paybacker LTD.',
    changeFrequency: 'monthly',
    priority: 0.5,
  },
];

/* ------------------------------------------------------------------ */
/* High-intent SEO landing pages                                       */
/* ------------------------------------------------------------------ */

export const LANDING_ROUTES: RouteEntry[] = [
  { path: '/dispute-energy-bill', title: 'Dispute an energy bill', summary: 'Ofgem rules, the 12-month back-billing limit and the Energy Ombudsman route.', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/flight-delay-compensation', title: 'Flight delay compensation', summary: 'UK261 bands of £220, £350 and £520, the three-hour arrival threshold and the extraordinary circumstances defence.', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/cancel-gym-membership', title: 'Cancel a gym membership', summary: 'Unfair contract terms under the Consumer Rights Act and the CMA position on gym lock-ins.', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/council-tax-challenge', title: 'Challenge a council tax band', summary: 'How to challenge a band with the Valuation Office Agency and how far a refund can be backdated.', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/debt-collection-response', title: 'Respond to a debt collector', summary: 'Statute-barred debt, proving the agreement, and FCA rules on disputed balances.', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/debt-collection-letter', title: 'Debt collection letter response', summary: 'What to send back when a collection agency writes to you.', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/nhs-complaint', title: 'NHS complaint', summary: 'The NHS complaints procedure and escalation to the Parliamentary and Health Service Ombudsman.', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/hmrc-tax-rebate', title: 'HMRC tax rebate', summary: 'Claiming overpaid tax back from HMRC.', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/dvla-vehicle', title: 'DVLA vehicle issues', summary: 'Challenging DVLA decisions, penalties and refunds.', changeFrequency: 'monthly', priority: 0.9 },
  { path: '/broadband-overcharging', title: 'Broadband overcharging', summary: 'Ofcom rules on in-contract price rises and automatic compensation for outages.', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/mobile-contract-dispute', title: 'Mobile contract dispute', summary: 'Mid-contract price rises, faulty handsets and penalty-free exit under Ofcom General Conditions C1.14 to C1.17.', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/insurance-complaint', title: 'Insurance complaint', summary: 'FCA claims-handling rules and the free, binding Financial Ombudsman route.', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/parking-appeal', title: 'Parking charge appeal', summary: 'Private parking charges, POPLA and the IAS, and council PCN appeal routes.', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/hidden-subscriptions', title: 'Find hidden subscriptions', summary: 'Finding forgotten recurring payments across bank and inbox.', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/unfair-bank-charges', title: 'Unfair bank charges', summary: 'Overdraft fees, failed direct debit charges and how to challenge them.', changeFrequency: 'monthly', priority: 0.8 },
];

/* ------------------------------------------------------------------ */
/* B2B surface — kept separate, and deliberately not cross-linked from  */
/* the consumer surface.                                               */
/* ------------------------------------------------------------------ */

export const B2B_ROUTES: RouteEntry[] = [
  { path: '/for-business', title: 'UK Consumer Rights API', summary: 'One REST endpoint returning the cited statute, sector, regulator, entitlement, escalation path and draft letter for a UK consumer dispute.', changeFrequency: 'weekly', priority: 0.9 },
  { path: '/for-business/docs', title: 'API documentation', summary: 'Request and response shape, authentication, error contract and rate limits for POST /v1/disputes.', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/for-business/coverage', title: 'API coverage', summary: 'Which UK sectors, statutes and regulators the dispute engine covers.', changeFrequency: 'monthly', priority: 0.8 },
];

/* ------------------------------------------------------------------ */
/* Legal and trust surface — indexable, low priority                   */
/* ------------------------------------------------------------------ */

export const LEGAL_ROUTES: RouteEntry[] = [
  { path: '/privacy-policy', title: 'Privacy policy', summary: 'What data Paybacker holds, why, and for how long.', changeFrequency: 'monthly', priority: 0.2 },
  { path: '/terms-of-service', title: 'Terms of service', summary: 'The contract between you and Paybacker LTD.', changeFrequency: 'monthly', priority: 0.2 },
  { path: '/cookie-policy', title: 'Cookie policy', summary: 'Cookies set by paybacker.co.uk and how to control them.', changeFrequency: 'monthly', priority: 0.2 },
  { path: '/legal/methodology', title: 'Methodology', summary: 'How Paybacker sources, verifies and maintains every legal citation it uses.', changeFrequency: 'monthly', priority: 0.3 },
  { path: '/legal/ethics-code', title: 'Code of ethics', summary: 'The commitments Paybacker holds itself to, including never charging a success fee.', changeFrequency: 'monthly', priority: 0.3 },
  { path: '/legal/how-we-cite', title: 'How we cite the law', summary: 'Where Paybacker’s legal citations come from, which sources we accept and which we reject, what is checked before a letter is produced, and what we do not claim.', changeFrequency: 'monthly', priority: 0.3 },
];

/* ------------------------------------------------------------------ */
/* Derived route families                                              */
/* ------------------------------------------------------------------ */

export const TOOL_ROUTES: RouteEntry[] = TOOLS.map((t) => ({
  path: `/tools/${t.slug}`,
  title: t.name,
  summary: t.oneLiner,
  changeFrequency: 'monthly' as const,
  priority: 0.9,
}));

/**
 * Migration landing pages. Time-sensitive acquisition surfaces, so they
 * carry a higher priority and a weekly change frequency than an
 * evergreen lander would: the search interest around a closure spikes
 * and then decays, and we want them recrawled while that is happening.
 */
export const SWITCH_ROUTES: RouteEntry[] = SWITCHES.map((s) => ({
  path: `/switch/${s.slug}`,
  title: s.name,
  summary: `${s.service} closed on ${s.closedOn}. ${s.oneLiner}`,
  changeFrequency: 'weekly' as const,
  priority: 0.9,
}));

export const SOLUTION_ROUTES: RouteEntry[] = SOLUTION_SLUGS.map((slug) => ({
  path: `/solutions/${slug}`,
  title: slug.replace(/-/g, ' '),
  summary: `Paybacker feature page: ${slug.replace(/-/g, ' ')}.`,
  changeFrequency: 'weekly' as const,
  priority: 0.9,
}));

export const DEAL_ROUTES: RouteEntry[] = DEAL_CATEGORY_SLUGS.map((slug) => ({
  path: `/deals/${slug}`,
  title: `${slug.replace(/-/g, ' ')} deals`,
  summary: `Switching deals and comparison for UK ${slug.replace(/-/g, ' ')}.`,
  changeFrequency: 'weekly' as const,
  priority: 0.8,
}));

export const COMPANY_ROUTES: RouteEntry[] = COMPANIES.map((c) => ({
  path: `/complaints/${c.slug}`,
  title: `Complain to ${c.name}`,
  summary: `Your rights, deadlines and the ${c.regulator} escalation route for a complaint against ${c.name}.`,
  changeFrequency: 'monthly' as const,
  priority: 0.75,
}));

/** The three blog posts that are hardcoded routes rather than database rows. */
export const BLOG_STATIC_SLUGS = [
  'how-to-claim-flight-delay-compensation-uk',
  'are-you-overpaying-on-energy',
  'broadband-contract-ended',
];

/**
 * Every static (non-database) public route, in the order they should
 * appear in the sitemap.
 */
export function allStaticRoutes(): RouteEntry[] {
  return [
    ...CORE_ROUTES,
    ...TOOL_ROUTES,
    ...SWITCH_ROUTES,
    ...LANDING_ROUTES,
    ...SOLUTION_ROUTES,
    ...COMPANY_ROUTES,
    ...DEAL_ROUTES,
    ...B2B_ROUTES,
    ...LEGAL_ROUTES,
  ];
}

/**
 * Guard against the most common Search Console error: a URL that is in
 * the sitemap and also blocked by robots.txt. Returns the offending
 * paths so a caller can throw or log. Should always return [].
 */
export function assertSitemapNotBlocked(paths: string[]): string[] {
  return paths.filter((p) =>
    DISALLOWED_PREFIXES.some((d) => p === d || p.startsWith(`${d}/`)),
  );
}
