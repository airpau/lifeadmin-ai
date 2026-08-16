/**
 * Registry of the free, no-signup tools at /tools.
 *
 * Single source of truth for the hub grid, the cross-links at the foot
 * of each tool page, and the sitemap entries. Adding a tool means:
 *   1. add an entry here,
 *   2. create src/app/(marketing)/tools/<slug>/page.tsx,
 *   3. nothing else — src/app/sitemap.ts reads this array directly.
 *
 * The `group` field splits the hub into "Consumer rights" (checkers
 * that tell you where you stand against a company or a regulator) and
 * "Your money" (calculators that work out a number about your own
 * finances). Keep new tools in one of those two groups unless there is
 * a genuine third category, because two columns of tiles reads better
 * than five headings with one tile each.
 */

export type ToolGroup = 'Consumer rights' | 'Your money';

export type ToolSummary = {
  slug: string;
  /** Short name used in cards and cross-links. */
  name: string;
  /** One line for the hub grid. Keep to a single sentence. */
  oneLiner: string;
  /** Grouping label shown on the card. */
  category: string;
  /** The regulator or statute the tool leans on, shown as a chip. */
  basis: string;
  /** Which hub section the tile sits in. */
  group: ToolGroup;
};

export const TOOLS_BASE = 'https://paybacker.co.uk/tools';

export const TOOL_GROUPS: ReadonlyArray<{ group: ToolGroup; blurb: string }> = [
  {
    group: 'Consumer rights',
    blurb:
      'Where you stand against a company or a regulator, with the statute cited.',
  },
  {
    group: 'Your money',
    blurb:
      'Work out a number about your own finances, with the arithmetic shown.',
  },
];

export const TOOLS: ReadonlyArray<ToolSummary> = [
  {
    slug: 'flight-delay-compensation-calculator',
    name: 'Flight delay compensation calculator',
    oneLiner:
      'Work out whether a delayed, cancelled or overbooked flight qualifies for £220, £260, £350 or £520 under UK261, and what defence the airline is likely to run.',
    category: 'Travel',
    basis: 'UK261',
    group: 'Consumer rights',
  },
  {
    slug: 'section-75-claim-checker',
    name: 'Section 75 claim checker',
    oneLiner:
      'Check whether your credit card provider is jointly liable for a purchase that went wrong, and what stops a section 75 claim in practice.',
    category: 'Money',
    basis: 'Consumer Credit Act 1974',
    group: 'Consumer rights',
  },
  {
    slug: 'parking-ticket-appeal-checker',
    name: 'Parking ticket appeal checker',
    oneLiner:
      'Find the right appeal route and deadline for a private parking charge or a council PCN, and see whether your grounds are strong enough to be worth filing.',
    category: 'Motoring',
    basis: 'Protection of Freedoms Act 2012',
    group: 'Consumer rights',
  },
  {
    slug: 'energy-bill-overcharge-checker',
    name: 'Energy bill overcharge checker',
    oneLiner:
      'Compare your unit rate and standing charge against the current Ofgem price cap, and check whether a backdated bill breaks the 12-month back-billing rule.',
    category: 'Energy',
    basis: 'Ofgem price cap',
    group: 'Consumer rights',
  },
  {
    slug: 'broadband-price-rise-checker',
    name: 'Broadband and mobile price rise checker',
    oneLiner:
      'Check whether a mid-contract price rise was notified properly and whether you have a penalty-free right to leave under the Ofcom General Conditions.',
    category: 'Telecoms',
    basis: 'Ofcom General Conditions',
    group: 'Consumer rights',
  },
  {
    slug: 'council-tax-band-challenge-checker',
    name: 'Council tax band challenge checker',
    oneLiner:
      'See whether you have a legal right to challenge your band or only an informal review, what evidence you need, and the risk that your band goes up.',
    category: 'Property',
    basis: 'Local Government Finance Act 1992',
    group: 'Consumer rights',
  },

  // -------------------------------------------------------------------
  // Your money
  // -------------------------------------------------------------------

  {
    slug: 'take-home-pay-calculator',
    name: 'Take-home pay calculator',
    oneLiner:
      'Turn a gross salary into what actually lands in your account, with Income Tax, National Insurance, every student loan plan, pension contributions and Scottish rates all shown line by line.',
    category: 'Salary',
    basis: 'HMRC 2026/27 rates',
    group: 'Your money',
  },
  {
    slug: 'mortgage-repayment-calculator',
    name: 'Mortgage repayment calculator',
    oneLiner:
      'Monthly payment, total interest and total repaid on a repayment mortgage, plus what an overpayment saves you and what happens if rates go up when you remortgage.',
    category: 'Mortgage',
    basis: 'Standard amortisation',
    group: 'Your money',
  },
  {
    slug: 'mortgage-overpayment-vs-savings-calculator',
    name: 'Overpay the mortgage or save it?',
    oneLiner:
      'Compare your mortgage rate against a savings rate after tax, allowing for the Personal Savings Allowance, and see which leaves you better off over your chosen horizon.',
    category: 'Mortgage',
    basis: 'Personal Savings Allowance',
    group: 'Your money',
  },
  {
    slug: 'subscription-audit-calculator',
    name: 'Subscription audit calculator',
    oneLiner:
      'List your recurring payments and see the true annual cost, the cost per actual use, and what the same money would be worth if you saved it instead.',
    category: 'Spending',
    basis: 'Your own figures',
    group: 'Your money',
  },
  {
    slug: 'bill-increase-impact-calculator',
    name: 'Bill increase impact calculator',
    oneLiner:
      'Add up what this year of price rises across energy, broadband, mobile, insurance and council tax actually costs you, and see which of them you have a right to challenge or exit.',
    category: 'Household bills',
    basis: 'Ofcom, Ofgem and FCA rules',
    group: 'Your money',
  },
  {
    slug: 'savings-goal-calculator',
    name: 'Savings goal and compound interest calculator',
    oneLiner:
      'Solve for whichever bit you do not know: the final pot, the monthly amount, the time or the return needed, with an inflation-adjusted view of what it is really worth.',
    category: 'Saving',
    basis: 'Compound interest',
    group: 'Your money',
  },
];

export function getTool(slug: string): ToolSummary | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

export function toolsInGroup(group: ToolGroup): ToolSummary[] {
  return TOOLS.filter((t) => t.group === group);
}

/**
 * Cross-links for the foot of a tool page. Same-group tools first,
 * because someone who has just worked out their take-home pay is far
 * more likely to want the mortgage calculator than a parking appeal.
 */
export function otherTools(slug: string): ToolSummary[] {
  const current = getTool(slug);
  const rest = TOOLS.filter((t) => t.slug !== slug);
  if (!current) return rest;
  return [
    ...rest.filter((t) => t.group === current.group),
    ...rest.filter((t) => t.group !== current.group),
  ];
}
