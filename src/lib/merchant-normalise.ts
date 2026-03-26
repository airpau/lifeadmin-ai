/**
 * Shared merchant name normalisation used across subscriptions, Money Hub,
 * spending, deals, and chatbot. Ensures consistent display names everywhere.
 *
 * When a new normalisation is learned (e.g. user recategorises a transaction),
 * it should be saved to the merchant_rules table so it persists.
 */

// Known merchant display names (raw bank description pattern -> clean name)
const MERCHANT_MAP: Record<string, string> = {
  // Energy
  'british gas': 'British Gas',
  'eon': 'E.ON',
  'eon next': 'E.ON Next',
  'octopus energy': 'Octopus Energy',
  'ovo energy': 'OVO Energy',
  'ovo ': 'OVO Energy',
  'edf energy': 'EDF Energy',
  'edf ': 'EDF Energy',
  'scottish power': 'Scottish Power',
  'bulb energy': 'Bulb Energy',
  'shell energy': 'Shell Energy',
  'utilita': 'Utilita',

  // Broadband & TV
  'virgin media': 'Virgin Media',
  'bt broadband': 'BT Broadband',
  'bt group': 'BT',
  'sky broadband': 'Sky Broadband',
  'sky digital': 'Sky',
  'sky uk': 'Sky',
  'talktalk': 'TalkTalk',
  'plusnet': 'Plusnet',
  'communityfibre': 'Community Fibre',
  'hyperoptic': 'Hyperoptic',
  'ee broadband': 'EE Broadband',
  'now tv': 'NOW TV',

  // Mobile
  'vodafone': 'Vodafone',
  'ee ': 'EE',
  'three ': 'Three',
  'o2 ': 'O2',
  'giffgaff': 'giffgaff',
  'lebara': 'Lebara',
  'paypal *lebara': 'Lebara',
  'smarty': 'SMARTY',
  'tesco mobile': 'Tesco Mobile',
  'id mobile': 'iD Mobile',
  'voxi': 'VOXI',

  // Streaming
  'netflix': 'Netflix',
  'spotify': 'Spotify',
  'disney plus': 'Disney+',
  'disney+': 'Disney+',
  'amazon prime': 'Amazon Prime',
  'apple': 'Apple',
  'apple.com': 'Apple',
  'youtube': 'YouTube Premium',
  'dazn': 'DAZN',
  'paramount': 'Paramount+',
  'audible': 'Audible',

  // Fitness
  'puregym': 'PureGym',
  'david lloyd': 'David Lloyd',
  'the gym': 'The Gym',
  'fitness first': 'Fitness First',
  'nuffield': 'Nuffield Health',
  'anytime fitness': 'Anytime Fitness',
  'whoop': 'WHOOP',
  'peloton': 'Peloton',
  'strava': 'Strava',

  // Insurance
  'admiral': 'Admiral',
  'aviva': 'Aviva',
  'direct line': 'Direct Line',
  'hastings': 'Hastings Direct',
  'churchill': 'Churchill',
  'axa': 'AXA',
  'zurich': 'Zurich',

  // Groceries
  'tesco': 'Tesco',
  'sainsbury': 'Sainsbury\'s',
  'asda': 'Asda',
  'aldi': 'Aldi',
  'lidl': 'Lidl',
  'morrisons': 'Morrisons',
  'waitrose': 'Waitrose',
  'ocado': 'Ocado',
  'iceland': 'Iceland',
  'co-op': 'Co-op',

  // Eating out
  'deliveroo': 'Deliveroo',
  'just eat': 'Just Eat',
  'uber eats': 'Uber Eats',
  'mcdonald': 'McDonald\'s',
  'starbucks': 'Starbucks',
  'costa': 'Costa Coffee',
  'pret': 'Pret A Manger',
  'greggs': 'Greggs',
  'nando': 'Nando\'s',

  // Finance
  'barclaycard': 'Barclaycard',
  'mbna': 'MBNA',
  'halifax': 'Halifax',
  'natwest': 'NatWest',
  'santander': 'Santander',
  'monzo': 'Monzo',
  'revolut': 'Revolut',
  'starling': 'Starling',

  // Software
  'adobe': 'Adobe',
  'microsoft': 'Microsoft',
  'google': 'Google',
  'openai': 'OpenAI',
  'github': 'GitHub',
  'notion': 'Notion',
  'slack': 'Slack',
  'zoom': 'Zoom',

  // Transport
  'trainline': 'Trainline',
  'tfl': 'TfL',
  'uber': 'Uber',
  'bolt': 'Bolt',

  // Shopping
  'amazon': 'Amazon',
  'ebay': 'eBay',
  'asos': 'ASOS',
  'argos': 'Argos',
  'currys': 'Currys',
  'john lewis': 'John Lewis',

  // Council/Government
  'council': 'Council Tax',
  'hmrc': 'HMRC',
  'dvla': 'DVLA',

  // Water
  'thames water': 'Thames Water',
  'severn trent': 'Severn Trent',
  'united utilities': 'United Utilities',
  'anglian water': 'Anglian Water',
  'southern water': 'Southern Water',
};

// Suffixes to strip before matching
const STRIP_SUFFIXES = /\s+(pymts?|payments?|subs?|subscriptions?|ltd|plc|uk|gbr|direct debit|dd|monthly|annual|online|internet|mobile|broadband)\s*$/gi;
const STRIP_PREFIXES = /^(paypal \*|paypal\*|amzn mktp|amzn |sqr\*|google \*|apple\.com\/bill|izettle\*)/i;

/**
 * Normalise a raw bank transaction description to a clean display name.
 * Uses the shared merchant map and falls back to title-casing.
 */
export function normaliseMerchantName(raw: string): string {
  if (!raw) return 'Unknown';

  let cleaned = raw.trim();

  // Remove prefixes like "PAYPAL *", "AMZN MKTP"
  cleaned = cleaned.replace(STRIP_PREFIXES, '');

  // Remove trailing reference numbers (e.g. "2691337 35314369001")
  cleaned = cleaned.replace(/\s+\d{4,}[\s\d]*$/, '');

  // Remove suffixes
  cleaned = cleaned.replace(STRIP_SUFFIXES, '');
  cleaned = cleaned.trim();

  // Try exact match on cleaned lowercase
  const lower = cleaned.toLowerCase();
  for (const [pattern, displayName] of Object.entries(MERCHANT_MAP)) {
    if (lower === pattern || lower.startsWith(pattern) || lower.includes(pattern)) {
      return displayName;
    }
  }

  // Also try against original raw description
  const rawLower = raw.toLowerCase();
  for (const [pattern, displayName] of Object.entries(MERCHANT_MAP)) {
    if (rawLower.includes(pattern)) {
      return displayName;
    }
  }

  // Fallback: title case the cleaned name
  return cleaned
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase())
    .replace(/\s+/g, ' ')
    .trim() || 'Unknown';
}

/**
 * Unified category mapping used by all spending/budget tools.
 * Single source of truth to prevent mismatches between Money Hub and Spending page.
 */
export const DESCRIPTION_CATEGORIES: Array<{ keywords: string[]; category: string }> = [
  { keywords: ['mortgage', 'lendinvest', 'skipton b.s', 'nationwide b.s'], category: 'mortgage' },
  { keywords: ['natwest loan', 'santander loans', 'novuna', 'ca auto finance', 'tesco bank', 'zopa', 'funding circle'], category: 'loans' },
  { keywords: ['barclaycard', 'mbna', 'halifax credit', 'hsbc bank visa', 'capital one'], category: 'credit' },
  { keywords: ['council', 'winchester city', 'southampton city', 'l.b.'], category: 'council_tax' },
  { keywords: ['british gas', 'eon', 'octopus', 'ovo', 'edf', 'scottish power', 'bulb', 'shell energy', 'utilita'], category: 'energy' },
  { keywords: ['thames water', 'severn trent', 'united utilities', 'anglian water', 'southern water'], category: 'water' },
  { keywords: ['sky broadband', 'virgin media', 'bt broadband', 'communityfibre', 'vodafone broad', 'talktalk', 'plusnet', 'hyperoptic', 'ee broadband'], category: 'broadband' },
  { keywords: ['vodafone', 'ee ', 'three', 'o2 ', 'giffgaff', 'lebara', 'smarty', 'tesco mobile', 'id mobile', 'voxi'], category: 'mobile' },
  { keywords: ['netflix', 'spotify', 'disney', 'amazon prime', 'apple', 'now tv', 'youtube', 'dazn', 'plex', 'patreon', 'paramount', 'audible'], category: 'streaming' },
  { keywords: ['gym', 'puregym', 'david lloyd', 'whoop', 'peloton', 'strava', 'fitness first', 'nuffield', 'anytime fitness'], category: 'fitness' },
  { keywords: ['tesco', 'sainsbury', 'asda', 'aldi', 'lidl', 'morrisons', 'waitrose', 'co-op', 'ocado', 'iceland'], category: 'groceries' },
  { keywords: ['deliveroo', 'just eat', 'uber eats', 'mcdonald', 'starbucks', 'costa', 'pret', 'greggs', 'nando'], category: 'eating_out' },
  { keywords: ['petrol', 'shell ', 'bp ', 'esso', 'fuel', 'texaco'], category: 'fuel' },
  { keywords: ['amazon', 'ebay', 'asos', 'argos', 'currys', 'john lewis'], category: 'shopping' },
  { keywords: ['insurance', 'admiral', 'aviva', 'direct line', 'hastings', 'churchill', 'axa'], category: 'insurance' },
  { keywords: ['dvla', 'trainline', 'tfl', 'uber', 'bolt', 'parking'], category: 'transport' },
  { keywords: ['bet365', 'betfair', 'paddy power', 'william hill', 'ladbrokes', 'coral', 'skybet', 'flutter'], category: 'gambling' },
  { keywords: ['nursery', 'childcare', 'school'], category: 'childcare' },
  { keywords: ['experian', 'adobe', 'microsoft', 'google', 'openai', 'anthropic', 'github', 'notion', 'slack', 'zoom'], category: 'software' },
  { keywords: ['hmrc'], category: 'tax' },
  { keywords: ['solicitor', 'accountant', 'dentist', 'optician'], category: 'professional' },
];

export const BANK_CATEGORY_MAP: Record<string, string> = {
  PURCHASE: 'shopping',
  DEBIT: 'shopping',
  DIRECT_DEBIT: 'bills',
  STANDING_ORDER: 'bills',
  TRANSFER: 'transfers',
  ATM: 'cash',
  CREDIT: 'income',
  FEE: 'fees',
  INTEREST: 'income',
  OTHER: 'other',
};

/**
 * Categorise a transaction by description keywords and bank category.
 */
export function categoriseTransaction(description: string, bankCategory: string): string {
  const d = description.toLowerCase();
  for (const { keywords, category } of DESCRIPTION_CATEGORIES) {
    if (keywords.some(kw => d.includes(kw))) return category;
  }
  return BANK_CATEGORY_MAP[bankCategory] || 'other';
}
