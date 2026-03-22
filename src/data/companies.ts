export interface Company {
  slug: string;
  name: string;
  category: string;
  regulator: string;
  phone: string | null;
}

export const COMPANIES: Company[] = [
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
  { slug: 'ecotricity', name: 'Ecotricity', category: 'energy', regulator: 'Ofgem', phone: '01onal 302 302' },

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
  { slug: 'zen-internet', name: 'Zen Internet', category: 'broadband', regulator: 'Ofcom', phone: '01onal 237 0100' },
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

export function getCompanyBySlug(slug: string): Company | undefined {
  return COMPANIES.find((c) => c.slug === slug);
}
