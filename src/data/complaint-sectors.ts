/**
 * Sector-specific complaint guidance for /complaints/[company].
 *
 * The 104 company pages share one route. Without this file they would be
 * one template with a name swapped in, which is exactly the scaled thin
 * content Google demoted in the March 2024 core update. Everything here
 * is keyed off the company's sector so that an energy page genuinely
 * carries the back-billing rule and the Energy Ombudsman, a parcel page
 * carries the fact that the claim lies against the retailer and not the
 * courier, and a BNPL page carries the fact that section 75 does not
 * apply.
 *
 * Accuracy rules for anyone editing this file:
 *   1. Every legal claim must be attributable to a named statute,
 *      regulator rule or official scheme, with an official source URL.
 *      Official means legislation.gov.uk, gov.uk, a regulator, or an
 *      approved ADR body. No trade bodies, no law-firm blogs.
 *   2. Do not state figures that a regulator resets annually (the Ofcom
 *      automatic compensation daily rate, the FOS award limit). Describe
 *      the mechanism and link the source so the reader gets the current
 *      number.
 *   3. If we are not sure which of two ADR schemes covers a given
 *      provider, say "check which scheme covers your provider" and link
 *      the regulator's list. Never guess.
 */

export interface SourceLink {
  label: string;
  url: string;
}

export interface RightPoint {
  /** One sentence the reader can act on. */
  text: string;
  /** The statute, regulation or rule it comes from. */
  basis: string;
}

export interface EscalationRoute {
  /** The body you escalate to. */
  name: string;
  url: string;
  /** When you become eligible to go there. */
  eligibility: string;
  /** How long you have once eligible. */
  timeLimit: string;
  /** Cost to the consumer. */
  cost: string;
  /** Whether the outcome binds the company. */
  binding: string;
}

export interface SectorGuidance {
  /** Human label, e.g. "energy supplier". Used in prose. */
  label: string;
  /** Plural label for the related-companies block. */
  pluralLabel: string;
  /** Two or three sentences on what actually goes wrong in this sector. */
  intro: string;
  /** The rights that specifically apply here. */
  rights: RightPoint[];
  /** Deadlines that decide whether a claim survives. */
  deadlines: { title: string; body: string }[];
  /** What to put in the letter that this sector's complaints team responds to. */
  letterPoints: string[];
  escalation: EscalationRoute;
  /** Anything a competitor would gloss over. Rendered as an honesty note. */
  caveat?: string;
  /** Real questions, answered in full on the page. Feeds FAQPage JSON-LD. */
  faqs: { q: string; a: string }[];
  sources: SourceLink[];
}

const CRA_2015: SourceLink = {
  label: 'Consumer Rights Act 2015',
  url: 'https://www.legislation.gov.uk/ukpga/2015/15/contents',
};
const CCR_2013: SourceLink = {
  label: 'Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013',
  url: 'https://www.legislation.gov.uk/uksi/2013/3134/contents/made',
};
const CITIZENS_ADVICE: SourceLink = {
  label: 'Citizens Advice consumer service',
  url: 'https://www.citizensadvice.org.uk/consumer/get-more-help/if-you-need-more-help-about-a-consumer-issue/',
};
const MONEY_CLAIM: SourceLink = {
  label: 'Make a court claim for money (Money Claim Online)',
  url: 'https://www.gov.uk/make-court-claim-for-money',
};
const PSR_2017: SourceLink = {
  label: 'Payment Services Regulations 2017',
  url: 'https://www.legislation.gov.uk/uksi/2017/752/contents/made',
};
const CCA_1974: SourceLink = {
  label: 'Consumer Credit Act 1974, section 75',
  url: 'https://www.legislation.gov.uk/ukpga/1974/39/section/75',
};

/** No ombudsman exists for this sector. Used by retail, streaming, gym, parcels. */
const NO_OMBUDSMAN: EscalationRoute = {
  name: 'chargeback, section 75 or the small claims court',
  url: 'https://www.gov.uk/make-court-claim-for-money',
  eligibility:
    'There is no ombudsman for this sector, so once the company has given you its final answer the next step is your card provider or the county court.',
  timeLimit:
    'Chargeback is normally 120 days from the transaction or from when you expected delivery. A court claim is six years from the breach in England, Wales and Northern Ireland, five in Scotland.',
  cost:
    'Chargeback and section 75 are free. A money claim under £300 costs £35 to issue online, rising with the value of the claim.',
  binding:
    'A county court judgment is binding and enforceable. A chargeback can be reversed by the merchant, a section 75 claim can be taken to the Financial Ombudsman if the card issuer refuses it.',
};

export const SECTOR_GUIDANCE: Record<string, SectorGuidance> = {
  energy: {
    label: 'energy supplier',
    pluralLabel: 'energy suppliers',
    intro:
      'Most energy complaints come down to three things: a bill based on an estimate rather than a real meter reading, a catch-up bill covering a period the supplier failed to bill at the time, or a credit balance the supplier is slow to return. All three have specific Ofgem rules attached, and quoting the right one changes the answer you get.',
    rights: [
      {
        text: 'Your supplier cannot charge you for energy used more than 12 months ago if it failed to bill you for it and the failure was not your fault. This applies whether the unbilled energy was missed entirely or under-charged.',
        basis: 'Ofgem back-billing rule, standard licence condition 21BA',
      },
      {
        text: 'You are owed a fixed automatic payment when the supplier misses an appointment, gets a switch wrong, takes too long to send a final bill, or is late refunding a credit balance after you leave.',
        basis: 'Guaranteed Standards of Performance, Electricity and Gas (Standards of Performance) Regulations',
      },
      {
        text: 'The supplier must give you information that is complete, accurate and not misleading, and must make it easy to contact them and to complain.',
        basis: 'Ofgem Standards of Conduct, standard licence condition 0',
      },
      {
        text: 'The supplier must have a published complaints procedure, must record your complaint, and must tell you about your right to go to the Energy Ombudsman.',
        basis: 'Gas and Electricity (Consumer Complaints Handling Standards) Regulations 2008',
      },
      {
        text: 'Any service element, such as a meter installation or a repair visit, must be carried out with reasonable care and skill.',
        basis: 'Consumer Rights Act 2015, section 49',
      },
    ],
    deadlines: [
      {
        title: '12 months — the back-billing cut-off',
        body: 'If a catch-up bill covers usage from more than 12 months before the bill was issued, say so explicitly and ask the supplier to write off the portion outside the window. This is the single most valuable sentence in an energy complaint letter.',
      },
      {
        title: '8 weeks — when the ombudsman opens up',
        body: 'Once eight weeks have passed since you first complained, or you receive a deadlock letter before then, you can take the complaint to the Energy Ombudsman without the supplier’s agreement.',
      },
      {
        title: '12 months — the window to refer',
        body: 'You have 12 months from the deadlock letter, or from the end of the eight-week period, to bring the case to the Energy Ombudsman. Miss it and the case is normally out of scope.',
      },
    ],
    letterPoints: [
      'The MPAN or MPRN for the property and the account number, so the complaints team can pull the meter history rather than the billing summary.',
      'Every meter reading you actually submitted, with dates, so an estimated bill can be corrected against real data.',
      'Whether any part of the bill covers usage more than 12 months old, and an explicit request to apply the back-billing rule to it.',
      'What you want: a corrected bill, a refund of the overpayment, and where a Guaranteed Standard was missed, the automatic payment that goes with it.',
    ],
    escalation: {
      name: 'the Energy Ombudsman',
      url: 'https://www.energyombudsman.org/',
      eligibility:
        'Eight weeks after you first complained, or as soon as you receive a deadlock letter.',
      timeLimit: '12 months from the deadlock letter or from the eight-week point.',
      cost: 'Free to you. The supplier pays the case fee.',
      binding:
        'Binding on the supplier if you accept the decision. You are not bound by it and can still go to court instead.',
    },
    faqs: [
      {
        q: 'My supplier has sent a bill for energy I used two years ago. Do I have to pay it?',
        a: 'Not the part covering more than 12 months before the bill was issued, provided the supplier is at fault for not billing you at the time and you did not obstruct them, for example by refusing meter access or by not telling them you had moved in. The Ofgem back-billing rule in standard licence condition 21BA prevents suppliers charging for unbilled energy older than 12 months. Ask the supplier in writing to reissue the bill with the out-of-window usage removed, and quote the licence condition.',
      },
      {
        q: 'The supplier is sitting on my credit balance after I switched. What can I do?',
        a: 'Suppliers must send a final bill within six weeks of the supply ending and refund any credit balance promptly after that. Where they miss the standard, a fixed automatic payment is due under the Guaranteed Standards of Performance regulations, on top of the refund itself. Ask for both, and say you will take it to the Energy Ombudsman after eight weeks.',
      },
      {
        q: 'Can I refuse to pay while the complaint is open?',
        a: 'Withholding the whole payment risks debt recovery and a credit file mark. The safer route is to pay the part of the bill you accept is correct, tell the supplier in writing that the balance is formally in dispute, and ask them to place recovery action on hold while the complaint is being investigated. Suppliers are expected not to pursue a genuinely disputed amount.',
      },
      {
        q: 'Does the Energy Ombudsman cost me anything?',
        a: 'No. The scheme is free to consumers and funded by the industry. Its decision binds the supplier if you accept it, and you keep the right to go to court instead if you would rather.',
      },
    ],
    sources: [
      { label: 'Ofgem: complaints and how to escalate', url: 'https://www.ofgem.gov.uk/information-consumers/energy-advice-households/making-complaint-about-your-energy-supplier-or-network-operator' },
      { label: 'Energy Ombudsman', url: 'https://www.energyombudsman.org/' },
      CRA_2015,
      CITIZENS_ADVICE,
    ],
  },

  water: {
    label: 'water company',
    pluralLabel: 'water companies',
    intro:
      'You cannot switch household water supplier in England and Wales, so the usual consumer lever of taking your business elsewhere does not exist. What does exist is the Guaranteed Standards Scheme, a statutory list of service failures that trigger a fixed payment automatically, whether or not you ask.',
    rights: [
      {
        text: 'A fixed payment is due automatically when the company misses an appointment, fails to answer a written complaint within 10 working days, interrupts your supply beyond the permitted period, or floods your property with sewage.',
        basis: 'Water Supply and Sewerage Services (Customer Service Standards) Regulations 2008, the Guaranteed Standards Scheme',
      },
      {
        text: 'The company must keep to the standards of service in its charges scheme, and Ofwat can act where a company is systematically failing.',
        basis: 'Water Industry Act 1991, as amended',
      },
      {
        text: 'Any work carried out at your property, such as a meter fit or a leak repair, must be done with reasonable care and skill.',
        basis: 'Consumer Rights Act 2015, section 49',
      },
      {
        text: 'You can ask for a meter, and in most cases return to unmeasured charging within a set trial period if the meter makes your bill worse.',
        basis: 'Water Industry (Charges) (Vulnerable Groups) and metering rules',
      },
    ],
    deadlines: [
      {
        title: '10 working days — the reply clock',
        body: 'A written complaint must be answered within 10 working days. If it is not, a Guaranteed Standards payment falls due on its own, separately from whatever the complaint is about.',
      },
      {
        title: '8 weeks — when CCW takes it on',
        body: 'After eight weeks, or on a deadlock letter, the Consumer Council for Water will take the complaint up on your behalf.',
      },
      {
        title: 'After CCW — WATRS adjudication',
        body: 'If CCW cannot resolve it, the Water Redress Scheme can adjudicate. WATRS is free to you and its decision binds the company if you accept it.',
      },
    ],
    letterPoints: [
      'The dates and times of every missed appointment, supply interruption or flooding incident, because each one may carry its own fixed payment.',
      'The date of your first written complaint, so the 10 working day standard can be measured.',
      'Photographs and, for flooding, any independent report, which materially changes how the claim is assessed.',
      'An explicit request for the Guaranteed Standards Scheme payments as well as the remedy itself.',
    ],
    escalation: {
      name: 'the Consumer Council for Water, then WATRS',
      url: 'https://www.ccw.org.uk/make-a-complaint/',
      eligibility:
        'CCW will take it up after eight weeks or on a deadlock letter. WATRS follows if CCW cannot settle it.',
      timeLimit:
        'CCW asks you to come to them within 12 months. A WATRS application must normally follow within a few months of CCW closing the case.',
      cost: 'Both are free to you.',
      binding:
        'CCW cannot compel the company. A WATRS adjudication binds the company if you accept it.',
    },
    caveat:
      'There is no ombudsman for water in the sense that energy and telecoms have one. CCW is a consumer advocate and cannot force an outcome. WATRS is the binding step, and it is the one worth naming in your letter.',
    faqs: [
      {
        q: 'Do I have to claim the Guaranteed Standards payment, or is it automatic?',
        a: 'It is supposed to be automatic, and companies must pay within a set period of the failure. In practice they miss them, particularly for missed appointments and late complaint replies. List every qualifying failure in your letter with its date and ask for the payment by name. Companies almost never argue once the standard is cited.',
      },
      {
        q: 'My bill has jumped and I think the meter is wrong. What can I do?',
        a: 'Ask the company to test the meter. If it is found to be over-reading outside the permitted tolerance, the company must correct your bill and normally bears the cost of the test. If it reads accurately, you may be charged for the test, so ask what that charge is before you agree.',
      },
      {
        q: 'Can I withhold payment while a complaint is open?',
        a: 'Water companies can recover unpaid charges through the county court, and unlike energy they cannot disconnect a household but they can pursue the debt. Pay the undisputed part, put the disputed part formally in dispute in writing, and ask for recovery to be paused pending the complaint.',
      },
    ],
    sources: [
      { label: 'Consumer Council for Water', url: 'https://www.ccw.org.uk/' },
      { label: 'Water Redress Scheme (WATRS)', url: 'https://www.watrs.org/' },
      { label: 'Ofwat: complaints', url: 'https://www.ofwat.gov.uk/households/your-water-company/complaints/' },
      CRA_2015,
    ],
  },

  broadband: {
    label: 'broadband and landline provider',
    pluralLabel: 'broadband providers',
    intro:
      'Broadband complaints cluster around mid-contract price rises, speeds well below what was sold, and outages that take days to fix. Ofcom has specific rules on all three, and two of them give you either an exit from the contract or money back without having to prove loss.',
    rights: [
      {
        text: 'Any in-contract price rise must have been set out in pounds and pence, before you signed. If it was not, or if the provider changes your contract to your detriment in a way you were not clearly told about, you have the right to leave without an early termination charge.',
        basis: 'Ofcom General Condition C1, price transparency rules in force from 17 January 2025',
      },
      {
        text: 'If your service is completely lost and not fixed within two full working days of being reported, a daily payment falls due, as does a payment for a missed engineer appointment and for a delayed start of service. Ofcom reviews the daily rate every year.',
        basis: 'Ofcom automatic compensation scheme',
      },
      {
        text: 'The provider must give you a clear contract summary before you sign, must handle complaints under a published code, and must tell you which alternative dispute resolution scheme it belongs to.',
        basis: 'Ofcom General Conditions C1 and C4',
      },
      {
        text: 'The service itself must be carried out with reasonable care and skill, and any equipment supplied must be of satisfactory quality.',
        basis: 'Consumer Rights Act 2015, sections 9 and 49',
      },
      {
        text: 'If the speed falls below the minimum guaranteed speed you were given at the point of sale and is not fixed within 30 days, you can exit the contract penalty-free under the voluntary Ofcom speed code that the major providers have signed.',
        basis: 'Ofcom Codes of Practice on broadband speeds',
      },
    ],
    deadlines: [
      {
        title: '2 full working days — the compensation trigger',
        body: 'Total loss of service starts accruing automatic compensation from the third calendar day after you report it. Report faults in writing, or note the reference number, because the clock runs from the report and not from when the fault started.',
      },
      {
        title: '30 days — the speed guarantee',
        body: 'Where a provider signed the Ofcom speed code, it has one month to bring the speed back above the guaranteed minimum before you gain a penalty-free exit.',
      },
      {
        title: '8 weeks — when ADR opens up',
        body: 'Eight weeks after your first complaint, or on a deadlock letter, you can take the case to the provider’s alternative dispute resolution scheme.',
      },
    ],
    letterPoints: [
      'The exact wording of the price you were quoted at sign-up, and a request for a copy of the contract summary document if you no longer hold it.',
      'Fault reference numbers and the dates each fault was reported and closed, which is what the automatic compensation calculation runs off.',
      'Speed test results with timestamps, ideally taken over ethernet rather than wi-fi, because a provider will otherwise blame your home network.',
      'What you want: the automatic compensation owed, a bill correction, and where a price rise was not properly disclosed, release from the contract with no early termination charge.',
    ],
    escalation: {
      name: 'the Communications Ombudsman or CISAS',
      url: 'https://www.ofcom.org.uk/phones-and-broadband/complaining/adr-schemes/',
      eligibility:
        'Eight weeks after your first complaint, or as soon as you get a deadlock letter.',
      timeLimit: '12 months from the deadlock letter or from the eight-week point.',
      cost: 'Free to you. The provider pays the case fee.',
      binding: 'Binding on the provider if you accept the decision.',
    },
    caveat:
      'Every provider belongs to one of the two Ofcom-approved schemes, but not the same one. Ofcom publishes the list at the link above, and your provider must also tell you which scheme covers you. Applying to the wrong scheme wastes weeks, so check before you file.',
    faqs: [
      {
        q: 'My provider raised the price mid-contract. Can I leave?',
        a: 'It depends on how the rise was disclosed when you signed. Since 17 January 2025 Ofcom has required in-contract price rises to be stated in pounds and pence at the point of sale. If your contract instead described the rise as a percentage, or as inflation plus a margin, or did not describe it at all, the rise is a contract modification to your detriment and General Condition C1 gives you the right to exit without an early termination charge. Put the request in writing and quote C1.',
      },
      {
        q: 'How much compensation do I get for an outage?',
        a: 'The Ofcom automatic compensation scheme pays a fixed daily amount for each calendar day of total loss of service after the first two full working days from your report, plus separate fixed amounts for a missed engineer appointment and for a delayed start of a new service. Ofcom uprates the daily rate each year, so check the current figure on the Ofcom page rather than relying on an older number. The payment should be applied to your bill automatically. Where it has not been, ask for it by name.',
      },
      {
        q: 'My speeds are nowhere near what I was sold. Is that a breach?',
        a: 'The advertised headline speed is not the promise that matters. What matters is the minimum guaranteed speed the provider gave you at the point of sale. If your line consistently falls below that figure and the provider cannot fix it within 30 days, the major providers who signed Ofcom’s speed code let you exit penalty-free, including any phone or TV bundled with it. Gather ethernet speed tests at different times of day first.',
      },
      {
        q: 'Do I have to complain for eight weeks before going to the ombudsman?',
        a: 'You need either eight weeks from your first complaint, or a deadlock letter, whichever comes first. If the provider tells you it will not do anything more, ask explicitly for a deadlock letter. That short email can save you six weeks of waiting.',
      },
    ],
    sources: [
      { label: 'Ofcom: how to complain', url: 'https://www.ofcom.org.uk/phones-and-broadband/complaining/' },
      { label: 'Ofcom: alternative dispute resolution schemes', url: 'https://www.ofcom.org.uk/phones-and-broadband/complaining/adr-schemes/' },
      { label: 'Ofcom: automatic compensation', url: 'https://www.ofcom.org.uk/phones-and-broadband/service-quality/automatic-compensation-need-know/' },
      CRA_2015,
    ],
  },

  mobile: {
    label: 'mobile network',
    pluralLabel: 'mobile networks',
    intro:
      'Mobile complaints tend to be about annual price rises inside a fixed term, charges for data or roaming that were not made clear, handsets that fail inside the warranty, and difficulty leaving. Ofcom rules cover the price rise and the switch. The Consumer Rights Act covers the handset.',
    rights: [
      {
        text: 'An in-contract price rise must have been set out in pounds and pence before you signed. If it was not, the rise is a detrimental contract modification and you can exit without an early termination charge.',
        basis: 'Ofcom General Condition C1, price transparency rules in force from 17 January 2025',
      },
      {
        text: 'You can switch away using a PAC to keep your number or a STAC to leave without keeping it, obtained by text, and the provider must not charge you notice-period fees for a period after you have left.',
        basis: 'Ofcom General Condition C7, switching and number portability',
      },
      {
        text: 'A handset sold with the contract must be of satisfactory quality, fit for purpose and as described. Your claim for a faulty handset is against the network that sold it, not the manufacturer.',
        basis: 'Consumer Rights Act 2015, sections 9 to 11',
      },
      {
        text: 'Where a handset is bought on credit alongside the airtime, the credit agreement is separate and may be regulated, which affects your cancellation and early settlement rights.',
        basis: 'Consumer Credit Act 1974',
      },
      {
        text: 'You have a 14-day cancellation right on anything bought online, by phone or at your door, running from delivery of the handset.',
        basis: 'Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013',
      },
    ],
    deadlines: [
      {
        title: '30 days — the short-term right to reject a handset',
        body: 'If the handset is faulty within 30 days of delivery you can reject it outright for a full refund, rather than accepting a repair. After 30 days the network gets one attempt at repair or replacement first.',
      },
      {
        title: '6 months — the burden of proof',
        body: 'A fault appearing within six months of delivery is presumed to have been there from the start. The network has to prove otherwise, not you.',
      },
      {
        title: '8 weeks — when ADR opens up',
        body: 'Eight weeks after your first complaint, or on a deadlock letter, you can take the case to the network’s alternative dispute resolution scheme.',
      },
    ],
    letterPoints: [
      'The tariff name and the exact price you were quoted at sign-up, with the contract summary if you have it.',
      'For a billing dispute, the specific line items you are challenging rather than the total, with dates.',
      'For a handset fault, the date of delivery, the date the fault appeared, and every repair attempt so far.',
      'What you want: the charge removed, the handset replaced or refunded, or release from the contract with no early termination charge.',
    ],
    escalation: {
      name: 'the Communications Ombudsman or CISAS',
      url: 'https://www.ofcom.org.uk/phones-and-broadband/complaining/adr-schemes/',
      eligibility:
        'Eight weeks after your first complaint, or as soon as you get a deadlock letter.',
      timeLimit: '12 months from the deadlock letter or from the eight-week point.',
      cost: 'Free to you. The provider pays the case fee.',
      binding: 'Binding on the provider if you accept the decision.',
    },
    caveat:
      'Networks belong to one of the two Ofcom-approved schemes, and not all to the same one. Check Ofcom’s list, or ask the network which scheme covers you, before you file.',
    faqs: [
      {
        q: 'My network raised my monthly price mid-contract. Do I have to accept it?',
        a: 'Only if the rise was set out in pounds and pence at the point of sale. Ofcom required that from 17 January 2025. Contracts that instead promised a rise linked to inflation, or an unspecified annual increase, do not meet the standard, and a rise under them is a contract modification to your detriment. General Condition C1 then gives you a penalty-free exit. Ask in writing, quote C1, and ask for a PAC so you keep your number.',
      },
      {
        q: 'My phone broke after eight months. Is that the network’s problem or the manufacturer’s?',
        a: 'The network sold it to you, so under the Consumer Rights Act the network is the one on the hook. A manufacturer warranty sits on top of your statutory rights and does not replace them. Past six months you may have to show the fault was inherent rather than caused by damage, but the network cannot simply refer you to the manufacturer and close the case.',
      },
      {
        q: 'I was charged hundreds for data I did not know I was using. Can I get it back?',
        a: 'Ask for the itemised data records and check whether the network applied the spend caps and out-of-bundle warnings it is required to offer. Where a network failed to warn you, or applied roaming charges without the notification you should have had, the charge is challengeable. Put it in writing, ask for the charge to be removed while it is investigated, and escalate to ADR at eight weeks.',
      },
      {
        q: 'Can I cancel a contract I signed in a shop?',
        a: 'The 14-day cancellation right in the Consumer Contracts Regulations covers distance and off-premises sales, which means online, telephone and doorstep. A contract signed in a shop is an on-premises sale and does not carry that automatic right, although many networks give a short returns window voluntarily. Check the network’s own returns policy, which is contractual and enforceable.',
      },
    ],
    sources: [
      { label: 'Ofcom: how to complain', url: 'https://www.ofcom.org.uk/phones-and-broadband/complaining/' },
      { label: 'Ofcom: alternative dispute resolution schemes', url: 'https://www.ofcom.org.uk/phones-and-broadband/complaining/adr-schemes/' },
      { label: 'Ofcom: switching mobile provider', url: 'https://www.ofcom.org.uk/phones-and-broadband/changing-provider/' },
      CRA_2015,
    ],
  },

  insurance: {
    label: 'insurance provider',
    pluralLabel: 'insurance providers',
    intro:
      'Insurance complaints are usually a declined claim, a claim settled far below what it costs to put things right, or a renewal price that has moved sharply. All three sit inside FCA rules that are far more specific than general consumer law, and the Financial Ombudsman applies them for free.',
    rights: [
      {
        text: 'The insurer must handle your claim promptly and fairly, must not unreasonably reject it, and must not settle it at a level that is disproportionately low.',
        basis: 'FCA Handbook, ICOBS 8.1',
      },
      {
        text: 'The insurer must send you a final response within eight weeks of your complaint, and that response must tell you about your right to go to the Financial Ombudsman.',
        basis: 'FCA Handbook, DISP 1.6',
      },
      {
        text: 'For a consumer policy, an insurer cannot avoid the policy for an honest mistake in what you told them. It must show a qualifying misrepresentation, and where the mistake was careless rather than deliberate the remedy has to be proportionate, which often means paying a reduced claim rather than nothing.',
        basis: 'Consumer Insurance (Disclosure and Representations) Act 2012',
      },
      {
        text: 'The insurer must act to deliver good outcomes for you, including fair value, and must not exploit inertia at renewal.',
        basis: 'FCA Consumer Duty, PRIN 2A',
      },
      {
        text: 'A renewal quote must show last year’s premium alongside this year’s, and pricing must not be higher for an existing customer than an equivalent new customer would be quoted through the same channel.',
        basis: 'FCA general insurance pricing practices rules, ICOBS 6B',
      },
    ],
    deadlines: [
      {
        title: '8 weeks — the final response clock',
        body: 'The insurer has eight weeks from your complaint to issue a final response. If it does not, you can go straight to the Financial Ombudsman without one.',
      },
      {
        title: '6 months — the window to refer to the ombudsman',
        body: 'You have six months from the date of the final response letter to refer the complaint to the Financial Ombudsman. This one catches people out constantly. The letter itself must tell you about it.',
      },
      {
        title: '6 years, or 3 from awareness',
        body: 'Separately, the ombudsman will not normally look at something more than six years after the event, or if later, more than three years after you knew or ought reasonably to have known you had cause to complain.',
      },
    ],
    letterPoints: [
      'The policy number, the claim reference, and the specific policy wording the insurer is relying on to decline or reduce the claim.',
      'A request for the loss adjuster’s report and any expert evidence relied on, which you are usually entitled to see.',
      'Where the insurer says you misrepresented something, an explanation of what you were actually asked and what you actually answered, because the 2012 Act turns on the question that was put to you.',
      'What you want, quantified: the sum claimed, the shortfall, and any consequential loss and distress you are asking to be recognised.',
    ],
    escalation: {
      name: 'the Financial Ombudsman Service',
      url: 'https://www.financial-ombudsman.org.uk/consumers/how-to-complain',
      eligibility:
        'After the insurer’s final response, or eight weeks after you complained if no final response has arrived.',
      timeLimit:
        'Six months from the final response letter, and normally within six years of the event or three years from when you became aware of it.',
      cost: 'Free to you. The firm pays a case fee.',
      binding:
        'Binding on the insurer if you accept the decision. If you reject it, you keep your right to go to court.',
    },
    faqs: [
      {
        q: 'My claim was declined for non-disclosure. Is that the end of it?',
        a: 'Very often not. Under the Consumer Insurance (Disclosure and Representations) Act 2012 an insurer cannot simply void a consumer policy because something was not mentioned. It has to show you made a misrepresentation in answer to a question it actually asked, that the misrepresentation was qualifying, and then apply a proportionate remedy. If the mistake was careless rather than deliberate or reckless, the usual outcome is that the insurer pays a reduced proportion of the claim or applies the terms it would have imposed, not that it pays nothing. Ask for the exact question you were asked and the answer recorded.',
      },
      {
        q: 'The settlement offer will not cover the cost of replacing what I lost. What can I do?',
        a: 'Check whether the policy is new-for-old or indemnity, because that changes the benchmark entirely. Then get two independent quotes for like-for-like replacement and put them to the insurer alongside a request for the basis of its own valuation. ICOBS 8.1 prevents an insurer settling a claim at a level that is disproportionately low, and the Financial Ombudsman routinely uprates settlements where the insurer cannot evidence its figure.',
      },
      {
        q: 'My renewal premium jumped even though I did not claim. Is that allowed?',
        a: 'Premiums can rise for reasons unconnected to you, such as claims inflation across the book. What is not allowed is charging you more at renewal than an equivalent new customer would be quoted through the same channel, which the FCA banned under ICOBS 6B. Get a new-customer quote for the identical cover on the same channel, and if it is materially cheaper, put the two side by side in your complaint.',
      },
      {
        q: 'How long does the Financial Ombudsman take?',
        a: 'Straightforward cases are often resolved in a few months by an investigator. Cases that go on to an ombudsman for a final decision take longer. It is free either way, and the decision binds the insurer if you accept it, so the delay usually costs you nothing but time.',
      },
    ],
    sources: [
      { label: 'Financial Ombudsman Service', url: 'https://www.financial-ombudsman.org.uk/consumers/how-to-complain' },
      { label: 'FCA Handbook: DISP (complaints)', url: 'https://www.handbook.fca.org.uk/handbook/DISP/' },
      { label: 'FCA Handbook: ICOBS 8 (claims handling)', url: 'https://www.handbook.fca.org.uk/handbook/ICOBS/8/' },
      { label: 'Consumer Insurance (Disclosure and Representations) Act 2012', url: 'https://www.legislation.gov.uk/ukpga/2012/6/contents' },
    ],
  },

  banking: {
    label: 'bank',
    pluralLabel: 'banks and building societies',
    intro:
      'Banking complaints split into two families with very different rules. Payment problems, meaning unauthorised transactions, scams and failed transfers, sit under the Payment Services Regulations with tight statutory deadlines. Everything else, from account closures to lending decisions to service failures, sits under the FCA complaint rules and the Consumer Duty.',
    rights: [
      {
        text: 'An unauthorised payment must be refunded by the end of the next business day after you report it, unless the bank has reasonable grounds to suspect you acted fraudulently. It cannot simply hold the refund while it investigates.',
        basis: 'Payment Services Regulations 2017, regulation 76',
      },
      {
        text: 'It is for the bank to prove a payment was authorised, not for you to prove it was not. Use of your card or your credentials is not on its own proof.',
        basis: 'Payment Services Regulations 2017, regulation 75',
      },
      {
        text: 'If you were tricked into sending money to a fraudster by bank transfer, you are entitled to reimbursement under the mandatory rules in force since 7 October 2024, unless you were grossly negligent.',
        basis: 'Payment Systems Regulator authorised push payment reimbursement requirement',
      },
      {
        text: 'For anything you bought on a credit card costing more than £100 and not more than £30,000, the card issuer is jointly liable with the retailer for misrepresentation or breach of contract. You can claim from the bank instead of the retailer.',
        basis: 'Consumer Credit Act 1974, section 75',
      },
      {
        text: 'A payment services complaint must get a final response within 15 business days, extendable to 35 only in exceptional circumstances. Other complaints get the standard eight weeks.',
        basis: 'FCA Handbook, DISP 1.6',
      },
    ],
    deadlines: [
      {
        title: 'Next business day — the unauthorised payment refund',
        body: 'Report an unauthorised transaction as soon as you spot it. The refund obligation bites by the end of the next business day, which is a far stronger position than waiting for an investigation to conclude.',
      },
      {
        title: '13 months — the outer limit on unauthorised payments',
        body: 'You lose the right to a refund for an unauthorised payment if you do not notify the bank without undue delay and in any event within 13 months of the debit.',
      },
      {
        title: '15 business days, or 8 weeks',
        body: 'Payment services complaints get a final response in 15 business days. Everything else gets eight weeks. Either clock expiring lets you go to the Financial Ombudsman.',
      },
      {
        title: '6 months — the window to refer to the ombudsman',
        body: 'Six months from the final response letter to refer to the Financial Ombudsman. The letter must tell you this.',
      },
    ],
    letterPoints: [
      'Whether you are complaining about a payment, which triggers the Payment Services Regulations, or about service or lending, which does not. Say which, because it sets the deadline the bank has to work to.',
      'The transaction dates, amounts and beneficiary details for every disputed payment.',
      'For a scam, exactly what you were told and by whom, and what the bank’s systems did or did not warn you about at the time.',
      'For a section 75 claim, the retailer, what was promised, what was delivered, and the fact that the purchase price was over £100.',
      'What you want: the refund, the interest, the credit file correction, and any distress and inconvenience.',
    ],
    escalation: {
      name: 'the Financial Ombudsman Service',
      url: 'https://www.financial-ombudsman.org.uk/consumers/how-to-complain',
      eligibility:
        'After the final response, or after 15 business days for a payment services complaint, or eight weeks for anything else.',
      timeLimit:
        'Six months from the final response letter, and normally within six years of the event or three years from when you became aware of it.',
      cost: 'Free to you. The firm pays a case fee.',
      binding: 'Binding on the bank if you accept the decision.',
    },
    faqs: [
      {
        q: 'The bank says I authorised the payment because my card was used. Is that enough?',
        a: 'No. Regulation 75 of the Payment Services Regulations 2017 puts the burden on the bank to prove the payment was authenticated, accurately recorded and not affected by a technical breakdown, and it says explicitly that use of the payment instrument is not in itself necessarily sufficient to prove you authorised it or acted fraudulently or with gross negligence. Ask the bank to evidence the authentication and to explain, specifically, what it says you did wrong.',
      },
      {
        q: 'I was scammed into transferring money. Will I get it back?',
        a: 'Since 7 October 2024 there is a mandatory reimbursement requirement for authorised push payment fraud over Faster Payments and CHAPS. The sending bank must reimburse you unless it can show you acted with gross negligence, and there is a separate consumer standard of caution. Vulnerable customers are protected from that exception. Report it to the bank immediately, and to Action Fraud, and put the complaint in writing.',
      },
      {
        q: 'My bank closed my account with no explanation. Do I have any rights?',
        a: 'A bank can close an account by giving the notice in its terms, usually two months for a personal account, but it must act fairly and consistently with the Consumer Duty, and the notice period in the contract binds it. Where an account was closed immediately, ask for the contractual basis. The bank may be unable to tell you the reason if a suspicious activity report is involved, but the Financial Ombudsman can see the underlying material even where you cannot, which is why escalating is worthwhile here.',
      },
      {
        q: 'Can I use section 75 when the retailer has gone bust?',
        a: 'Yes, that is exactly what it is for. Section 75 of the Consumer Credit Act 1974 makes the credit card issuer jointly and severally liable with the retailer for misrepresentation or breach of contract on purchases over £100 and up to £30,000. The retailer being insolvent does not defeat the claim against the card issuer. If the card issuer refuses, take it to the Financial Ombudsman.',
      },
    ],
    sources: [
      { label: 'Financial Ombudsman Service', url: 'https://www.financial-ombudsman.org.uk/consumers/how-to-complain' },
      PSR_2017,
      CCA_1974,
      { label: 'Payment Systems Regulator: APP fraud reimbursement', url: 'https://www.psr.org.uk/what-we-do/app-fraud/' },
    ],
  },

  retail: {
    label: 'retailer',
    pluralLabel: 'retailers',
    intro:
      'Retail is the one sector where you hold the strongest statutory rights and the weakest escalation route. The Consumer Rights Act gives you a hard 30-day right to reject faulty goods for a full refund, but there is no retail ombudsman, so if the shop says no your leverage is your card provider or the small claims court.',
    rights: [
      {
        text: 'Goods must be of satisfactory quality, fit for the purpose you made known, and as described. That is a statutory term of every consumer sale, and it cannot be excluded.',
        basis: 'Consumer Rights Act 2015, sections 9, 10 and 11',
      },
      {
        text: 'For 30 days from delivery you can reject faulty goods outright and demand a full refund. You do not have to accept a repair or a credit note.',
        basis: 'Consumer Rights Act 2015, sections 20 and 22',
      },
      {
        text: 'After 30 days the retailer gets one attempt at repair or replacement. If that fails, you can demand a price reduction or reject the goods for a refund, which may be reduced for use after the first six months.',
        basis: 'Consumer Rights Act 2015, sections 23 and 24',
      },
      {
        text: 'A fault that appears within six months of delivery is presumed to have been there at delivery. The retailer has to prove otherwise.',
        basis: 'Consumer Rights Act 2015, section 19(14)',
      },
      {
        text: 'Anything bought online, by phone or at your door can be cancelled within 14 days of delivery for any reason at all, and the refund must follow within 14 days of the goods coming back.',
        basis: 'Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013',
      },
      {
        text: 'Goods must be delivered within 30 days unless you agreed a different date, and the goods remain at the retailer’s risk until they are in your physical possession.',
        basis: 'Consumer Rights Act 2015, sections 28 and 29',
      },
    ],
    deadlines: [
      {
        title: '30 days — the short-term right to reject',
        body: 'The strongest right you have, and the shortest. Inside 30 days of delivery a faulty item can be handed back for a full cash refund with no argument about repairs.',
      },
      {
        title: '14 days — the distance selling cancellation window',
        body: 'For anything bought at a distance you have 14 days from delivery to say you are cancelling, then a further 14 days to send it back. This is a right to change your mind and needs no fault at all.',
      },
      {
        title: '6 months — the burden of proof flips',
        body: 'Inside six months the retailer proves the goods were fine. After six months you prove they were not, which usually means an independent report.',
      },
      {
        title: '6 years — the outer limit',
        body: 'A claim for breach of the statutory terms can be brought for six years in England, Wales and Northern Ireland, five in Scotland. Retailers often imply the manufacturer warranty is the limit. It is not.',
      },
    ],
    letterPoints: [
      'The order number, the delivery date and the date the fault appeared, because those three dates decide which remedy you get.',
      'Which statutory right you are exercising, named. "I am exercising the short-term right to reject under section 20 of the Consumer Rights Act 2015" reads very differently to "the product is rubbish".',
      'A photograph or video of the fault, and any independent report if you are past six months.',
      'A deadline for the refund, normally 14 days, and a statement that you will pursue a chargeback or a section 75 claim and then a county court claim if it is not met.',
    ],
    escalation: NO_OMBUDSMAN,
    caveat:
      'There is no ombudsman for retail. Some retailers voluntarily join a scheme such as the Retail ADR service, and if yours does you should use it, but you cannot force a retailer into ADR. In practice the effective escalation is a chargeback through your card scheme, a section 75 claim against a credit card issuer for purchases over £100, or a claim in the county court.',
    faqs: [
      {
        q: 'The shop says I have to take a repair, not a refund. Are they right?',
        a: 'Not if you are within 30 days of delivery. Section 20 of the Consumer Rights Act 2015 gives you a short-term right to reject faulty goods and receive a full refund, and the retailer cannot substitute a repair, a replacement or a credit note without your agreement. Past 30 days the retailer does get one attempt at repair or replacement first, and only if that fails do you get back to a refund or a price reduction.',
      },
      {
        q: 'They told me to contact the manufacturer. Do I have to?',
        a: 'No. Your contract is with the retailer that sold you the item, and the statutory rights in the Consumer Rights Act run against the retailer. A manufacturer warranty is an extra, voluntary promise sitting on top of that. You can use it if it is quicker, but the retailer cannot use it to get out of its own obligations. Say so in writing.',
      },
      {
        q: 'How does chargeback work and when should I use it?',
        a: 'Chargeback is a card scheme process, not a legal right, and it lets your bank claw a payment back from the retailer’s bank where goods never arrived, arrived faulty, or were not as described. It works for debit and credit cards, there is no minimum value, and the usual window is 120 days from the transaction or from when you expected delivery. Ask your bank for a chargeback in writing. For credit card purchases over £100, section 75 is stronger because it is a statutory right rather than a scheme rule.',
      },
      {
        q: 'Is the small claims court worth it for a few hundred pounds?',
        a: 'Often, yes. A money claim under £300 costs £35 to issue online and the small claims track does not normally award the other side’s legal costs against you, which removes the usual risk. Most retailers settle once a claim is issued. Send a letter before action first, giving 14 days, because the court expects it and it frequently resolves the matter on its own.',
      },
    ],
    sources: [CRA_2015, CCR_2013, CCA_1974, CITIZENS_ADVICE, MONEY_CLAIM],
  },

  streaming: {
    label: 'streaming and digital subscription service',
    pluralLabel: 'streaming services',
    intro:
      'Digital subscriptions generate two recurring complaints: being charged after cancelling, and a service that does not work as sold. The Consumer Rights Act has a dedicated digital content chapter that most people have never heard of, and the payment side gives you a route through your bank that does not depend on the provider replying at all.',
    rights: [
      {
        text: 'Digital content must be of satisfactory quality, fit for purpose and as described, exactly as physical goods must be.',
        basis: 'Consumer Rights Act 2015, sections 34, 35 and 36',
      },
      {
        text: 'Where digital content is faulty you are entitled to a repair or replacement, and if that is impossible or fails, a price reduction of up to the full amount paid.',
        basis: 'Consumer Rights Act 2015, sections 42 and 44',
      },
      {
        text: 'If the provider or something it supplied damages your device or other digital content, it must repair the damage or compensate you.',
        basis: 'Consumer Rights Act 2015, section 46',
      },
      {
        text: 'A term buried in the small print that you had no real opportunity to see is not binding on you, and a term causing a significant imbalance against you contrary to good faith is unfair and unenforceable.',
        basis: 'Consumer Rights Act 2015, Part 2, sections 62 and 68',
      },
      {
        text: 'If you cancelled and were charged anyway, that is an unauthorised payment. Your bank must refund it by the end of the next business day after you report it, and the burden is on the payment provider to prove you authorised it.',
        basis: 'Payment Services Regulations 2017, regulations 75 and 76',
      },
      {
        text: 'A subscription bought online carries a 14-day cancellation right, although you lose it once you expressly agree to immediate supply and acknowledge that you are giving the right up.',
        basis: 'Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013',
      },
    ],
    deadlines: [
      {
        title: '14 days — the cancellation window',
        body: 'From the day you sign up, unless you clicked through an acknowledgement that immediate access ends the right, which most services now include.',
      },
      {
        title: 'Next business day — the unauthorised charge refund',
        body: 'A charge taken after you cancelled is an unauthorised payment. Report it to your bank and the refund obligation bites immediately, without waiting for the service to respond.',
      },
      {
        title: '120 days — the chargeback window',
        body: 'The usual card scheme limit for raising a chargeback, measured from the transaction date.',
      },
    ],
    letterPoints: [
      'The account email and the exact date and method of cancellation, with a screenshot or confirmation email if you have one.',
      'Every charge taken after that date, listed with amounts.',
      'For a service fault, when it started, what devices you tried, and the provider’s own status page if it confirms an outage.',
      'What you want: a refund of every post-cancellation charge, and confirmation in writing that the subscription is closed.',
    ],
    escalation: NO_OMBUDSMAN,
    caveat:
      'There is no ombudsman for streaming services, and most are contracted through an overseas entity, which makes a court claim more awkward than usual. That is why the payment route matters more here than the complaint route. Cancel the continuous payment authority with your bank, which you are entitled to do directly under the Payment Services Regulations, rather than relying on the provider to stop taking money.',
    faqs: [
      {
        q: 'I cancelled and they charged me anyway. What is the fastest fix?',
        a: 'Go to your bank rather than the provider. A payment taken after you withdrew your consent is an unauthorised payment under regulation 67 and regulation 76 of the Payment Services Regulations 2017, and your bank must refund it by the end of the next business day after you report it. You can also instruct your bank to cancel the continuous payment authority directly, and the bank must do it. It cannot tell you to sort it out with the merchant first.',
      },
      {
        q: 'The service keeps buffering or the content I subscribed for has been removed. Is that a breach?',
        a: 'Possibly. Sections 34 to 36 of the Consumer Rights Act 2015 require digital content to be of satisfactory quality, fit for the purpose you made known, and as described. If you subscribed specifically for a title that has been pulled, or the service is persistently unusable, section 42 entitles you to a repair or, where that is not possible, a price reduction that can go up to the full price. Log the dates and the failures before you complain.',
      },
      {
        q: 'They say the free trial auto-renewal was in the terms. Does that settle it?',
        a: 'Not automatically. Under Part 2 of the Consumer Rights Act 2015, a term is not binding if it was not transparent and prominent, and an auto-renewal term buried where a reasonable consumer would not see it can be challenged on that basis. Whether it succeeds depends on how the sign-up screen was designed. Take a screenshot of the flow if it is still available.',
      },
      {
        q: 'Can the price go up mid-subscription?',
        a: 'A rolling monthly subscription is a series of short contracts, so a provider can normally change the price for the next period as long as it gives you clear advance notice and a real chance to cancel first. What it cannot do is change the price without notice, or make cancellation unreasonably difficult. Where notice was not given, treat the extra as an unauthorised amount and raise it with your bank.',
      },
    ],
    sources: [CRA_2015, CCR_2013, PSR_2017, CITIZENS_ADVICE],
  },

  delivery: {
    label: 'parcel courier',
    pluralLabel: 'parcel couriers',
    intro:
      'The most useful thing to know about a lost or damaged parcel is that, in most cases, your claim is not against the courier at all. If a retailer arranged the delivery, the goods stay at the retailer’s risk until they are physically in your hands, so the retailer owes you the refund or replacement and it is the retailer’s job to chase the courier.',
    rights: [
      {
        text: 'Goods remain at the seller’s risk until they come into your physical possession. A parcel lost, stolen or damaged in transit is the retailer’s problem, not yours, even if the courier says it was delivered.',
        basis: 'Consumer Rights Act 2015, section 29',
      },
      {
        text: 'A parcel left in a place you did not nominate, or handed to a neighbour you did not authorise, has not been delivered to you for these purposes.',
        basis: 'Consumer Rights Act 2015, section 29',
      },
      {
        text: 'Goods must be delivered within 30 days unless you agreed otherwise. If delivery by a particular date was essential and you said so, you can treat the contract as at an end and demand a refund.',
        basis: 'Consumer Rights Act 2015, section 28',
      },
      {
        text: 'Where you booked and paid the courier yourself, the courier owes you a service carried out with reasonable care and skill, and its liability caps only bite so far as they are fair.',
        basis: 'Consumer Rights Act 2015, sections 49 and 62',
      },
      {
        text: 'A photograph of a doorstep is evidence the courier put a parcel somewhere. It is not proof it reached you, and it does not discharge the retailer’s obligation.',
        basis: 'Consumer Rights Act 2015, section 29',
      },
    ],
    deadlines: [
      {
        title: '30 days — the default delivery limit',
        body: 'Unless you agreed a longer period, non-delivery within 30 days is a breach you can act on straight away.',
      },
      {
        title: '120 days — the chargeback window',
        body: 'If the retailer will not refund, a chargeback for goods not received is normally available within 120 days of the transaction or of the expected delivery date.',
      },
      {
        title: '6 years — the claim limit',
        body: 'Six years in England, Wales and Northern Ireland, five in Scotland, to bring a claim for breach of contract.',
      },
    ],
    letterPoints: [
      'Address the letter to the retailer first, not the courier, unless you booked the courier yourself. Say explicitly that section 29 of the Consumer Rights Act 2015 keeps the goods at the seller’s risk until delivery into your possession.',
      'The order number, the tracking number and the courier’s delivery evidence, including any photograph, and why it does not show delivery to you.',
      'Whether you nominated a safe place or authorised a neighbour. If you did not, say so plainly.',
      'What you want: a replacement or a full refund within 14 days, and a statement that you will pursue chargeback and a county court claim otherwise.',
    ],
    escalation: NO_OMBUDSMAN,
    caveat:
      'Parcel couriers other than Royal Mail and Parcelforce are not covered by an ombudsman scheme, and where the retailer arranged the delivery you have no contract with the courier at all. That is not a weakness in your position. It means you should be claiming from the retailer, which does have a contract with you and does have a statutory obligation to you.',
    faqs: [
      {
        q: 'The courier says it was delivered but I never got it. Who do I claim from?',
        a: 'The retailer, in almost every case. Section 29 of the Consumer Rights Act 2015 says the goods remain at the trader’s risk until they come into the physical possession of you or someone you identified to take delivery. A parcel left in a porch, put over a fence, or given to a neighbour you did not nominate has not come into your possession. Write to the retailer, not the courier, quote section 29 and ask for a replacement or a refund. Chasing the courier is the retailer’s job.',
      },
      {
        q: 'The retailer says I have to open a claim with the courier first. Is that right?',
        a: 'No. If the retailer arranged the delivery, your contract is with the retailer and the courier’s claims process is between the retailer and its supplier. You can decline politely, restate section 29, and give a 14-day deadline for the refund. If the retailer still refuses, raise a chargeback with your card provider or a section 75 claim if you paid over £100 by credit card.',
      },
      {
        q: 'What if I booked and paid the courier myself?',
        a: 'Then you do have a contract with the courier, and the service must be carried out with reasonable care and skill under section 49 of the Consumer Rights Act 2015. Couriers cap their liability, often at a low figure unless you bought extra cover, and those caps are generally enforceable if they were brought to your attention. Check what cover was included in the price you paid, claim to that level, and challenge the cap under section 62 only if the term was hidden or plainly unreasonable.',
      },
      {
        q: 'My parcel arrived damaged. Does that change anything?',
        a: 'No. Damage in transit is the same risk question as loss. The goods were not of satisfactory quality when they came into your possession, so the retailer owes you a repair, replacement or refund. Photograph the packaging as well as the item, because the state of the outer packaging is what usually decides whether the courier or the packing was at fault, and that argument is the retailer’s to have, not yours.',
      },
    ],
    sources: [CRA_2015, CCA_1974, CITIZENS_ADVICE, MONEY_CLAIM],
  },

  postal: {
    label: 'postal operator',
    pluralLabel: 'postal operators',
    intro:
      'Royal Mail and Parcelforce are different from other couriers in one important way: they are regulated by Ofcom and they belong to an approved dispute resolution scheme. That gives you a free, binding escalation route that Evri, Yodel and DPD customers do not have.',
    rights: [
      {
        text: 'Royal Mail is subject to Ofcom regulation and to the universal service obligation, which sets minimum delivery standards for letters and parcels across the UK.',
        basis: 'Postal Services Act 2011 and Ofcom’s universal postal service conditions',
      },
      {
        text: 'Compensation for loss, damage and delay is set out in Royal Mail’s published scheme and varies by service. Special Delivery Guaranteed and Signed For carry higher levels than standard post, and proof of posting is normally required.',
        basis: 'Royal Mail Scheme for the classification, charging and handling of postal packets',
      },
      {
        text: 'After eight weeks, or on a deadlock letter, you can take the complaint to POSTRS, the Ofcom-approved Postal Redress Service. It is free and its decision binds the operator.',
        basis: 'Ofcom-approved alternative dispute resolution for postal services',
      },
      {
        text: 'Where a retailer posted goods to you, the goods remain at the retailer’s risk until they reach you, so you can claim from the retailer instead of, or as well as, dealing with the postal operator.',
        basis: 'Consumer Rights Act 2015, section 29',
      },
    ],
    deadlines: [
      {
        title: 'Claim windows are short and service-specific',
        body: 'Royal Mail sets separate claim windows for loss, damage and delay, and they differ by service. Check the current window on the Royal Mail claims page before you do anything else, because a late claim is refused on that ground alone.',
      },
      {
        title: '8 weeks — when POSTRS opens up',
        body: 'Eight weeks after your first complaint, or on a deadlock letter, you can escalate to POSTRS.',
      },
      {
        title: '12 months — the window to refer',
        body: 'POSTRS expects the case within 12 months of the deadlock letter or the eight-week point.',
      },
    ],
    letterPoints: [
      'The tracking or reference number, the service used, and the proof of posting, because compensation levels turn on the service and proof of posting is normally a precondition.',
      'Evidence of the value of the contents, such as the original invoice, since compensation for standard services is capped and evidence-led.',
      'The dates of every contact so far, so the eight-week clock is unambiguous.',
      'An explicit request for a deadlock letter if the operator will not go further, so you can escalate to POSTRS without waiting.',
    ],
    escalation: {
      name: 'POSTRS, the Postal Redress Service',
      url: 'https://www.cedr.com/consumer/postrs/',
      eligibility:
        'Eight weeks after your first complaint, or as soon as you receive a deadlock letter.',
      timeLimit: '12 months from the deadlock letter or from the eight-week point.',
      cost: 'Free to you.',
      binding: 'Binding on the operator if you accept the decision.',
    },
    faqs: [
      {
        q: 'How much compensation can I get for a lost parcel?',
        a: 'It depends entirely on the service you paid for. Standard services carry a capped amount and normally require proof of posting. Special Delivery Guaranteed and Signed For carry higher levels, and you can buy additional consequential loss cover at the counter. Royal Mail publishes the current figures on its claims pages, and they are updated periodically, so check them rather than relying on a figure you saw elsewhere.',
      },
      {
        q: 'A retailer posted my order by Royal Mail and it never arrived. Who do I chase?',
        a: 'The retailer. Section 29 of the Consumer Rights Act 2015 keeps the goods at the seller’s risk until they come into your physical possession, so the retailer owes you a refund or replacement regardless of what the postal operator does. The retailer can then claim from Royal Mail itself. You are not required to run the claim on the retailer’s behalf.',
      },
      {
        q: 'What is POSTRS and is it worth using?',
        a: 'POSTRS is the Postal Redress Service, the alternative dispute resolution scheme approved by Ofcom for postal services and administered by CEDR. It is free to consumers, and if you accept its decision the operator is bound by it. It is meaningfully better than the position for other parcel couriers, who have no equivalent scheme at all, so it is worth the eight-week wait.',
      },
    ],
    sources: [
      { label: 'Royal Mail: claims and compensation', url: 'https://www.royalmail.com/help/claims' },
      { label: 'POSTRS (CEDR)', url: 'https://www.cedr.com/consumer/postrs/' },
      { label: 'Ofcom: complaining about postal services', url: 'https://www.ofcom.org.uk/post/complaining-about-post/' },
      CRA_2015,
    ],
  },

  gym: {
    label: 'gym or health club',
    pluralLabel: 'gyms and health clubs',
    intro:
      'Gym disputes are almost always about the same thing: a minimum term the member wants out of and the operator says is binding. The law here is not about the gym’s terms being reasonable in the abstract. It is about whether a particular term is fair under Part 2 of the Consumer Rights Act, and the Competition and Markets Authority has already found several common gym terms unfair.',
    rights: [
      {
        text: 'A term is not binding on you if, contrary to good faith, it causes a significant imbalance in the parties’ rights to your detriment. Long lock-ins with no exit for a genuine change of circumstances are the classic example.',
        basis: 'Consumer Rights Act 2015, section 62',
      },
      {
        text: 'A term that was not transparent and prominent is not binding on you at all, and a term hidden in a document you were never shown cannot be enforced.',
        basis: 'Consumer Rights Act 2015, sections 64 and 68',
      },
      {
        text: 'The CMA’s work on gym membership contracts established that members should be able to exit on a significant change of circumstances, such as redundancy, injury, illness or relocation, and that excessive minimum terms are open to challenge.',
        basis: 'CMA and OFT enforcement work on gym membership contracts',
      },
      {
        text: 'If you joined online, over the phone or away from the premises, you have 14 days to cancel for any reason.',
        basis: 'Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013',
      },
      {
        text: 'The facilities must be supplied with reasonable care and skill. Prolonged closures, broken equipment or removed classes you specifically paid for are a breach you can claim a price reduction for.',
        basis: 'Consumer Rights Act 2015, sections 49 and 56',
      },
      {
        text: 'A debt collector chasing a disputed gym membership must treat you fairly, must not pursue a sum it knows is genuinely disputed as though it were undisputed, and must not mislead you about its powers.',
        basis: 'FCA Handbook, CONC 7',
      },
    ],
    deadlines: [
      {
        title: '14 days — if you joined at a distance',
        body: 'Online, telephone and off-premises sign-ups carry an automatic 14-day cancellation right. Sign-ups completed on the premises do not.',
      },
      {
        title: 'Cancel the direct debit, but do it in the right order',
        body: 'Cancelling the mandate without cancelling the membership leaves the debt running and is what leads to a collection agency. Cancel the membership in writing first, keep the confirmation, then cancel the mandate.',
      },
      {
        title: '6 years — the outer limit',
        body: 'Six years in England, Wales and Northern Ireland, five in Scotland, for either side to bring a contract claim.',
      },
    ],
    letterPoints: [
      'The membership number, the join date, the stated minimum term and the exact wording of the cancellation clause you are challenging.',
      'The change of circumstances you are relying on, with evidence: a redundancy letter, a GP note, a tenancy agreement at the new address.',
      'The words "I consider this term unfair and therefore not binding under section 62 of the Consumer Rights Act 2015", which changes how the retention team handles the file.',
      'A clear statement that the sum is in dispute and should not be passed to a debt collection agency while it remains so.',
    ],
    escalation: NO_OMBUDSMAN,
    caveat:
      'There is no gym ombudsman. Where the gym passes the balance to a debt collector, that collector is often FCA-authorised, which gives you a complaint route to the Financial Ombudsman about the collector’s conduct even though you have none against the gym itself. That is a useful lever when a collector is adding fees to a disputed sum.',
    faqs: [
      {
        q: 'I have lost my job. Can I get out of a 12-month gym contract?',
        a: 'Very often, yes. The CMA’s work on gym contracts established that members should be able to exit on a significant change of circumstances, and redundancy is the clearest example. Write to the gym, state the change, attach evidence such as a redundancy letter, and say that a term preventing exit in these circumstances causes a significant imbalance to your detriment and is therefore not binding under section 62 of the Consumer Rights Act 2015. Most chains have an internal process for exactly this and will release you once it is put formally.',
      },
      {
        q: 'Should I just cancel the direct debit?',
        a: 'Not on its own. Cancelling the mandate stops the payment but does not end the membership, so arrears build up and the file goes to a collection agency, usually with fees added. Cancel the membership in writing first, get written confirmation, and only then cancel the mandate. If you have already cancelled the mandate, write now, set out the dispute, and ask for the account to be put on hold while it is resolved.',
      },
      {
        q: 'A debt collector is chasing me for gym fees I dispute. What are my rights?',
        a: 'FCA rules in CONC 7 require a debt collector to treat you fairly and prohibit it from continuing to pursue a debt as though it were undisputed once you have raised a genuine dispute and asked for evidence. Write to the collector, state that the sum is disputed and why, and ask it to refer the matter back to the gym. If the collector is FCA-authorised, you can complain to it and then to the Financial Ombudsman about its conduct, which is a route you do not have against the gym.',
      },
      {
        q: 'The gym closed the pool I joined for. Can I get money back?',
        a: 'If a specific facility was part of what you were sold and it is unavailable for a prolonged period, the service has not been supplied as described or with reasonable care and skill. Section 56 of the Consumer Rights Act 2015 entitles you to a price reduction, which for a monthly membership means a proportionate refund for the period affected. Put a figure on it, based on how much of the membership value that facility represented.',
      },
    ],
    sources: [
      CRA_2015,
      CCR_2013,
      { label: 'CMA: unfair contract terms guidance', url: 'https://www.gov.uk/government/publications/unfair-contract-terms-cma37' },
      { label: 'FCA Handbook: CONC 7 (arrears and recovery)', url: 'https://www.handbook.fca.org.uk/handbook/CONC/7/' },
      CITIZENS_ADVICE,
    ],
  },

  airline: {
    label: 'airline',
    pluralLabel: 'airlines',
    intro:
      'Flight disruption is the one area where UK law gives you a fixed sum rather than a negotiation. UK261 sets the compensation at £220, £350 or £520 per passenger depending on distance, and it is payable regardless of what your ticket cost. The airline’s only real defence is extraordinary circumstances, and that defence is narrower than airlines imply.',
    rights: [
      {
        text: 'For an arrival delay of three hours or more, a cancellation notified less than 14 days in advance, or denied boarding on an overbooked flight, fixed compensation is due: £220 for flights up to 1,500km, £350 for flights between 1,500km and 3,500km, and £520 for flights over 3,500km.',
        basis: 'UK261, retained Regulation (EC) 261/2004 as amended by the Air Passenger Rights (Amendment) (EU Exit) Regulations 2019',
      },
      {
        text: 'The right to care is separate from compensation and applies even where the disruption was outside the airline’s control: meals and refreshments proportionate to the wait, two communications, and hotel accommodation with transfers where an overnight stay becomes necessary.',
        basis: 'UK261, Article 9',
      },
      {
        text: 'On cancellation you choose between a full refund within seven days and re-routing at the earliest opportunity. The airline cannot force a voucher on you.',
        basis: 'UK261, Article 8',
      },
      {
        text: 'Extraordinary circumstances must be genuinely outside the airline’s control and unavoidable even with all reasonable measures. Routine technical faults arising in the ordinary course of operating an aircraft do not qualify, following Wallentin-Hermann and Huzar v Jet2.',
        basis: 'UK261, Article 5(3), as interpreted by the courts',
      },
      {
        text: 'For damaged, delayed or lost baggage, the Montreal Convention sets a liability limit per passenger and short notification deadlines: seven days for damage and 21 days for delay, from the date the baggage was placed at your disposal.',
        basis: 'Montreal Convention 1999, Articles 17, 22 and 31',
      },
    ],
    deadlines: [
      {
        title: '3 hours — the compensation threshold',
        body: 'Measured by arrival time at the final destination, not departure. A flight that leaves four hours late but makes up time and lands two hours and fifty minutes late pays nothing.',
      },
      {
        title: '7 and 21 days — baggage claims',
        body: 'Seven days to notify damage, 21 days to notify delay, from when the baggage was placed at your disposal. These are hard limits under the Montreal Convention.',
      },
      {
        title: '6 years to bring a UK261 claim',
        body: 'Six years in England, Wales and Northern Ireland, five in Scotland. Airlines frequently claim a two-year limit. For UK261 claims in the English courts that is wrong.',
      },
    ],
    letterPoints: [
      'The flight number, the booking reference, the scheduled and actual arrival times, and the great-circle distance, because those four facts decide the band.',
      'The reason the airline gave at the time, in its own words, and a request for the specific evidence it relies on for any extraordinary circumstances defence.',
      'Every receipt for meals, accommodation and transfers, claimed separately as a right to care under Article 9 rather than folded into the compensation claim.',
      'The exact sum, per passenger, and a 14-day deadline before you escalate to the airline’s ADR scheme or the CAA.',
    ],
    escalation: {
      name: 'the airline’s CAA-approved ADR scheme, or the CAA’s Passenger Advice and Complaints Team',
      url: 'https://www.caa.co.uk/passengers/resolving-travel-problems/',
      eligibility:
        'After the airline’s final response, or eight weeks after your complaint if none has arrived.',
      timeLimit:
        'ADR schemes normally require the case within 12 months. The underlying court claim runs for six years in England and Wales.',
      cost: 'Free to you.',
      binding: 'An ADR decision binds the airline if you accept it. A PACT referral is not binding.',
    },
    caveat:
      'Airlines belong to different CAA-approved ADR bodies, and some belong to none. The CAA publishes which scheme covers which airline at the link above. If your airline is not in a scheme, the CAA’s Passenger Advice and Complaints Team can take it up, though it cannot compel a payment, and a small claims action remains available.',
    faqs: [
      {
        q: 'The airline says it was extraordinary circumstances. Is that the end of it?',
        a: 'No, and it is worth pushing. Article 5(3) of UK261 only excuses compensation where the circumstances were outside the carrier’s actual control and could not have been avoided even if all reasonable measures had been taken. The courts have held that technical problems arising in the ordinary course of operating an aircraft are inherent in the airline’s activity and do not qualify, following Wallentin-Hermann and, in the English Court of Appeal, Huzar v Jet2. Ask the airline in writing for the specific cause and the evidence it relies on. Many claims are paid at that point.',
      },
      {
        q: 'How much is my flight delay worth?',
        a: 'It depends only on distance and on whether you arrived three or more hours late, not on what you paid. £220 for flights of 1,500km or less, £350 for flights between 1,500km and 3,500km, and £520 for flights over 3,500km. The band is set by the great-circle distance between the departure and arrival airports. Everyone on the booking is entitled individually, including children on their own ticket.',
      },
      {
        q: 'I paid for my own hotel and meals. Can I claim those on top?',
        a: 'Yes, and you should claim them separately. Article 9 of UK261 imposes a duty of care that applies whatever the cause of the disruption, including genuine extraordinary circumstances where no compensation is payable. Keep every receipt, claim reasonable amounts rather than luxury, and make clear in the letter that this is an Article 9 care claim distinct from any Article 7 compensation claim.',
      },
      {
        q: 'My flight was delayed three years ago. Am I too late?',
        a: 'Almost certainly not. A UK261 claim is a claim for a sum due under retained EU law, and the limitation period in England, Wales and Northern Ireland is six years, five in Scotland. Airlines sometimes point to a two-year limit drawn from the Montreal Convention, which applies to baggage and to damages claims, not to UK261 compensation. Cite the Limitation Act 1980 and press on.',
      },
    ],
    sources: [
      { label: 'CAA: resolving travel problems', url: 'https://www.caa.co.uk/passengers/resolving-travel-problems/' },
      { label: 'CAA: delays and cancellations', url: 'https://www.caa.co.uk/passengers/resolving-travel-problems/delays-and-cancellations/' },
      { label: 'Regulation (EC) 261/2004 as retained in UK law', url: 'https://www.legislation.gov.uk/eur/2004/261/contents' },
      MONEY_CLAIM,
    ],
  },

  transport: {
    label: 'rail and public transport operator',
    pluralLabel: 'transport operators',
    intro:
      'Rail complaints have their own machinery: a compensation scheme for delays that is contractual rather than statutory, a dedicated ombudsman, and a statutory watchdog. The compensation scheme is the fastest route and does not require you to prove anything beyond the delay itself.',
    rights: [
      {
        text: 'Delay Repay pays a proportion of your fare back based on how late you arrived. Thresholds vary by operator, commonly 15, 30 or 60 minutes, and the reason for the delay is irrelevant.',
        basis: 'Operator Delay Repay schemes, required under franchise and licence arrangements',
      },
      {
        text: 'Your ticket is a contract on the National Rail Conditions of Travel, which set out your rights to refunds, to travel on an alternative service and to compensation for disruption.',
        basis: 'National Rail Conditions of Travel',
      },
      {
        text: 'The transport service must be supplied with reasonable care and skill, and where it is not you can claim a price reduction on top of any scheme payment.',
        basis: 'Consumer Rights Act 2015, sections 49 and 56',
      },
      {
        text: 'After the operator’s final response, or 40 working days, an unresolved complaint can go to the Rail Ombudsman, which is free and binding on the operator.',
        basis: 'Rail Ombudsman scheme rules',
      },
      {
        text: 'Complaints falling outside the Rail Ombudsman’s scope go to Transport Focus, or to London TravelWatch for services in and around London.',
        basis: 'Statutory passenger watchdog functions',
      },
    ],
    deadlines: [
      {
        title: '28 days — the usual Delay Repay claim window',
        body: 'Most operators require a Delay Repay claim within 28 days of the journey. Some allow longer. Check the operator’s own terms and claim quickly, because this is the deadline people miss.',
      },
      {
        title: '40 working days — when the Rail Ombudsman opens up',
        body: 'You can escalate after the operator’s final response, or after 40 working days if it has not resolved matters.',
      },
      {
        title: '12 months — the window to refer',
        body: 'The Rail Ombudsman expects the case within 12 months of the operator’s final response.',
      },
    ],
    letterPoints: [
      'The date, the booked service, the actual arrival time and the ticket or booking reference.',
      'Whether you have already claimed Delay Repay, and the claim reference, because the ombudsman will ask.',
      'Any consequential cost, such as a taxi or a missed connection on a separate booking, claimed separately from the Delay Repay entitlement.',
      'What you want, and a note that you will escalate to the Rail Ombudsman after 40 working days.',
    ],
    escalation: {
      name: 'the Rail Ombudsman, or Transport Focus and London TravelWatch',
      url: 'https://www.railombudsman.org/',
      eligibility:
        'After the operator’s final response, or 40 working days after you complained.',
      timeLimit: '12 months from the operator’s final response.',
      cost: 'Free to you.',
      binding:
        'A Rail Ombudsman decision binds the operator if you accept it. Transport Focus and London TravelWatch advocate for you but cannot compel an outcome.',
    },
    caveat:
      'Not every transport complaint falls inside the Rail Ombudsman’s scope. Ticket retailers, some open-access operators and non-rail modes sit outside it. If the ombudsman declines the case, Transport Focus, or London TravelWatch for London, will take it up, and a small claims action remains open.',
    faqs: [
      {
        q: 'Does it matter why my train was late?',
        a: 'Not for Delay Repay. The scheme pays out on the delay itself regardless of cause, including weather, infrastructure failure and strikes, which is what makes it more generous in practice than the compensation regimes in other sectors. The reason only becomes relevant if you are claiming consequential losses beyond the scheme.',
      },
      {
        q: 'I missed a connection and had to buy a new ticket. Can I claim that?',
        a: 'If both legs were on one through ticket, the National Rail Conditions of Travel entitle you to travel on the next available service at no extra cost, and any new ticket you were forced to buy should be refunded. If they were separate bookings, you are relying on a general contract claim for consequential loss, which is harder but not hopeless. Keep the receipts and claim them explicitly.',
      },
      {
        q: 'How long do I have to claim Delay Repay?',
        a: 'Most operators set 28 days from the date of the journey, though a few allow longer. It is the single most commonly missed deadline in rail complaints. If you are outside it, claim anyway and explain why, then escalate to the Rail Ombudsman if the operator refuses, because a rigid application of a short window can itself be challenged.',
      },
    ],
    sources: [
      { label: 'Rail Ombudsman', url: 'https://www.railombudsman.org/' },
      { label: 'Transport Focus', url: 'https://www.transportfocus.org.uk/' },
      { label: 'London TravelWatch', url: 'https://www.londontravelwatch.org.uk/' },
      { label: 'National Rail: Conditions of Travel', url: 'https://www.nationalrail.co.uk/conditions-of-travel/' },
      CRA_2015,
    ],
  },

  'private-hire': {
    label: 'private hire and ride-hailing operator',
    pluralLabel: 'ride-hailing operators',
    intro:
      'Ride-hailing sits across two regimes. The commercial relationship, meaning the fare, the cancellation charge and the service, is ordinary consumer contract law. Driver conduct, vehicle condition and licensing are a matter for the licensing authority, which in London is Transport for London and elsewhere is the local council.',
    rights: [
      {
        text: 'The service must be carried out with reasonable care and skill, and where it is not you can claim a repeat performance or a price reduction.',
        basis: 'Consumer Rights Act 2015, sections 49, 55 and 56',
      },
      {
        text: 'Where no price was agreed in advance, the price must be reasonable. A fare that departs materially from what the app quoted is challengeable.',
        basis: 'Consumer Rights Act 2015, section 51',
      },
      {
        text: 'A charge taken without your authority, including a cancellation or cleaning fee you did not agree to, is an unauthorised payment. Your bank must refund it by the end of the next business day after you report it.',
        basis: 'Payment Services Regulations 2017, regulations 75 and 76',
      },
      {
        text: 'Private hire operators, drivers and vehicles must be licensed. In London that is Transport for London; elsewhere it is the district or borough council. Conduct and safety complaints go to the licensing authority after the operator.',
        basis: 'Private Hire Vehicles (London) Act 1998 and the Local Government (Miscellaneous Provisions) Act 1976',
      },
      {
        text: 'A term allowing the operator to charge an unspecified sum after the journey, without a clear basis, may be unfair and unenforceable.',
        basis: 'Consumer Rights Act 2015, section 62',
      },
    ],
    deadlines: [
      {
        title: 'Report a disputed charge quickly',
        body: 'The unauthorised payment protections in the Payment Services Regulations require notification without undue delay and in any event within 13 months of the debit.',
      },
      {
        title: 'Licensing complaints have no fixed deadline',
        body: 'But evidence goes stale fast. Report driver conduct and vehicle safety issues to the licensing authority within days, while dashcam and app records still exist.',
      },
    ],
    letterPoints: [
      'The trip ID, the date and time, and the driver or vehicle identifier, which is what lets the operator retrieve the record at all.',
      'The quoted fare and the fare actually charged, screenshotted.',
      'For a post-trip charge such as a cleaning fee, a request for the evidence relied on, including photographs and their metadata.',
      'What you want: the charge reversed, and where conduct is involved, confirmation that it has been referred to the licensing authority.',
    ],
    escalation: {
      name: 'Transport for London, or your local licensing authority',
      url: 'https://tfl.gov.uk/help-and-contact/contact-us-about-taxis-and-private-hire',
      eligibility:
        'After you have raised it with the operator, or immediately where safety is involved.',
      timeLimit:
        'No fixed limit, but complaints are far more effective while the operator still holds the trip records.',
      cost: 'Free to you.',
      binding:
        'A licensing authority cannot order a refund. It regulates the operator’s licence, which is a different and often more effective kind of pressure. For the money itself, use your bank or the small claims court.',
    },
    caveat:
      'The licensing authority handles conduct and safety, not your fare. If what you want is money back, the effective routes are the operator’s own process, then a chargeback or unauthorised payment claim through your bank, then the county court. Reporting to TfL is worth doing on its own merits but it will not refund you.',
    faqs: [
      {
        q: 'I was charged a cleaning fee I do not accept. What can I do?',
        a: 'Ask the operator for the evidence, including the photographs and when they were taken. Then, if you did not agree to the charge, tell your bank it was an unauthorised payment. Under regulation 76 of the Payment Services Regulations 2017 the bank must refund an unauthorised payment by the end of the next business day, and under regulation 75 the burden of proving you authorised it sits with the payment provider, not with you.',
      },
      {
        q: 'The fare was far higher than the quote. Is that allowed?',
        a: 'Where a price was quoted and accepted, that is the contract price, and a materially higher charge needs a contractual basis such as a route change you requested. Where no price was agreed, section 51 of the Consumer Rights Act 2015 requires the price to be reasonable. Screenshot the quote, ask the operator for the fare breakdown, and dispute the difference rather than the whole fare.',
      },
      {
        q: 'Who do I report an unsafe driver to?',
        a: 'The operator first, then the licensing authority. In London that is Transport for London, which licenses private hire operators, drivers and vehicles. Outside London it is the district or borough council that issued the licence. Give the trip ID, the date and time, and the vehicle registration. The authority cannot get your money back, but it can act on the licence, which is the sanction operators actually respond to.',
      },
    ],
    sources: [
      { label: 'Transport for London: taxi and private hire complaints', url: 'https://tfl.gov.uk/help-and-contact/contact-us-about-taxis-and-private-hire' },
      CRA_2015,
      PSR_2017,
      CITIZENS_ADVICE,
    ],
  },

  bnpl: {
    label: 'buy now pay later provider',
    pluralLabel: 'buy now pay later providers',
    intro:
      'Buy now pay later is the sector where the usual consumer protections are weakest, and it is worth knowing that before you complain. Interest-free instalment agreements have historically sat outside FCA regulation, which means section 75 does not apply and the Financial Ombudsman may not be able to help. The Government has legislated to bring the sector into FCA regulation, so check the position that applies to your agreement.',
    rights: [
      {
        text: 'Your rights against the retailer are unaffected. If the goods were faulty, never arrived or were not as described, the Consumer Rights Act claim against the retailer is exactly the same as if you had paid by card.',
        basis: 'Consumer Rights Act 2015, sections 9 to 24',
      },
      {
        text: 'Where a return has been accepted by the retailer, the instalment plan should be cancelled and any payments refunded. A provider continuing to collect after a confirmed return is collecting money it is not owed.',
        basis: 'Consumer Rights Act 2015 and general contract law',
      },
      {
        text: 'If the provider took a payment after you withdrew authority, that is an unauthorised payment and your bank must refund it by the end of the next business day after you report it.',
        basis: 'Payment Services Regulations 2017, regulations 75 and 76',
      },
      {
        text: 'Missed instalments can now be reported to UK credit reference agencies. If an entry on your file is inaccurate you can require it to be corrected, and you can add a notice of correction explaining a disputed entry.',
        basis: 'UK GDPR Article 16 and Data Protection Act 2018',
      },
      {
        text: 'Where a collection agency chases a disputed balance, FCA rules on arrears and recovery apply to the agency even if they did not apply to the original agreement.',
        basis: 'FCA Handbook, CONC 7',
      },
    ],
    deadlines: [
      {
        title: 'Act before the next instalment',
        body: 'The practical deadline is the next collection date. Cancel the continuous payment authority with your bank if a disputed plan is still collecting, which you are entitled to do directly.',
      },
      {
        title: '13 months — unauthorised payments',
        body: 'Report an unauthorised collection to your bank without undue delay and in any event within 13 months of the debit.',
      },
      {
        title: '6 years — the contract claim',
        body: 'Six years in England, Wales and Northern Ireland, five in Scotland, for the underlying claim against the retailer.',
      },
    ],
    letterPoints: [
      'That your primary claim is against the retailer, with the order number and what went wrong, and that you are asking the provider to pause collections while it is resolved.',
      'The return tracking number and the retailer’s confirmation of receipt, which is what actually unlocks a cancelled plan.',
      'A request for the provider’s final response letter and confirmation of whether the agreement is a regulated credit agreement, because that determines your ombudsman rights.',
      'Where a credit file entry has been made, a request that it is suppressed while the dispute is open.',
    ],
    escalation: {
      name: 'the Financial Ombudsman Service, where the agreement falls within its jurisdiction',
      url: 'https://www.financial-ombudsman.org.uk/consumers/how-to-complain',
      eligibility:
        'Ask the provider for a final response letter. It must tell you whether you have ombudsman rights. Where it does not, the fallback is a chargeback through your bank or a claim against the retailer.',
      timeLimit:
        'Six months from a final response letter where ombudsman rights apply.',
      cost: 'Free to you.',
      binding: 'Binding on the firm if you accept the decision and the case is in jurisdiction.',
    },
    caveat:
      'This is the honest weakness in buy now pay later. Section 75 of the Consumer Credit Act does not apply to an exempt interest-free agreement, so you cannot make the provider jointly liable for the retailer’s failure the way you can with a credit card. Your strongest position is almost always the claim against the retailer itself, backed by a chargeback on the card you funded the instalments from.',
    faqs: [
      {
        q: 'Does section 75 protect a buy now pay later purchase?',
        a: 'Generally not. Section 75 of the Consumer Credit Act 1974 attaches to regulated credit agreements, and interest-free fixed-instalment buy now pay later has historically been exempt under article 60F(2) of the Regulated Activities Order. That exemption is why the protection does not follow. The Government has legislated to bring the sector under FCA regulation, so check the FCA’s current position for your agreement. In the meantime, direct your claim at the retailer and use chargeback on the card funding the instalments.',
      },
      {
        q: 'I returned the goods but the provider is still taking payments. What do I do?',
        a: 'Two things at once. Send the provider the retailer’s confirmation of receipt and ask for the plan to be cancelled and payments refunded. Separately, instruct your bank to cancel the continuous payment authority, which you are entitled to do directly under the Payment Services Regulations 2017 without the provider’s agreement. Any payment taken after you withdraw authority is unauthorised and must be refunded by the end of the next business day after you report it.',
      },
      {
        q: 'Will a missed buy now pay later payment hurt my credit file?',
        a: 'It can. The major providers now report use and missed payments to UK credit reference agencies. If an entry is factually wrong, you can require correction under Article 16 of the UK GDPR by writing to the credit reference agency and to the provider. Where the entry is disputed rather than plainly wrong, you can add a notice of correction to your file, which lenders see.',
      },
      {
        q: 'Can the Financial Ombudsman look at my complaint?',
        a: 'It depends on the specific product. Some products offered by these firms are regulated and carry ombudsman rights, others are exempt and do not. The reliable way to find out is to ask the provider for a final response letter. A firm issuing a final response on a regulated matter must tell you about your right to refer it to the Financial Ombudsman and must enclose the ombudsman’s leaflet. If no such rights are mentioned, treat the retailer claim and chargeback as your route.',
      },
    ],
    sources: [
      { label: 'FCA: buy now pay later', url: 'https://www.fca.org.uk/consumers/buy-now-pay-later' },
      { label: 'Financial Ombudsman Service', url: 'https://www.financial-ombudsman.org.uk/consumers/how-to-complain' },
      CRA_2015,
      PSR_2017,
    ],
  },

  payments: {
    label: 'payment provider',
    pluralLabel: 'payment providers',
    intro:
      'Payment disputes are governed by the Payment Services Regulations 2017, which are unusually favourable to the consumer: the refund obligation for an unauthorised payment bites by the end of the next business day, and the burden of proving you authorised a payment sits with the provider rather than with you.',
    rights: [
      {
        text: 'An unauthorised payment must be refunded by the end of the next business day after you notify the provider, and the account restored to the state it would have been in. The provider cannot withhold the refund pending its investigation unless it has reasonable grounds to suspect fraud by you.',
        basis: 'Payment Services Regulations 2017, regulation 76',
      },
      {
        text: 'The provider must prove the payment was authenticated, accurately recorded and not affected by a technical failure. Use of your credentials is not, on its own, proof that you authorised it.',
        basis: 'Payment Services Regulations 2017, regulation 75',
      },
      {
        text: 'You can withdraw consent to a recurring payment at any time up to the end of the business day before it is due, by telling either the payee or your payment provider. Your provider must act on it.',
        basis: 'Payment Services Regulations 2017, regulations 67 and 68',
      },
      {
        text: 'Where a payment is not executed, or is executed late or to the wrong account, the provider must refund it without undue delay and trace the payment on request.',
        basis: 'Payment Services Regulations 2017, regulations 91 to 93',
      },
      {
        text: 'A payment services complaint must get a final response within 15 business days, extendable to 35 only in exceptional circumstances, which is much tighter than the usual eight weeks.',
        basis: 'FCA Handbook, DISP 1.6',
      },
    ],
    deadlines: [
      {
        title: 'Next business day — the refund obligation',
        body: 'The single most useful deadline in payments. Report the unauthorised payment and the refund is due by the end of the next business day, not at the end of an investigation.',
      },
      {
        title: '13 months — the outer limit',
        body: 'Notify without undue delay and in any event within 13 months of the debit date, or the right to a refund is lost.',
      },
      {
        title: '15 business days — the final response',
        body: 'Payment services complaints get a final response in 15 business days, extendable to 35 in exceptional cases. Then the Financial Ombudsman is open to you.',
      },
    ],
    letterPoints: [
      'The transaction ID, date, amount and beneficiary for every disputed payment.',
      'The date and method by which you withdrew consent, if this is a recurring payment you had cancelled.',
      'An explicit request that the provider refund under regulation 76 by the end of the next business day, and that it evidence authentication under regulation 75 if it refuses.',
      'A note that you will refer the complaint to the Financial Ombudsman after 15 business days.',
    ],
    escalation: {
      name: 'the Financial Ombudsman Service',
      url: 'https://www.financial-ombudsman.org.uk/consumers/how-to-complain',
      eligibility:
        'After the final response, or after 15 business days for a payment services complaint.',
      timeLimit:
        'Six months from the final response letter, and normally within six years of the event.',
      cost: 'Free to you. The firm pays a case fee.',
      binding: 'Binding on the firm if you accept the decision.',
    },
    caveat:
      'A digital wallet is not always the payment provider. Where a wallet simply passes a card through, the disputed transaction belongs to the card issuer behind it, and the complaint and any chargeback go to your bank rather than to the wallet operator. Check which entity actually took the money before you decide who to write to.',
    faqs: [
      {
        q: 'The provider says it will refund me only after its investigation. Is that allowed?',
        a: 'Generally not. Regulation 76 of the Payment Services Regulations 2017 requires a refund of an unauthorised payment by the end of the business day following notification. The only exception is where the provider has reasonable grounds to suspect you acted fraudulently, and it must notify the FCA if it relies on that. Quote regulation 76 and ask, in writing, whether the provider is asserting that exception and on what grounds.',
      },
      {
        q: 'I cancelled a recurring payment but it went out anyway. Whose problem is it?',
        a: 'Your payment provider’s. Regulations 67 and 68 let you withdraw consent to a recurring payment by telling either the payee or the provider, up to the end of the business day before it is due, and the provider must act on it. A payment taken after consent is withdrawn is unauthorised, so regulation 76 applies and the refund is due by the end of the next business day. You do not need the merchant’s agreement.',
      },
      {
        q: 'My wallet payment went wrong. Do I complain to the wallet or the bank?',
        a: 'Look at the statement. If the transaction appears on your card or bank account, the card issuer or bank is the payment service provider for that transaction and is where the complaint and any chargeback belong. If money left a balance held with the wallet operator itself, the wallet operator is the provider. Writing to the wrong one costs weeks, so check first.',
      },
      {
        q: 'A payment went to the wrong account. Can I get it back?',
        a: 'Tell your provider immediately. Where you gave the correct details and the payment was misexecuted, regulation 91 requires the provider to refund it without undue delay. Where you gave the wrong details yourself, regulation 90 obliges the provider to make reasonable efforts to trace and recover the funds, and to tell you if it cannot so you can pursue the recipient directly.',
      },
    ],
    sources: [
      PSR_2017,
      { label: 'Financial Ombudsman Service', url: 'https://www.financial-ombudsman.org.uk/consumers/how-to-complain' },
      { label: 'FCA Handbook: DISP (complaints)', url: 'https://www.handbook.fca.org.uk/handbook/DISP/' },
    ],
  },
};

/**
 * Map a company onto its guidance bucket.
 *
 * Most map straight off `category`. Three do not, and the difference is
 * material rather than cosmetic:
 *   - Royal Mail and Parcelforce are Ofcom-regulated and have POSTRS,
 *     which no other parcel courier has.
 *   - Uber is licensed by TfL as a private hire operator, which is a
 *     completely different regime to rail.
 *   - broadband-tv shares the broadband rules.
 */
export function getSectorKey(company: { slug: string; category: string; regulator: string }): string {
  if (company.category === 'delivery' && company.regulator === 'Ofcom') return 'postal';
  if (company.regulator === 'TfL') return 'private-hire';
  if (company.category === 'broadband-tv') return 'broadband';
  return company.category;
}

export function getSectorGuidance(company: {
  slug: string;
  category: string;
  regulator: string;
}): SectorGuidance {
  return SECTOR_GUIDANCE[getSectorKey(company)] ?? SECTOR_GUIDANCE.retail;
}
