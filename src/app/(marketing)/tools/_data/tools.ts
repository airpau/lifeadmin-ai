/**
 * Registry of the free, no-signup tools at /tools.
 *
 * Single source of truth for the hub grid, the cross-links at the foot
 * of each tool page, and the sitemap entries. Adding a tool means:
 *   1. add an entry here,
 *   2. create src/app/(marketing)/tools/<slug>/page.tsx,
 *   3. add the URL to src/app/sitemap.ts.
 */

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
};

export const TOOLS_BASE = 'https://paybacker.co.uk/tools';

export const TOOLS: ReadonlyArray<ToolSummary> = [
  {
    slug: 'flight-delay-compensation-calculator',
    name: 'Flight delay compensation calculator',
    oneLiner:
      'Work out whether a delayed, cancelled or overbooked flight qualifies for £220, £260, £350 or £520 under UK261, and what defence the airline is likely to run.',
    category: 'Travel',
    basis: 'UK261',
  },
  {
    slug: 'section-75-claim-checker',
    name: 'Section 75 claim checker',
    oneLiner:
      'Check whether your credit card provider is jointly liable for a purchase that went wrong, and what stops a section 75 claim in practice.',
    category: 'Money',
    basis: 'Consumer Credit Act 1974',
  },
  {
    slug: 'parking-ticket-appeal-checker',
    name: 'Parking ticket appeal checker',
    oneLiner:
      'Find the right appeal route and deadline for a private parking charge or a council PCN, and see whether your grounds are strong enough to be worth filing.',
    category: 'Motoring',
    basis: 'Protection of Freedoms Act 2012',
  },
  {
    slug: 'energy-bill-overcharge-checker',
    name: 'Energy bill overcharge checker',
    oneLiner:
      'Compare your unit rate and standing charge against the current Ofgem price cap, and check whether a backdated bill breaks the 12-month back-billing rule.',
    category: 'Energy',
    basis: 'Ofgem price cap',
  },
  {
    slug: 'broadband-price-rise-checker',
    name: 'Broadband and mobile price rise checker',
    oneLiner:
      'Check whether a mid-contract price rise was notified properly and whether you have a penalty-free right to leave under the Ofcom General Conditions.',
    category: 'Telecoms',
    basis: 'Ofcom General Conditions',
  },
  {
    slug: 'council-tax-band-challenge-checker',
    name: 'Council tax band challenge checker',
    oneLiner:
      'See whether you have a legal right to challenge your band or only an informal review, what evidence you need, and the risk that your band goes up.',
    category: 'Property',
    basis: 'Local Government Finance Act 1992',
  },
];

export function getTool(slug: string): ToolSummary | undefined {
  return TOOLS.find((t) => t.slug === slug);
}

export function otherTools(slug: string): ToolSummary[] {
  return TOOLS.filter((t) => t.slug !== slug);
}
