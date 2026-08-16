/**
 * Legal sources cited by the free tools at /tools.
 *
 * RULES FOR THIS FILE
 *
 * 1. Every `url` in LEGAL_SOURCES must be on the authority allowlist in
 *    `src/lib/legal-refs-authority.ts` (UK_LEGAL_AUTHORITY_DOMAINS).
 *    Legislation, government guidance, statutory regulators and
 *    statutory ombudsmen only. No trade bodies, no news, no comparison
 *    sites, no law-firm blogs.
 *
 * 2. `inLegalRefStore` records whether an equivalent row already exists
 *    in the `legal_references` table. Where it does, we reuse the same
 *    `lawName` / `section` wording so the public tools and the letter
 *    engine describe the same statute the same way.
 *
 * 3. Operational links (POPLA, the IAS, the ombudsman schemes, the
 *    Valuation Tribunal booking pages) are NOT legal sources. They live
 *    in WHERE_TO_FILE below and are rendered in a separate block so the
 *    authority distinction stays visible to the reader.
 *
 * 4. All URLs in this file returned HTTP 200 when last checked on the
 *    date in `verifiedOn`. Two URLs currently seeded in
 *    `legal_references` were found dead at that check and are NOT used
 *    here — see docs note in the tools hub page comment.
 */

export type LegalSource = {
  lawName: string;
  section?: string;
  /** Must be on UK_LEGAL_AUTHORITY_DOMAINS. */
  url: string;
  /** Plain-English statement of what this source actually establishes. */
  establishes: string;
  /** True when an equivalent row exists in `legal_references`. */
  inLegalRefStore: boolean;
  verifiedOn: string;
};

export type FilingRoute = {
  name: string;
  url: string;
  note: string;
};

const V = '2026-08-16';

// ---------------------------------------------------------------------------
// Flight delay — UK261
// ---------------------------------------------------------------------------

export const FLIGHT_SOURCES: ReadonlyArray<LegalSource> = [
  {
    lawName: 'Regulation (EC) No 261/2004',
    section: 'Articles 5 to 9 (retained in UK law)',
    url: 'https://www.legislation.gov.uk/eur/2004/261/contents',
    establishes:
      'The compensation amounts, the right to care during a delay, and the extraordinary circumstances defence. Retained in UK law after Brexit and known as UK261.',
    inLegalRefStore: false,
    verifiedOn: V,
  },
  {
    lawName:
      "The Air Passenger Rights and Air Travel Organisers' Licensing (Amendment) (EU Exit) Regulations 2019",
    section: 'Regulation 261 (UK retained)',
    url: 'https://www.legislation.gov.uk/uksi/2019/278/contents',
    establishes:
      'The instrument that converted EC 261/2004 into UK law and converted the euro amounts into pounds, giving the £220 / £350 / £520 figures.',
    inLegalRefStore: true,
    verifiedOn: V,
  },
  {
    lawName: 'Civil Aviation Authority guidance on flight delays',
    url: 'https://www.caa.co.uk/passengers/resolving-travel-problems/delays-and-cancellations/delays/',
    establishes:
      'The regulator’s own statement of when compensation is due, the distance bands, and what counts as extraordinary circumstances.',
    inLegalRefStore: false,
    verifiedOn: V,
  },
  {
    lawName: 'Limitation Act 1980',
    section: 'Section 5',
    url: 'https://www.legislation.gov.uk/ukpga/1980/58/section/5',
    establishes:
      'The six-year limitation period for a claim founded on simple contract in England and Wales. Scotland runs to five years under separate legislation.',
    inLegalRefStore: false,
    verifiedOn: V,
  },
];

export const FLIGHT_FILING: ReadonlyArray<FilingRoute> = [
  {
    name: 'CEDR (aviation ADR)',
    url: 'https://www.cedr.com/consumer/aviation/',
    note: 'Approved ADR body used by British Airways, easyJet and others. Free to the passenger.',
  },
  {
    name: 'AviationADR',
    url: 'https://www.aviationadr.org.uk/',
    note: 'The other approved aviation ADR body. Check which one your airline belongs to before filing.',
  },
];

// ---------------------------------------------------------------------------
// Section 75
// ---------------------------------------------------------------------------

export const SECTION_75_SOURCES: ReadonlyArray<LegalSource> = [
  {
    lawName: 'Consumer Credit Act 1974',
    section: 'Section 75',
    url: 'https://www.legislation.gov.uk/ukpga/1974/39/section/75',
    establishes:
      'That the credit provider is jointly and severally liable with the supplier for any breach of contract or misrepresentation, where the cash price is over £100 and no more than £30,000.',
    inLegalRefStore: true,
    verifiedOn: V,
  },
  {
    lawName: 'Financial Ombudsman Service guidance on goods and services bought on credit',
    url: 'https://www.financial-ombudsman.org.uk/consumers/complaints-can-help/credit-borrowing-money/goods-services-bought-credit',
    establishes:
      'How the Ombudsman applies section 75 in practice, including the debtor-creditor-supplier requirement and the treatment of part payments.',
    inLegalRefStore: false,
    verifiedOn: V,
  },
  {
    lawName: 'Financial Ombudsman Service — five common myths about section 75',
    url: 'https://www.financial-ombudsman.org.uk/data-insight/our-insight/common-myths-about-section-75',
    establishes:
      'The Ombudsman’s own list of the section 75 misunderstandings it sees most often, including the belief that the full price must go on the card.',
    inLegalRefStore: false,
    verifiedOn: V,
  },
  {
    lawName: 'Limitation Act 1980',
    section: 'Section 5',
    url: 'https://www.legislation.gov.uk/ukpga/1980/58/section/5',
    establishes:
      'The six-year window in England and Wales to bring a claim for breach of contract, which is how long you normally have to make a section 75 claim.',
    inLegalRefStore: false,
    verifiedOn: V,
  },
];

export const SECTION_75_FILING: ReadonlyArray<FilingRoute> = [
  {
    name: 'Financial Ombudsman Service',
    url: 'https://www.financial-ombudsman.org.uk/consumers/complaints-can-help/credit-borrowing-money/goods-services-bought-credit',
    note: 'Free. Go here if your card provider rejects the claim or takes longer than eight weeks.',
  },
];

// ---------------------------------------------------------------------------
// Parking
// ---------------------------------------------------------------------------

export const PARKING_SOURCES: ReadonlyArray<LegalSource> = [
  {
    lawName: 'Protection of Freedoms Act 2012',
    section: 'Schedule 4 — Recovery of unpaid parking charges',
    url: 'https://www.legislation.gov.uk/ukpga/2012/9/schedule/4',
    establishes:
      'The only route by which a private parking operator can hold the registered keeper liable for a charge incurred by someone else, and the strict notice conditions it has to satisfy to do so.',
    inLegalRefStore: true,
    verifiedOn: V,
  },
  {
    lawName: 'Traffic Management Act 2004',
    section: 'Part 6 — Civil enforcement of road traffic contraventions',
    url: 'https://www.legislation.gov.uk/ukpga/2004/18/part/6',
    establishes:
      'The statutory framework for council-issued penalty charge notices, the representations procedure, and the right of appeal to an independent adjudicator.',
    inLegalRefStore: true,
    verifiedOn: V,
  },
  {
    lawName: 'GOV.UK guidance on parking tickets',
    url: 'https://www.gov.uk/parking-tickets',
    establishes:
      'The official description of the difference between a council PCN and a private parking charge, and the appeal route for each.',
    inLegalRefStore: false,
    verifiedOn: V,
  },
  {
    lawName: 'GOV.UK guidance on private parking tickets',
    url: 'https://www.gov.uk/parking-tickets/private-parking-tickets',
    establishes:
      'That a private parking charge is an alleged breach of contract, not a fine, and that the appeal goes to the operator’s trade body scheme.',
    inLegalRefStore: false,
    verifiedOn: V,
  },
  {
    lawName: 'Consumer Rights Act 2015',
    section: 'Part 2 — Unfair terms',
    url: 'https://www.legislation.gov.uk/ukpga/2015/15/contents',
    establishes:
      'The unfair contract terms test. Relevant to signage and to terms a driver could not reasonably have known about, though not to the size of the charge on its own.',
    inLegalRefStore: true,
    verifiedOn: V,
  },
];

export const PARKING_FILING: ReadonlyArray<FilingRoute> = [
  {
    name: 'POPLA',
    url: 'https://www.popla.co.uk/',
    note: 'Appeals service for operators in the British Parking Association. Free to the motorist. Normally 33 days from the operator’s rejection.',
  },
  {
    name: 'The Independent Appeals Service (IAS)',
    url: 'https://www.theias.org/',
    note: 'Appeals service for operators in the International Parking Community. Normally 21 days from the operator’s rejection.',
  },
  {
    name: 'Traffic Penalty Tribunal',
    url: 'https://www.trafficpenaltytribunal.gov.uk/',
    note: 'Independent adjudicator for council PCNs in England outside London, and in Wales.',
  },
  {
    name: 'London Tribunals',
    url: 'https://www.londontribunals.gov.uk/',
    note: 'Independent adjudicator for council PCNs issued by London boroughs and Transport for London.',
  },
];

// ---------------------------------------------------------------------------
// Energy
// ---------------------------------------------------------------------------

export const ENERGY_SOURCES: ReadonlyArray<LegalSource> = [
  {
    lawName: 'Ofgem energy price cap unit rates and standing charges',
    url: 'https://www.ofgem.gov.uk/information-consumers/energy-advice-households/energy-price-cap-unit-rates-and-standing-charges',
    establishes:
      'The capped unit rate and daily standing charge for each period, by region and payment method. This is the table the figures in this tool are copied from.',
    inLegalRefStore: false,
    verifiedOn: V,
  },
  {
    lawName: 'Ofgem energy price cap (default tariff) levels',
    url: 'https://www.ofgem.gov.uk/energy-regulation/domestic-and-non-domestic/energy-pricing-rules/energy-price-cap/energy-price-cap-default-tariff-levels',
    establishes:
      'The decision documents behind each cap period, including which tariffs the cap covers and which it does not.',
    inLegalRefStore: false,
    verifiedOn: V,
  },
  {
    lawName: 'Ofgem back-billing rule',
    section: 'Standard Licence Condition 21BA',
    url: 'https://www.ofgem.gov.uk/information-consumers/energy-advice-households/what-do-if-you-get-back-bill',
    establishes:
      'That a supplier cannot bill a domestic customer for energy used more than 12 months before the date of the bill, subject to a narrow exception where the customer obstructed meter readings.',
    inLegalRefStore: true,
    verifiedOn: V,
  },
  {
    lawName: 'Ofgem guidance on complaining about your energy supplier',
    url: 'https://www.ofgem.gov.uk/information-consumers/energy-advice-households/complain-about-your-energy-supplier',
    establishes:
      'The complaints route: the supplier first, then the Energy Ombudsman after eight weeks or on receipt of a deadlock letter.',
    inLegalRefStore: false,
    verifiedOn: V,
  },
];

export const ENERGY_FILING: ReadonlyArray<FilingRoute> = [
  {
    name: 'Energy Ombudsman',
    url: 'https://www.energyombudsman.org/',
    note: 'Free. Available eight weeks after you complained to your supplier, or sooner with a deadlock letter.',
  },
];

// ---------------------------------------------------------------------------
// Broadband and mobile price rises
// ---------------------------------------------------------------------------

export const TELECOMS_SOURCES: ReadonlyArray<LegalSource> = [
  {
    lawName: 'Ofcom General Conditions of Entitlement',
    section: 'Condition C1 — contract requirements',
    url: 'https://www.ofcom.org.uk/phones-and-broadband/service-quality/contracts',
    establishes:
      'Condition C1.3 requires the price you will pay, including any scheduled rise, to be set out in the contract information before you sign. Conditions C1.14 to C1.17 require at least one month’s notice of a contract modification likely to be of material detriment, and a right to exit without penalty. Ofcom treats a rise in the core subscription price during a fixed term as likely to be of material detriment.',
    inLegalRefStore: true,
    verifiedOn: V,
  },
  {
    lawName: 'Ofcom statement banning inflation-linked mid-contract price rises',
    url: 'https://www.ofcom.org.uk/phones-and-broadband/bills-and-charges/ofcom-bans-mid-contract-price-rises-linked-to-inflation',
    establishes:
      'That from 17 January 2025 providers must state any in-contract price rise up front in pounds and pence. Rises expressed as CPI or RPI plus a percentage are no longer permitted in new contracts.',
    inLegalRefStore: false,
    verifiedOn: V,
  },
  {
    lawName: 'Ofcom statement on the right to exit broadband contracts',
    url: 'https://www.ofcom.org.uk/phones-and-broadband/service-quality/updating-and-clarifying-customers-right-to-exit-contracts-for-broadband-services',
    establishes:
      'How Ofcom expects providers to operate the penalty-free exit right in practice, including the notice period.',
    inLegalRefStore: false,
    verifiedOn: V,
  },
  {
    lawName: 'Consumer Rights Act 2015',
    section: 'Section 49 — service to be performed with reasonable care and skill',
    url: 'https://www.legislation.gov.uk/ukpga/2015/15/section/49',
    establishes:
      'The statutory standard that applies to a SERVICE such as broadband or mobile. Included here because it is the section people mean when they wrongly cite section 9, which covers the quality of goods.',
    inLegalRefStore: true,
    verifiedOn: V,
  },
];

export const TELECOMS_FILING: ReadonlyArray<FilingRoute> = [
  {
    name: 'Communications Ombudsman',
    url: 'https://www.commsombudsman.org/',
    note: 'One of the two approved telecoms ADR schemes. Check which one your provider belongs to.',
  },
  {
    name: 'CEDR (CISAS)',
    url: 'https://www.cedr.com/consumer/cisas/',
    note: 'The other approved telecoms ADR scheme. Available after eight weeks or on a deadlock letter.',
  },
];

// ---------------------------------------------------------------------------
// Council tax banding
// ---------------------------------------------------------------------------

export const COUNCIL_TAX_SOURCES: ReadonlyArray<LegalSource> = [
  {
    lawName: 'Local Government Finance Act 1992',
    section: 'Part I — Council tax: England and Wales',
    url: 'https://www.legislation.gov.uk/ukpga/1992/14/contents',
    establishes:
      'The statutory basis for council tax valuation bands, the valuation dates, and the proposal and appeal machinery.',
    inLegalRefStore: false,
    verifiedOn: V,
  },
  {
    lawName: 'GOV.UK guidance — challenge your Council Tax band',
    url: 'https://www.gov.uk/challenge-council-tax-band',
    establishes:
      'The difference between a formal proposal, where you have a legal right to challenge and a right of appeal, and an informal band review, where you have neither.',
    inLegalRefStore: false,
    verifiedOn: V,
  },
  {
    lawName: 'GOV.UK guidance — when you have a legal right to make a challenge',
    url: 'https://www.gov.uk/challenge-council-tax-band/legal-right-to-make-a-challenge',
    establishes:
      'The qualifying grounds: under six months as the council tax payer, a band change by the Valuation Office in the last six months, or a material change to the property or the area.',
    inLegalRefStore: false,
    verifiedOn: V,
  },
  {
    lawName: 'GOV.UK guidance — after you make a challenge',
    url: 'https://www.gov.uk/challenge-council-tax-band/after-you-make-challenge',
    establishes:
      'The timescales (up to four months for a proposal, up to twelve for a band review) and the fact that there is no right of appeal to the Valuation Tribunal after a band review.',
    inLegalRefStore: false,
    verifiedOn: V,
  },
  {
    lawName: 'GOV.UK — check your Council Tax band',
    url: 'https://www.gov.uk/council-tax-bands',
    establishes:
      'The official register you use to look up your own band and the bands of comparable neighbouring properties.',
    inLegalRefStore: false,
    verifiedOn: V,
  },
];

export const COUNCIL_TAX_FILING: ReadonlyArray<FilingRoute> = [
  {
    name: 'Valuation Office Council Tax band challenge service',
    url: 'https://www.tax.service.gov.uk/check-council-tax-band/',
    note: 'Where you actually submit a proposal or a band review for England and Wales.',
  },
  {
    name: 'Valuation Tribunal for England',
    url: 'https://www.valuationtribunal.gov.uk/',
    note: 'Free appeal, but only open to you if you had a legal right to make a proposal. Normally three months from the decision.',
  },
];
