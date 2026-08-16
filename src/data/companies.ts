export interface Company {
  slug: string;
  name: string;
  category: string;
  regulator: string;
  phone: string | null;

  // ─── Optional per-company complaints facts ────────────────────────────────
  // These exist so /complaints/[company] can render something genuinely
  // company-specific rather than repeating the sector guide across every
  // company in that sector. Every field is optional and the template must
  // degrade gracefully when a field is absent.
  //
  // SOURCING RULE (non-negotiable): a value may only be recorded here if it
  // was read on that company's OWN official website. Never a directory, an
  // aggregator, a review site or an inference. If a company does not publish
  // a fact, the field is simply omitted — an omitted field is correct, a
  // guessed field is a liability. All values below were verified on
  // 16 August 2026; see COMPANY_COMPLAINT_FACTS for the per-entry sources.

  /** Dedicated complaints email address published by the company. */
  complaintsEmail?: string;
  /** The company's own official complaints procedure / code of practice page. */
  complaintsUrl?: string;
  /** Postal address the company publishes specifically for complaints. */
  complaintsPostalAddress?: string;
  /** Response/resolution target in days, only where the company states one. */
  publishedResponseTimeDays?: number;
  /** The specific approved ADR body the company's own page names. */
  adrScheme?: string;
  /** One factual, company-specific detail about their complaints process. */
  companyNote?: string;
}

const BASE_COMPANIES: Company[] = [
  // Energy (12)
  { slug: 'british-gas', name: 'British Gas', category: 'energy', regulator: 'Ofgem', phone: '0333 202 9802' },
  { slug: 'edf-energy', name: 'EDF Energy', category: 'energy', regulator: 'Ofgem', phone: '0333 200 5100' },
  { slug: 'octopus-energy', name: 'Octopus Energy', category: 'energy', regulator: 'Ofgem', phone: '0808 164 1088' },
  { slug: 'ovo-energy', name: 'OVO Energy', category: 'energy', regulator: 'Ofgem', phone: '0330 303 5063' },
  { slug: 'eon', name: 'E.ON', category: 'energy', regulator: 'Ofgem', phone: '0345 052 0000' },
  { slug: 'scottish-power', name: 'ScottishPower', category: 'energy', regulator: 'Ofgem', phone: '0800 027 0072' },
  { slug: 'sse-energy', name: 'SSE Energy', category: 'energy', regulator: 'Ofgem', phone: '0345 026 7265' },
  { slug: 'shell-energy', name: 'Shell Energy', category: 'energy', regulator: 'Ofgem', phone: '0330 094 5800' },
  { slug: 'utilita', name: 'Utilita', category: 'energy', regulator: 'Ofgem', phone: '0345 207 2000' },
  { slug: 'bulb-energy', name: 'Bulb Energy', category: 'energy', regulator: 'Ofgem', phone: null },
  { slug: 'good-energy', name: 'Good Energy', category: 'energy', regulator: 'Ofgem', phone: '0800 254 0000' },
  // Phone verified 16 Aug 2026 on ecotricity.co.uk/support ("give us a call
  // on 0345 555 7 100"), also in the site-wide header. Restores a value
  // corrupted to '01onal 302 302' by a bad find/replace.
  { slug: 'ecotricity', name: 'Ecotricity', category: 'energy', regulator: 'Ofgem', phone: '0345 555 7100' },

  // Water (7)
  { slug: 'thames-water', name: 'Thames Water', category: 'water', regulator: 'Ofwat', phone: '0800 316 9800' },
  { slug: 'severn-trent', name: 'Severn Trent Water', category: 'water', regulator: 'Ofwat', phone: '0345 750 0500' },
  { slug: 'united-utilities', name: 'United Utilities', category: 'water', regulator: 'Ofwat', phone: '0345 672 3723' },
  { slug: 'anglian-water', name: 'Anglian Water', category: 'water', regulator: 'Ofwat', phone: '03457 145 145' },
  { slug: 'southern-water', name: 'Southern Water', category: 'water', regulator: 'Ofwat', phone: '0330 303 0368' },
  { slug: 'yorkshire-water', name: 'Yorkshire Water', category: 'water', regulator: 'Ofwat', phone: '0345 124 2424' },
  { slug: 'wessex-water', name: 'Wessex Water', category: 'water', regulator: 'Ofwat', phone: '0345 600 3 600' },

  // Broadband & TV (12)
  { slug: 'bt-broadband', name: 'BT', category: 'broadband', regulator: 'Ofcom', phone: '0800 800 150' },
  { slug: 'sky', name: 'Sky', category: 'broadband-tv', regulator: 'Ofcom', phone: '0333 759 0000' },
  { slug: 'virgin-media', name: 'Virgin Media', category: 'broadband', regulator: 'Ofcom', phone: '0345 454 1111' },
  { slug: 'talktalk', name: 'TalkTalk', category: 'broadband', regulator: 'Ofcom', phone: '0345 172 0088' },
  { slug: 'plusnet', name: 'Plusnet', category: 'broadband', regulator: 'Ofcom', phone: '0800 432 0200' },
  { slug: 'vodafone-broadband', name: 'Vodafone Broadband', category: 'broadband', regulator: 'Ofcom', phone: '0333 304 0191' },
  { slug: 'community-fibre', name: 'CommunityFibre', category: 'broadband', regulator: 'Ofcom', phone: '0800 082 0770' },
  { slug: 'hyperoptic', name: 'Hyperoptic', category: 'broadband', regulator: 'Ofcom', phone: '0333 332 1111' },
  // Phone verified 16 Aug 2026 on zen.co.uk/contact-us, published in the
  // page's schema.org markup as "telephone": "01706 902001" and labelled
  // Customer Enquiries / Technical Support. Restores a value corrupted to
  // '01onal 237 0100' by a bad find/replace.
  { slug: 'zen-internet', name: 'Zen Internet', category: 'broadband', regulator: 'Ofcom', phone: '01706 902001' },
  { slug: 'now-broadband', name: 'NOW Broadband', category: 'broadband', regulator: 'Ofcom', phone: '0330 332 3050' },
  { slug: 'shell-broadband', name: 'Shell Broadband', category: 'broadband', regulator: 'Ofcom', phone: '0330 094 5800' },
  { slug: 'john-lewis-broadband', name: 'John Lewis Broadband', category: 'broadband', regulator: 'Ofcom', phone: null },

  // Mobile (10)
  { slug: 'vodafone', name: 'Vodafone', category: 'mobile', regulator: 'Ofcom', phone: '0333 304 0191' },
  { slug: 'o2', name: 'O2', category: 'mobile', regulator: 'Ofcom', phone: '0344 809 0202' },
  { slug: 'three', name: 'Three', category: 'mobile', regulator: 'Ofcom', phone: '0333 338 1001' },
  { slug: 'ee', name: 'EE', category: 'mobile', regulator: 'Ofcom', phone: '0800 956 6000' },
  { slug: 'giffgaff', name: 'giffgaff', category: 'mobile', regulator: 'Ofcom', phone: null },
  { slug: 'tesco-mobile', name: 'Tesco Mobile', category: 'mobile', regulator: 'Ofcom', phone: '0345 301 4455' },
  { slug: 'id-mobile', name: 'iD Mobile', category: 'mobile', regulator: 'Ofcom', phone: '0333 003 5363' },
  { slug: 'smarty', name: 'SMARTY', category: 'mobile', regulator: 'Ofcom', phone: null },
  { slug: 'lebara', name: 'Lebara', category: 'mobile', regulator: 'Ofcom', phone: null },
  { slug: 'sky-mobile', name: 'Sky Mobile', category: 'mobile', regulator: 'Ofcom', phone: '0333 759 0000' },

  // Insurance (10)
  { slug: 'admiral', name: 'Admiral', category: 'insurance', regulator: 'FCA', phone: '0333 220 2000' },
  { slug: 'direct-line', name: 'Direct Line', category: 'insurance', regulator: 'FCA', phone: '0345 246 8704' },
  { slug: 'aviva', name: 'Aviva', category: 'insurance', regulator: 'FCA', phone: '0800 051 5260' },
  { slug: 'axa', name: 'AXA', category: 'insurance', regulator: 'FCA', phone: '0330 024 1306' },
  { slug: 'legal-and-general', name: 'Legal & General', category: 'insurance', regulator: 'FCA', phone: '0370 050 0955' },
  { slug: 'hastings-direct', name: 'Hastings Direct', category: 'insurance', regulator: 'FCA', phone: '0333 999 8904' },
  { slug: 'churchill', name: 'Churchill', category: 'insurance', regulator: 'FCA', phone: '0345 877 6680' },
  { slug: 'comparethemarket', name: 'Compare the Market', category: 'insurance', regulator: 'FCA', phone: null },
  { slug: 'moneysupermarket', name: 'MoneySuperMarket', category: 'insurance', regulator: 'FCA', phone: null },
  { slug: 'gocompare', name: 'GoCompare', category: 'insurance', regulator: 'FCA', phone: null },

  // Banking & Finance (12)
  { slug: 'barclays', name: 'Barclays', category: 'banking', regulator: 'FCA', phone: '0345 734 5345' },
  { slug: 'lloyds', name: 'Lloyds Bank', category: 'banking', regulator: 'FCA', phone: '0345 300 0000' },
  { slug: 'hsbc', name: 'HSBC', category: 'banking', regulator: 'FCA', phone: '0345 740 4404' },
  { slug: 'natwest', name: 'NatWest', category: 'banking', regulator: 'FCA', phone: '0345 788 8444' },
  { slug: 'santander', name: 'Santander', category: 'banking', regulator: 'FCA', phone: '0800 171 2171' },
  { slug: 'halifax', name: 'Halifax', category: 'banking', regulator: 'FCA', phone: '0345 720 3040' },
  { slug: 'nationwide', name: 'Nationwide', category: 'banking', regulator: 'FCA', phone: '0800 30 20 10' },
  { slug: 'monzo', name: 'Monzo', category: 'banking', regulator: 'FCA', phone: null },
  { slug: 'starling', name: 'Starling Bank', category: 'banking', regulator: 'FCA', phone: null },
  { slug: 'revolut', name: 'Revolut', category: 'banking', regulator: 'FCA', phone: null },
  { slug: 'tsb', name: 'TSB', category: 'banking', regulator: 'FCA', phone: '0345 975 8758' },
  { slug: 'first-direct', name: 'First Direct', category: 'banking', regulator: 'FCA', phone: '0345 100 100' },

  // Retail (10)
  { slug: 'amazon', name: 'Amazon', category: 'retail', regulator: 'Trading Standards', phone: '0800 279 7234' },
  { slug: 'asos', name: 'ASOS', category: 'retail', regulator: 'Trading Standards', phone: null },
  { slug: 'john-lewis', name: 'John Lewis', category: 'retail', regulator: 'Trading Standards', phone: '0345 604 9049' },
  { slug: 'argos', name: 'Argos', category: 'retail', regulator: 'Trading Standards', phone: '0345 640 3030' },
  { slug: 'currys', name: 'Currys', category: 'retail', regulator: 'Trading Standards', phone: '0344 561 1234' },
  { slug: 'next', name: 'Next', category: 'retail', regulator: 'Trading Standards', phone: '0333 777 8000' },
  { slug: 'marks-and-spencer', name: 'Marks & Spencer', category: 'retail', regulator: 'Trading Standards', phone: '0333 014 8555' },
  { slug: 'ikea', name: 'IKEA', category: 'retail', regulator: 'Trading Standards', phone: '020 3645 0000' },
  { slug: 'very', name: 'Very', category: 'retail', regulator: 'Trading Standards', phone: '0344 822 4444' },
  { slug: 'ebay', name: 'eBay', category: 'retail', regulator: 'Trading Standards', phone: null },

  // Delivery (6)
  { slug: 'evri', name: 'Evri (Hermes)', category: 'delivery', regulator: 'Trading Standards', phone: null },
  { slug: 'dpd', name: 'DPD', category: 'delivery', regulator: 'Trading Standards', phone: '0121 275 0500' },
  { slug: 'royal-mail', name: 'Royal Mail', category: 'delivery', regulator: 'Ofcom', phone: '03457 740 740' },
  { slug: 'yodel', name: 'Yodel', category: 'delivery', regulator: 'Trading Standards', phone: null },
  { slug: 'parcelforce', name: 'Parcelforce', category: 'delivery', regulator: 'Ofcom', phone: '0344 800 4466' },
  { slug: 'amazon-logistics', name: 'Amazon Logistics', category: 'delivery', regulator: 'Trading Standards', phone: null },

  // Streaming (6)
  { slug: 'netflix', name: 'Netflix', category: 'streaming', regulator: 'Trading Standards', phone: null },
  { slug: 'disney-plus', name: 'Disney+', category: 'streaming', regulator: 'Trading Standards', phone: null },
  { slug: 'spotify', name: 'Spotify', category: 'streaming', regulator: 'Trading Standards', phone: null },
  { slug: 'apple-tv', name: 'Apple TV+', category: 'streaming', regulator: 'Trading Standards', phone: null },
  { slug: 'amazon-prime', name: 'Amazon Prime', category: 'streaming', regulator: 'Trading Standards', phone: null },
  { slug: 'now-tv', name: 'NOW TV', category: 'streaming', regulator: 'Trading Standards', phone: null },

  // Gym & Fitness (6)
  { slug: 'pure-gym', name: 'PureGym', category: 'gym', regulator: 'Trading Standards', phone: null },
  { slug: 'the-gym-group', name: 'The Gym Group', category: 'gym', regulator: 'Trading Standards', phone: null },
  { slug: 'david-lloyd', name: 'David Lloyd', category: 'gym', regulator: 'Trading Standards', phone: null },
  { slug: 'nuffield-health', name: 'Nuffield Health', category: 'gym', regulator: 'Trading Standards', phone: '0300 123 6200' },
  { slug: 'anytime-fitness', name: 'Anytime Fitness', category: 'gym', regulator: 'Trading Standards', phone: null },
  { slug: 'bannatyne', name: 'Bannatyne', category: 'gym', regulator: 'Trading Standards', phone: '0344 856 1403' },

  // Transport & Travel (8)
  { slug: 'ryanair', name: 'Ryanair', category: 'airline', regulator: 'CAA', phone: null },
  { slug: 'easyjet', name: 'easyJet', category: 'airline', regulator: 'CAA', phone: '0330 365 5000' },
  { slug: 'british-airways', name: 'British Airways', category: 'airline', regulator: 'CAA', phone: '0344 493 0787' },
  { slug: 'jet2', name: 'Jet2', category: 'airline', regulator: 'CAA', phone: '0333 300 0042' },
  { slug: 'tui', name: 'TUI', category: 'airline', regulator: 'CAA', phone: '0203 451 2688' },
  { slug: 'trainline', name: 'Trainline', category: 'transport', regulator: 'Transport Focus', phone: null },
  { slug: 'tfl', name: 'Transport for London', category: 'transport', regulator: 'Transport Focus', phone: '0343 222 1234' },
  { slug: 'uber', name: 'Uber', category: 'transport', regulator: 'TfL', phone: null },

  // Debt & Finance (4)
  { slug: 'klarna', name: 'Klarna', category: 'bnpl', regulator: 'FCA', phone: null },
  { slug: 'clearpay', name: 'Clearpay', category: 'bnpl', regulator: 'FCA', phone: null },
  { slug: 'paypal', name: 'PayPal', category: 'payments', regulator: 'FCA', phone: '0800 358 7911' },
  { slug: 'apple-pay', name: 'Apple Pay', category: 'payments', regulator: 'FCA', phone: null },
];

/**
 * Per-company complaints facts, keyed by slug.
 *
 * Every value here was read on 16 August 2026 on the company's OWN official
 * website, at the URL recorded in `complaintsUrl` (or, where noted, the code
 * of practice linked from it). Nothing here is inferred, and nothing comes
 * from a directory or aggregator.
 *
 * A missing field means the company does not publish that fact. That is a
 * deliberate, accurate absence — do not fill it in from a third-party source.
 * In particular: UK banks do not publish complaints email addresses, and
 * several telecoms providers route complaints to a web form only.
 */
type CompanyComplaintFacts = Pick<
  Company,
  | 'complaintsEmail'
  | 'complaintsUrl'
  | 'complaintsPostalAddress'
  | 'publishedResponseTimeDays'
  | 'adrScheme'
  | 'companyNote'
>;

const COMPANY_COMPLAINT_FACTS: Record<string, CompanyComplaintFacts> = {
  // ─── Energy ───────────────────────────────────────────────────────────────
  'british-gas': {
    complaintsUrl: 'https://www.britishgas.co.uk/complaints.html',
    complaintsPostalAddress: 'Customer Care Team, PO Box 226, Rotherham, S98 1PB',
    publishedResponseTimeDays: 2,
    adrScheme: 'Energy Ombudsman',
    companyNote:
      'British Gas says it aims to respond within two working days, and that asking to escalate gets you a call back from a complaints manager within the same two working days.',
  },
  'edf-energy': {
    complaintsEmail: 'hello@edfenergy.com',
    complaintsUrl: 'https://www.edfenergy.com/help-support/making-complaint',
    complaintsPostalAddress: 'FREEPOST: EDF Customer Correspondence',
    adrScheme: 'Energy Ombudsman',
    companyNote:
      'EDF commits to single-team ownership: the team you first speak to handles the complaint from start to finish, and emailing back reconnects you to the same specialist.',
  },
  'octopus-energy': {
    complaintsEmail: 'issueresolution@octopus.energy',
    complaintsUrl: 'https://octopus.energy/unhappy/',
    complaintsPostalAddress:
      'Octopus Energy Ltd, UK House, 5th floor, 164-182 Oxford Street, London, W1D 1NN',
    adrScheme: 'Energy Ombudsman',
    companyNote:
      'Octopus publishes a direct escalation route to its chief executive at any stage, and states that at eight weeks it issues a formal deadlock letter you can take straight to the Ombudsman.',
  },
  'ovo-energy': {
    complaintsEmail: 'complaints@ovoenergy.com',
    complaintsUrl: 'https://www.ovoenergy.com/feedback',
    complaintsPostalAddress:
      'OVO Energy Ltd, Floor 5, Crescent, Temple Back, Redcliffe, BS1 6EZ',
    publishedResponseTimeDays: 56,
    adrScheme: 'Energy Ombudsman',
    companyNote:
      'OVO states that about 75% of complaints are resolved by the next working day and that it aims to resolve the rest within eight weeks, via a three-stage escalation ending at its chief executive office.',
  },
  eon: {
    complaintsEmail: 'unhappy@eonnext.com',
    complaintsUrl: 'https://www.eonnext.com/unhappy',
    complaintsPostalAddress: 'Trinity House, 2 Burton Street, Nottingham, NG1 4BX',
    adrScheme: 'Energy Ombudsman',
    companyNote:
      'E.ON Next publishes a second-opinion mailbox for a manager review before the Ombudsman stage. Credit-broking complaints go to the Financial Ombudsman Service instead of the Energy Ombudsman.',
  },
  'scottish-power': {
    complaintsEmail: 'contactus@scottishpower.com',
    complaintsUrl: 'https://www.scottishpower.co.uk/support-centre/complaints',
    complaintsPostalAddress:
      'ScottishPower Customer Services, 320 St Vincent Street, Glasgow, G2 5AD',
    publishedResponseTimeDays: 5,
    adrScheme: 'Energy Ombudsman',
    companyNote:
      'ScottishPower runs a named internal escalation stage, the Director Support Team, reached through a dedicated form, and lets you track an open complaint online.',
  },
  ecotricity: {
    complaintsEmail: 'complaints@ecotricity.co.uk',
    complaintsUrl: 'https://www.ecotricity.co.uk/support/complaints',
    complaintsPostalAddress: 'FAO Complaints, Freepost ECOTRICITY',
    adrScheme: 'Energy Ombudsman',
    companyNote:
      'Ecotricity uses a five-stage process handled by its Customer Champion Team, ending in a "signposting letter" that acts as the deadlock letter for the Ombudsman.',
  },

  // ─── Broadband, TV and mobile ─────────────────────────────────────────────
  'bt-broadband': {
    complaintsEmail: 'consumer-resolutionteam@bt.com',
    complaintsUrl: 'https://www.bt.com/help/contact-bt/complaints',
    complaintsPostalAddress:
      'Customer Service Manager, BT Limited, PO Box 334, Sheffield, S98 1BT',
    publishedResponseTimeDays: 10,
    adrScheme: 'Communications Ombudsman',
    companyNote:
      'BT runs a four-step process with a second escalation that triggers a final complaint review. A closed complaint is reopened if you get back in touch within 28 days, and a deadlock letter is available on request at any time.',
  },
  sky: {
    complaintsUrl: 'https://www.sky.com/help/articles/sky-customer-complaints-code-of-practice',
    complaintsPostalAddress:
      'Customer Complaints, Sky Subscribers Services Ltd, PO Box 43, Livingston, West Lothian, EH54 7DD',
    publishedResponseTimeDays: 10,
    adrScheme: 'CISAS',
    companyNote:
      'Sky sends an automatic written reminder of your CISAS rights once a complaint has been open six weeks, and issues a deadlock notification on request unless further steps remain.',
  },
  'virgin-media': {
    complaintsUrl: 'https://www.virginmedia.com/legal/consumer-complaint-resolution-code-practice',
    complaintsPostalAddress: 'Complaints, Virgin Media, Sunderland, SR43 4AA',
    publishedResponseTimeDays: 28,
    adrScheme: 'CISAS',
    companyNote:
      'Virgin Media aims to respond to a web-form complaint within 7 days and to resolve a written complaint within 28 days. Note that its published code still quotes the old eight-week ADR wait; the Ofcom rule has been six weeks since 8 April 2026.',
  },
  talktalk: {
    complaintsEmail: 'HereToHelp@talktalkplc.com',
    complaintsUrl:
      'https://help-centre.talktalk.co.uk/Manage_account/Make_a_complaint/Raising_a_complaint',
    complaintsPostalAddress: 'TalkTalk Correspondence Dept., PO Box 675, Salford, M5 0NL',
    publishedResponseTimeDays: 10,
    adrScheme: 'CISAS',
    companyNote:
      'If you escalate, TalkTalk says a manager will call back within three working days. The deadlock letter, which it calls a final position response, is issued by its High Level Complaints Team.',
  },
  'vodafone-broadband': {
    complaintsUrl:
      'https://www.vodafone.co.uk/about-us/our-way-of-working/complaints-code-of-practice',
    complaintsPostalAddress:
      'Customer Relations Manager, Vodafone Limited, The Connection, Newbury, Berkshire, RG14 2FN',
    publishedResponseTimeDays: 5,
    adrScheme: 'CISAS',
    companyNote:
      'Vodafone states the shortest resolution target of the major providers, at five days, and recognises three separate triggers for the ADR notification: a final response, a summary resolution, or a deadlock letter.',
  },
  vodafone: {
    complaintsUrl:
      'https://www.vodafone.co.uk/about-us/our-way-of-working/complaints-code-of-practice',
    complaintsPostalAddress:
      'Customer Relations Manager, Vodafone Limited, The Connection, Newbury, Berkshire, RG14 2FN',
    publishedResponseTimeDays: 5,
    adrScheme: 'CISAS',
    companyNote:
      'Vodafone states the shortest resolution target of the major providers, at five days, and recognises three separate triggers for the ADR notification: a final response, a summary resolution, or a deadlock letter.',
  },
  o2: {
    complaintsEmail: 'complaintreviewservice@o2.com',
    complaintsUrl: 'https://www.o2.co.uk/how-to-complain',
    complaintsPostalAddress: 'O2 Complaint Review Service, PO BOX 694, Winchester, SO23 5AP',
    publishedResponseTimeDays: 5,
    adrScheme: 'CISAS',
    companyNote:
      'Complaints O2 cannot resolve at manager level pass to a named team of Resolution Specialists, who issue a final position letter. You then have 12 months to take it to CISAS.',
  },
  three: {
    complaintsUrl: 'https://www.three.co.uk/terms-conditions/code-of-practice/customer-complaints-code',
    complaintsPostalAddress:
      'Three Customer Complaints, Hutchison 3G UK Ltd., PO Box 333, Glasgow, G2 9AG',
    publishedResponseTimeDays: 14,
    adrScheme: 'CISAS',
    companyNote:
      'Three acknowledges non-finance complaints by text message before investigating, and runs two parallel procedures split by whether the complaint concerns device financing.',
  },
  ee: {
    complaintsEmail: 'customer.complaints@ee.co.uk',
    complaintsUrl: 'https://ee.co.uk/regulatory',
    complaintsPostalAddress:
      'EE, Customer Services, 6 Camberwell Way, Sunderland, Tyne & Wear, SR3 3XN',
    adrScheme: 'Communications Ombudsman',
    companyNote:
      'EE treats a complaint as resolved if you do not come back within 28 days of the agreed resolution, and anything raised after that is treated as a brand-new complaint. Its code also signposts ISPA for broadband customers.',
  },

  // ─── Banking ──────────────────────────────────────────────────────────────
  // No UK high-street bank in this set publishes a complaints email address.
  // That absence is verified, not a gap in our research.
  barclays: {
    complaintsUrl: 'https://www.barclays.co.uk/complaints/',
    complaintsPostalAddress: 'Freepost Barclays Customer Relations',
    publishedResponseTimeDays: 56,
    adrScheme: 'Financial Ombudsman Service',
    companyNote:
      'Barclays states there is deliberately no postcode on its Freepost complaints address. Payment-service complaints get a final response in 15 days, extending to 35 at most, and you have six months from the final response to go to the Financial Ombudsman.',
  },
  lloyds: {
    complaintsUrl: 'https://www.lloydsbank.com/help-guidance/how-to-complain.html',
    complaintsPostalAddress: 'Lloyds, Customer Services, Leeds, LS78 1LB',
    publishedResponseTimeDays: 56,
    adrScheme: 'Financial Ombudsman Service',
    companyNote:
      'Lloyds acknowledges within five working days and contacts you again at four weeks if the complaint is still open. Payment and Direct Debit complaints run to a shorter 15-day clock. Business accounts use a separate complaints route.',
  },
  hsbc: {
    complaintsUrl: 'https://www.hsbc.co.uk/help/feedback-and-complaints/',
    complaintsPostalAddress: 'Customer Service Centre, BX8 1HB',
    publishedResponseTimeDays: 56,
    adrScheme: 'Financial Ombudsman Service',
    companyNote:
      'HSBC states it assesses a complaint identically whether you submit it yourself or through a claims management company, and that complaining directly costs you nothing.',
  },
  natwest: {
    complaintsUrl: 'https://www.natwest.com/support-centre/how-to-complain.html',
    complaintsPostalAddress:
      "Customer Relations Manager, 1st Floor, 2 St Philip's Place, Birmingham, B3 2RB",
    publishedResponseTimeDays: 5,
    adrScheme: 'Financial Ombudsman Service',
    companyNote:
      'NatWest publishes separate complaints addresses for credit cards, mortgages and Premier accounts, and warns that it may reply by email, text message or WhatsApp, so check your junk folder.',
  },
  santander: {
    complaintsUrl: 'https://www.santander.co.uk/personal/support/customer-support/how-to-complain',
    complaintsPostalAddress: 'Complaints, Santander UK plc, Sunderland, SR43 4GD',
    publishedResponseTimeDays: 56,
    adrScheme: 'Financial Ombudsman Service',
    companyNote:
      'If Santander resolves a complaint within three business days it still sends written confirmation together with Financial Ombudsman details at that point. It signposts the ICO separately for data-protection complaints.',
  },

  // ─── Airlines ─────────────────────────────────────────────────────────────
  'british-airways': {
    complaintsUrl:
      'https://www.britishairways.com/en-gb/information/help-and-contacts/complaints-and-claims',
    adrScheme: 'CEDR',
    companyNote:
      'British Airways asks you not to open a second case while one is already open, as it lengthens the wait. Referrals to CEDR must be made within 12 months.',
  },
  easyjet: {
    complaintsUrl: 'https://www.easyjet.com/en/help/contact',
    adrScheme: 'AviationADR',
    companyNote:
      'easyJet sets baggage deadlines that bite well before any complaint: seven days to complain about damaged checked baggage and 21 days for delayed baggage. ADR referral is within 12 months of its final response.',
  },
  ryanair: {
    complaintsUrl: 'https://help.ryanair.com/hc/en-gb/articles/12893304387217-Queries-Feedback',
    publishedResponseTimeDays: 10,
    adrScheme: 'AviationADR',
    companyNote:
      'Ryanair publishes a per-jurisdiction ADR table. UK passengers go to AviationADR, while several EU states are routed to bodies that only handle EU261 claims.',
  },
  jet2: {
    complaintsUrl: 'https://www.jet2.com/en/contact-us/returned/complaint',
    complaintsPostalAddress: 'EU261 Team, PO Box 284, Leeds, LS11 1GE',
    publishedResponseTimeDays: 28,
    adrScheme: 'Civil Aviation Authority Passenger Advice and Complaints Team (PACT)',
    companyNote:
      'Jet2 is the exception among major UK airlines: it names no CAA-approved ADR body for UK flights, and instead directs dissatisfied UK passengers to the CAA’s Passenger Advice and Complaints Team. Do not send a Jet2 case to CEDR or AviationADR.',
  },
};

/**
 * The public company registry: the base rows above, merged with any
 * per-company complaints facts we have verified for that slug.
 */
export const COMPANIES: Company[] = BASE_COMPANIES.map((company) => ({
  ...company,
  ...(COMPANY_COMPLAINT_FACTS[company.slug] ?? {}),
}));

export function getCompanyBySlug(slug: string): Company | undefined {
  return COMPANIES.find((c) => c.slug === slug);
}

/** True when we hold at least one verified company-specific complaints fact. */
export function hasCompanyComplaintFacts(company: Company): boolean {
  return Boolean(
    company.complaintsEmail
      || company.complaintsUrl
      || company.complaintsPostalAddress
      || company.publishedResponseTimeDays
      || company.adrScheme
      || company.companyNote,
  );
}

/**
 * Sibling companies in the same sector, excluding the one passed in.
 *
 * Used for the internal-link block at the foot of each company page. A
 * flat set of 104 orphan pages reachable only from the sitemap crawls
 * badly; cross-linking them inside the sector gives each page real
 * internal PageRank and gives the reader a genuinely useful next step.
 */
export function companiesInSameCategory(slug: string): Company[] {
  const company = getCompanyBySlug(slug);
  if (!company) return [];
  return COMPANIES.filter((c) => c.category === company.category && c.slug !== slug);
}

/** Every company slug, in declaration order. Consumed by the sitemap. */
export const COMPANY_SLUGS: string[] = COMPANIES.map((c) => c.slug);

/** Distinct sector categories present in the registry, in declaration order. */
export const COMPANY_CATEGORIES: string[] = Array.from(
  new Set(COMPANIES.map((c) => c.category)),
);
