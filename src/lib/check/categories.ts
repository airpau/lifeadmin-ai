/**
 * Public case-check taxonomy.
 *
 * IMPORTANT: this file deliberately does NOT invent a new taxonomy. Every
 * `letterType` below is one of the ids the production complaint engine
 * already understands (see the `LETTER_TYPE_CONTEXT` map in
 * `src/lib/agents/complaints-agent.ts`) and every `refCategories` entry is
 * one of the `legal_references.category` values the authenticated
 * generator uses (see `issueTypeToCategory` in
 * `src/app/api/complaints/generate/route.ts`).
 *
 * Keeping them identical means a case checked anonymously on /check and
 * the same case generated later inside the dashboard hit exactly the same
 * verified-citation pool. If you add a category here you must add the
 * matching letterType to the engine first.
 *
 * The regulator / ombudsman / deadline metadata below is used for the
 * "what happens next" panel and for the time-limit signal in the case
 * strength calculation. It is navigational guidance, not a citation:
 * every statute or rule we quote to the user is pulled live from
 * `legal_references` and shown with its official source link.
 */

export type EvidenceOption = { id: string; label: string };

export type CheckCategory = {
  /** Stable id used in URLs and analytics. Equals `letterType` where one exists. */
  id: string;
  /** Short picker label. */
  label: string;
  /** One-line helper under the label. */
  blurb: string;
  /** Emoji-free glyph key used by the picker tile. */
  glyph: string;
  /** The engine letterType this maps to. */
  letterType: string;
  /** `legal_references.category` values to pull citations from, most specific first. */
  refCategories: string[];
  /** Regulator or supervising body, plain name. */
  regulator: string;
  /** Independent redress scheme, plain name. */
  ombudsman: string;
  /** Official page for the redress scheme. Authority domains only. */
  ombudsmanUrl: string;
  /**
   * Escalation phrase written to read correctly inside a letter
   * sentence ("I will refer the matter to ..."). Kept separate from
   * `ombudsman`, which is a display label and often contains a comma or
   * an "or" that turns into nonsense mid-sentence.
   */
  letterEscalation: string;
  /**
   * True where the provider has a formal 8 week window to reach a final
   * response before the case can be taken to the ombudsman. Drives the
   * 8 week clock callout.
   */
  eightWeekClock: boolean;
  /**
   * Primary time limit in days, measured from the date the problem
   * happened. Used only to score the time-limit signal and to warn the
   * user. Where a sector has no fixed statutory window we use the general
   * six year limitation period for England and Wales.
   */
  primaryLimitDays: number;
  /** Plain-English description of that window, shown to the user. */
  primaryLimitLabel: string;
  /** Suggested remedy wording that seeds the letter. */
  defaultOutcome: string;
  /** Placeholder for the free-text box. */
  placeholder: string;
  /** Evidence checkboxes tailored to the category. */
  evidence: EvidenceOption[];
  /** Extra next-step lines appended after the generic route. */
  extraSteps: string[];
};

const SIX_YEARS = 2190;

export const CHECK_CATEGORIES: ReadonlyArray<CheckCategory> = [
  {
    id: 'energy_dispute',
    label: 'Energy bill',
    blurb: 'Overcharging, estimated readings, back-bills, wrong tariff, switch gone wrong.',
    glyph: 'bolt',
    letterType: 'energy_dispute',
    refCategories: ['energy', 'general'],
    regulator: 'Ofgem',
    ombudsman: 'Energy Ombudsman',
    ombudsmanUrl: 'https://www.ofgem.gov.uk/information-consumers/energy-advice-households/making-complaint-about-your-energy-supplier',
    letterEscalation: 'the Energy Ombudsman and to Ofgem',
    eightWeekClock: true,
    primaryLimitDays: 365,
    primaryLimitLabel:
      'The Energy Ombudsman normally accepts a case within 12 months of the supplier’s final response, so raise it promptly.',
    defaultOutcome: 'a corrected bill and a refund of everything I have been overcharged',
    placeholder:
      'My supplier has billed me £412 on an estimated reading even though I submitted an actual reading on the 3rd. They have refused to rebill.',
    evidence: [
      { id: 'bill', label: 'I have the bill or statement showing the charge' },
      { id: 'readings', label: 'I have my own meter readings or photos of the meter' },
      { id: 'emails', label: 'I have emails or chat transcripts with the supplier' },
      { id: 'contract', label: 'I have my tariff or contract paperwork' },
      { id: 'reference', label: 'I have a complaint reference number' },
    ],
    extraSteps: [
      'Ask the supplier in writing for a deadlock letter if they will not resolve it, which lets you go to the Energy Ombudsman before the 8 weeks are up.',
    ],
  },
  {
    id: 'broadband_complaint',
    label: 'Broadband',
    blurb: 'Mid-contract price rise, speeds below the guarantee, outages, exit fees.',
    glyph: 'wifi',
    letterType: 'broadband_complaint',
    refCategories: ['broadband', 'general'],
    regulator: 'Ofcom',
    ombudsman: 'CISAS or Communications Ombudsman',
    ombudsmanUrl: 'https://www.ofcom.org.uk/phones-and-broadband/service-quality/adr-schemes',
    letterEscalation: 'an Ofcom-approved alternative dispute resolution scheme',
    eightWeekClock: true,
    primaryLimitDays: 365,
    primaryLimitLabel:
      'An Ofcom-approved ADR scheme normally accepts a case within 12 months of the provider’s final response.',
    defaultOutcome:
      'the price rise reversed, a refund of the extra amount taken, and the right to leave without an exit fee',
    placeholder:
      'My broadband went up by £6 a month part way through an 18 month contract. Nobody told me at sign-up that the price could rise, and they want £180 to leave.',
    evidence: [
      { id: 'bill', label: 'I have the bill showing the increase' },
      { id: 'contract', label: 'I have the contract or the sign-up confirmation email' },
      { id: 'notice', label: 'I have the price rise notification they sent' },
      { id: 'speedtest', label: 'I have speed test results or fault reports' },
      { id: 'reference', label: 'I have a complaint reference number' },
    ],
    extraSteps: [
      'Keep paying the original amount while the dispute is live so the account does not fall into arrears, and say so in writing.',
    ],
  },
  {
    id: 'mobile_contract',
    label: 'Mobile contract',
    blurb: 'Price rises, exit fees, coverage not as sold, roaming charges.',
    glyph: 'phone',
    letterType: 'broadband_complaint',
    refCategories: ['broadband', 'general'],
    regulator: 'Ofcom',
    ombudsman: 'CISAS or Communications Ombudsman',
    ombudsmanUrl: 'https://www.ofcom.org.uk/phones-and-broadband/service-quality/adr-schemes',
    letterEscalation: 'an Ofcom-approved alternative dispute resolution scheme',
    eightWeekClock: true,
    primaryLimitDays: 365,
    primaryLimitLabel:
      'An Ofcom-approved ADR scheme normally accepts a case within 12 months of the provider’s final response.',
    defaultOutcome:
      'the increase reversed, a refund of the extra amount taken, and release from the contract without a penalty',
    placeholder:
      'My airtime plan went up mid-contract. The signal at my address has never matched what the coverage checker promised when I signed up.',
    evidence: [
      { id: 'bill', label: 'I have the bill showing the charge' },
      { id: 'contract', label: 'I have the contract or sign-up confirmation' },
      { id: 'notice', label: 'I have the notification of the change' },
      { id: 'coverage', label: 'I have coverage screenshots or fault reports' },
      { id: 'reference', label: 'I have a complaint reference number' },
    ],
    extraSteps: [
      'Ask for a PAC code only after the dispute is settled, because switching can close the complaint early.',
    ],
  },
  {
    id: 'flight_compensation',
    label: 'Flight delay or cancellation',
    blurb: 'Delays of three hours or more, cancellations, denied boarding, lost bags.',
    glyph: 'plane',
    letterType: 'flight_compensation',
    refCategories: ['travel', 'general'],
    regulator: 'Civil Aviation Authority',
    ombudsman: 'The airline’s CAA-approved ADR scheme',
    ombudsmanUrl: 'https://www.caa.co.uk/passengers/resolving-travel-problems/how-the-caa-can-help/how-the-caa-can-help/',
    letterEscalation: 'the Civil Aviation Authority and its approved dispute resolution scheme',
    eightWeekClock: false,
    primaryLimitDays: SIX_YEARS,
    primaryLimitLabel:
      'In England and Wales a claim can normally be brought within six years of the flight. In Scotland the period is five years.',
    defaultOutcome: 'the compensation I am owed, plus a refund of any expenses I had to cover',
    placeholder:
      'My flight from Manchester to Alicante on 14 September was delayed by 4 hours 20 minutes. The airline says it was operational and has refused compensation.',
    evidence: [
      { id: 'booking', label: 'I have the booking reference and ticket' },
      { id: 'delay', label: 'I have proof of the delay or cancellation' },
      { id: 'boarding', label: 'I have boarding passes for everyone claiming' },
      { id: 'receipts', label: 'I have receipts for food, transport or a hotel' },
      { id: 'response', label: 'I have the airline’s refusal in writing' },
    ],
    extraSteps: [
      'Claim for every passenger on the booking, not just yourself. The entitlement is per passenger.',
    ],
  },
  {
    id: 'refund_request',
    label: 'Faulty goods or refund refused',
    blurb: 'Something broken, not as described, a refund or repair being refused.',
    glyph: 'box',
    letterType: 'refund_request',
    refCategories: ['general', 'finance'],
    regulator: 'Trading Standards',
    ombudsman: 'A Trading Standards approved ADR scheme, or the small claims court',
    ombudsmanUrl: 'https://www.gov.uk/consumer-protection-rights',
    letterEscalation: 'Trading Standards, and I will consider a claim in the small claims court',
    eightWeekClock: false,
    primaryLimitDays: SIX_YEARS,
    primaryLimitLabel:
      'The short-term right to reject runs for 30 days from delivery. The wider limitation period is six years in England and Wales, five in Scotland.',
    defaultOutcome: 'a full refund, or a free replacement if I choose one instead',
    placeholder:
      'The sofa arrived on 2 March with a split frame. The retailer has offered a repair twice and both failed, and now refuses a refund.',
    evidence: [
      { id: 'receipt', label: 'I have the receipt, invoice or order confirmation' },
      { id: 'photos', label: 'I have photos or video of the fault' },
      { id: 'emails', label: 'I have emails or chat transcripts with the retailer' },
      { id: 'delivery', label: 'I know the delivery date' },
      { id: 'card', label: 'I paid by credit card or a card the bank could dispute' },
    ],
    extraSteps: [
      'If you paid more than £100 on a credit card, raise the same claim with your card issuer in parallel. It costs nothing and runs on a separate track.',
    ],
  },
  {
    id: 'debt_dispute',
    label: 'Debt collection letter',
    blurb: 'A debt you do not recognise, an old debt, or aggressive collection.',
    glyph: 'shield',
    letterType: 'debt_dispute',
    refCategories: ['debt', 'finance', 'general'],
    regulator: 'Financial Conduct Authority',
    ombudsman: 'Financial Ombudsman Service',
    ombudsmanUrl: 'https://www.financial-ombudsman.org.uk/consumers/how-to-complain',
    letterEscalation: 'the Financial Ombudsman Service and to the Financial Conduct Authority',
    eightWeekClock: true,
    primaryLimitDays: SIX_YEARS,
    primaryLimitLabel:
      'Most consumer debts become statute barred six years after the last payment or written acknowledgement in England and Wales, five years in Scotland.',
    defaultOutcome:
      'all collection activity suspended, written proof of the debt, and the account returned to the original creditor if it cannot be proved',
    placeholder:
      'I have had a letter from a collection agency for £680 on an account I have never held. The last contact they claim was in 2018.',
    evidence: [
      { id: 'letter', label: 'I have the collection letter or letters' },
      { id: 'dates', label: 'I know roughly when I last paid or acknowledged anything' },
      { id: 'credit', label: 'I have checked my credit file' },
      { id: 'agreement', label: 'I have, or have asked for, the credit agreement' },
      { id: 'contact', label: 'I have a record of calls or messages from them' },
    ],
    extraSteps: [
      'Never make a payment or acknowledge the debt in writing while you are disputing it. Either can restart the limitation clock.',
    ],
  },
  {
    id: 'insurance_dispute',
    label: 'Insurance claim or policy',
    blurb: 'A claim underpaid or rejected, a renewal hike, a policy mis-sold.',
    glyph: 'umbrella',
    letterType: 'insurance_dispute',
    refCategories: ['insurance', 'finance', 'general'],
    regulator: 'Financial Conduct Authority',
    ombudsman: 'Financial Ombudsman Service',
    ombudsmanUrl: 'https://www.financial-ombudsman.org.uk/consumers/how-to-complain',
    letterEscalation: 'the Financial Ombudsman Service',
    eightWeekClock: true,
    primaryLimitDays: SIX_YEARS,
    primaryLimitLabel:
      'The Financial Ombudsman Service normally needs the case within six months of the final response letter, and within six years of the event.',
    defaultOutcome: 'the claim settled in full, plus interest on anything paid late',
    placeholder:
      'My home insurer has valued the escape of water damage at £1,100 when three quotes put it at £3,400. They say the rest is wear and tear.',
    evidence: [
      { id: 'policy', label: 'I have the policy schedule and wording' },
      { id: 'claim', label: 'I have the claim reference and the decision letter' },
      { id: 'quotes', label: 'I have independent quotes or a valuation' },
      { id: 'photos', label: 'I have photos or a report on the damage' },
      { id: 'final', label: 'I have their final response letter' },
    ],
    extraSteps: [
      'Ask for the loss adjuster’s report in writing. Insurers must give you the reasoning behind a declined or reduced settlement.',
    ],
  },
  {
    id: 'parking_appeal',
    label: 'Parking charge',
    blurb: 'A private parking charge or a council penalty notice you want to appeal.',
    glyph: 'car',
    letterType: 'parking_appeal',
    refCategories: ['parking', 'general'],
    regulator: 'Trading Standards and the accredited parking trade bodies',
    ombudsman: 'POPLA or the Independent Appeals Service for private land, the Traffic Penalty Tribunal for council notices',
    ombudsmanUrl: 'https://www.gov.uk/parking-tickets',
    letterEscalation: 'the independent appeals service for this operator',
    eightWeekClock: false,
    primaryLimitDays: 28,
    primaryLimitLabel:
      'Appeals are usually due within 28 days of the notice, and the independent appeal within 28 to 33 days of the operator rejecting you.',
    defaultOutcome: 'the charge cancelled in full',
    placeholder:
      'I got a £100 charge for overstaying by 9 minutes in a retail car park on 4 May. The signage at the entrance did not show the time limit.',
    evidence: [
      { id: 'notice', label: 'I have the charge notice' },
      { id: 'photos', label: 'I have photos of the signage or the bay' },
      { id: 'ticket', label: 'I have the pay and display ticket or app receipt' },
      { id: 'timing', label: 'I have proof of when I arrived and left' },
      { id: 'reference', label: 'I have the appeal reference number' },
    ],
    extraSteps: [
      'Appeal to the operator first. You normally cannot go to the independent appeal service until they have rejected you in writing.',
    ],
  },
  {
    id: 'gym_membership',
    label: 'Gym or subscription',
    blurb: 'A membership you cannot cancel, an auto-renewal, a hidden charge.',
    glyph: 'repeat',
    letterType: 'gym_membership',
    refCategories: ['gym', 'general', 'finance'],
    regulator: 'Competition and Markets Authority and Trading Standards',
    ombudsman: 'A Trading Standards approved ADR scheme, or the small claims court',
    ombudsmanUrl: 'https://www.gov.uk/consumer-protection-rights',
    letterEscalation: 'Trading Standards, and I will consider a claim in the small claims court',
    eightWeekClock: false,
    primaryLimitDays: SIX_YEARS,
    primaryLimitLabel:
      'A distance contract normally carries a 14 day cancellation window. Unfair term challenges run to the general six year limitation period.',
    defaultOutcome: 'the membership cancelled from the date I asked, and a refund of everything taken since',
    placeholder:
      'I cancelled my gym membership by email on 1 February and they have taken two more payments of £42. They say I needed to give three months notice in branch.',
    evidence: [
      { id: 'contract', label: 'I have the membership agreement or terms' },
      { id: 'cancellation', label: 'I have proof I asked to cancel and when' },
      { id: 'statement', label: 'I have bank statements showing the payments' },
      { id: 'emails', label: 'I have emails or messages with them' },
      { id: 'signup', label: 'I signed up online or by phone rather than in person' },
    ],
    extraSteps: [
      'Cancelling the direct debit alone does not end the contract. Cancel in writing as well, or the balance can be passed to a collection agency.',
    ],
  },
  {
    id: 'council_tax_band',
    label: 'Council tax band',
    blurb: 'A band you believe is wrong, or a bill you believe is incorrect.',
    glyph: 'home',
    letterType: 'council_tax_band',
    refCategories: ['council_tax', 'general'],
    regulator: 'Valuation Office Agency',
    ombudsman: 'Valuation Tribunal, then the Local Government and Social Care Ombudsman for council handling',
    ombudsmanUrl: 'https://www.gov.uk/challenge-council-tax-band',
    letterEscalation: 'the Valuation Tribunal',
    eightWeekClock: false,
    primaryLimitDays: 183,
    primaryLimitLabel:
      'A formal challenge is normally available within six months of becoming the person liable. Outside that you can still ask the VOA to review the band.',
    defaultOutcome: 'the band reviewed and corrected, with a refund of anything overpaid',
    placeholder:
      'My house is band D. The three identical houses either side are band C and were built at the same time by the same developer.',
    evidence: [
      { id: 'bill', label: 'I have my council tax bill' },
      { id: 'comparables', label: 'I have comparable properties in a lower band' },
      { id: 'moved', label: 'I know the date I became liable for the property' },
      { id: 'sale', label: 'I have the sale price or 1991 valuation evidence' },
      { id: 'reference', label: 'I have the VOA or council reference' },
    ],
    extraSteps: [
      'Check comparable properties on the VOA council tax band search before you write, and name them in the letter.',
    ],
  },
  {
    id: 'hmrc_tax_rebate',
    label: 'HMRC or tax',
    blurb: 'Overpaid tax, a wrong code, a rebate that has not arrived.',
    glyph: 'receipt',
    letterType: 'hmrc_tax_rebate',
    refCategories: ['hmrc', 'general'],
    regulator: 'HM Revenue and Customs',
    ombudsman: 'The Adjudicator’s Office, then the Parliamentary and Health Service Ombudsman',
    ombudsmanUrl: 'https://www.gov.uk/complain-about-hmrc',
    letterEscalation: 'the Adjudicator\'s Office',
    eightWeekClock: false,
    primaryLimitDays: 1460,
    primaryLimitLabel:
      'Overpayment relief claims are normally limited to four years from the end of the tax year in question.',
    defaultOutcome: 'the assessment corrected and the overpaid tax refunded',
    placeholder:
      'I was on an emergency tax code from April to September and overpaid roughly £900. My claim has been open since November with no decision.',
    evidence: [
      { id: 'p60', label: 'I have my P60, P45 or payslips' },
      { id: 'coding', label: 'I have the tax coding notice' },
      { id: 'reference', label: 'I have my National Insurance number and UTR' },
      { id: 'correspondence', label: 'I have previous letters from HMRC' },
      { id: 'dates', label: 'I know the tax years affected' },
    ],
    extraSteps: [
      'Quote the tax year and your National Insurance number on every page. HMRC routes correspondence on those two fields.',
    ],
  },
  {
    id: 'dvla_vehicle',
    label: 'DVLA or vehicle',
    blurb: 'A licence, registration, refund or enforcement problem.',
    glyph: 'car',
    letterType: 'dvla_vehicle',
    refCategories: ['dvla', 'general'],
    regulator: 'Driver and Vehicle Licensing Agency',
    ombudsman: 'The Parliamentary and Health Service Ombudsman, via an MP',
    ombudsmanUrl: 'https://www.gov.uk/complain-about-dvla',
    letterEscalation: 'the Parliamentary and Health Service Ombudsman through my MP',
    eightWeekClock: false,
    primaryLimitDays: SIX_YEARS,
    primaryLimitLabel:
      'There is no fixed statutory window, but DVLA complaints are best raised within weeks while the records are current.',
    defaultOutcome: 'the record corrected and any charge or penalty withdrawn',
    placeholder:
      'I sold my car on 12 June and sent the V5C to DVLA. I have now had a late licensing penalty for a vehicle I no longer own.',
    evidence: [
      { id: 'v5c', label: 'I have the V5C or proof I returned it' },
      { id: 'sale', label: 'I have proof of the sale or transfer date' },
      { id: 'notice', label: 'I have the penalty or enforcement notice' },
      { id: 'reference', label: 'I have my driver number or vehicle registration' },
      { id: 'correspondence', label: 'I have earlier correspondence with DVLA' },
    ],
    extraSteps: [
      'Ask for the case to be escalated to a DVLA complaints manager if the first reply is a standard template.',
    ],
  },
  {
    id: 'nhs_complaint',
    label: 'NHS or care',
    blurb: 'Treatment, delays, communication, or how a complaint was handled.',
    glyph: 'cross',
    letterType: 'nhs_complaint',
    refCategories: ['nhs', 'general'],
    regulator: 'The relevant NHS trust or integrated care board',
    ombudsman: 'Parliamentary and Health Service Ombudsman',
    ombudsmanUrl: 'https://www.ombudsman.org.uk/making-complaint',
    letterEscalation: 'the Parliamentary and Health Service Ombudsman',
    eightWeekClock: false,
    primaryLimitDays: 365,
    primaryLimitLabel:
      'An NHS complaint is normally expected within 12 months of the event, or of you becoming aware of it.',
    defaultOutcome: 'a full written explanation, an apology where one is due, and confirmation of what has changed',
    placeholder:
      'My referral was lost twice between the GP and the hospital, which added five months to my wait. Nobody has explained what went wrong.',
    evidence: [
      { id: 'dates', label: 'I have the dates of the appointments or events' },
      { id: 'records', label: 'I have, or have requested, my medical records' },
      { id: 'names', label: 'I have the names of the departments or staff involved' },
      { id: 'correspondence', label: 'I have letters or messages from the trust' },
      { id: 'pals', label: 'I have already spoken to PALS' },
    ],
    extraSteps: [
      'Contact PALS at the trust first if you have not. The Ombudsman expects the local process to have been tried.',
    ],
  },
  {
    id: 'complaint',
    label: 'Something else',
    blurb: 'Any other UK consumer problem. We will match the law that fits.',
    glyph: 'dots',
    letterType: 'complaint',
    refCategories: ['general', 'finance'],
    regulator: 'Trading Standards',
    ombudsman: 'The sector ADR scheme, or the small claims court',
    ombudsmanUrl: 'https://www.gov.uk/consumer-protection-rights',
    letterEscalation: 'Trading Standards, and I will consider a claim in the small claims court',
    eightWeekClock: false,
    primaryLimitDays: SIX_YEARS,
    primaryLimitLabel:
      'The general limitation period is six years in England and Wales, five in Scotland.',
    defaultOutcome: 'the charge refunded and the matter put right',
    placeholder:
      'Describe what happened, who it was with, roughly when, and what you have asked them to do about it.',
    evidence: [
      { id: 'paperwork', label: 'I have the bill, receipt or contract' },
      { id: 'correspondence', label: 'I have emails, letters or chat transcripts' },
      { id: 'statement', label: 'I have bank statements showing the payments' },
      { id: 'dates', label: 'I know the dates things happened' },
      { id: 'reference', label: 'I have a reference or account number' },
    ],
    extraSteps: [],
  },
];

export function getCheckCategory(id: string | null | undefined): CheckCategory | null {
  if (!id) return null;
  return CHECK_CATEGORIES.find((c) => c.id === id) ?? null;
}

/** Options for the "have you already raised it" question. */
export const CONTACT_STAGES = [
  { id: 'not_yet', label: 'Not yet, this would be my first letter' },
  { id: 'raised_waiting', label: 'I have raised it and I am waiting for a reply' },
  { id: 'rejected', label: 'They have replied and rejected it' },
  { id: 'final_response', label: 'They have sent a final response or a deadlock letter' },
] as const;

export type ContactStage = (typeof CONTACT_STAGES)[number]['id'];
