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
  'eon next': 'E.ON Next',
  'e.on': 'E.ON',
  'eon energy': 'E.ON',
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
  'patreon': 'Patreon',
  'plex': 'Plex',
  'plex.tv': 'Plex',

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
  'paratus': 'Paratus AMC (Mortgage)',
  'lendinvest': 'LendInvest (Mortgage)',
  'funding circle': 'Funding Circle',
  'skipton b': 'Skipton Building Society',
  'creation': 'Creation (Finance)',

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
  'testvalley': 'Test Valley Council Tax',
  'winchester city': 'Winchester City Council Tax',
  'lbh': 'LB Hounslow Council Tax',
  'hmrc': 'HMRC',
  'dvla': 'DVLA',

  // Bank fees and charges
  'interest': 'Bank Interest',
  'a/c interest': 'Account Interest',
  'arranged o/d': 'Overdraft Fee',
  'overdraft': 'Overdraft Fee',
  'bank charge': 'Bank Charges',
  'unpaid item': 'Unpaid Item Fee',

  // Services
  'smartrack': 'Smartrack (Vehicle Tracking)',
  'keynest': 'KeyNest',
  'experian': 'Experian',
  'myhousemaid': 'MyHousemaid',
  'quickbooks': 'QuickBooks',
  'intuit': 'QuickBooks',

  // Water
  'thames water': 'Thames Water',
  'severn trent': 'Severn Trent',
  'united utilities': 'United Utilities',
  'anglian water': 'Anglian Water',
  'southern water': 'Southern Water',
};

// Suffixes to strip before matching
const STRIP_SUFFIXES = /\s+(pymts?|payments?|subs?|subscriptions?|ltd|plc|uk|gbr|direct debit|dd|monthly|annual|online|internet|mobile|broadband|membership|membershippat)\s*$/gi;
const STRIP_PREFIXES = /^(paypal \*|paypal\*|patreon\*\s*|amzn mktp|amzn |sqr\*|google \*|apple\.com\/bill|izettle\*|www\.|http[s]?:\/\/)/i;

/**
 * Normalise a raw bank transaction description to a clean display name.
 * Uses the shared merchant map and falls back to title-casing.
 */
export function normaliseMerchantName(raw: string): string {
  if (!raw) return 'Unknown';

  let cleaned = raw.trim();

  // Remove leading card number prefix (e.g. "9384 ", "4239 ")
  cleaned = cleaned.replace(/^\d{4}\s+/, '');

  // Remove date stamps (e.g. "19MAR26", "17/03/26")
  cleaned = cleaned.replace(/\d{2}[A-Z]{3}\d{2}\s*/g, '');
  cleaned = cleaned.replace(/\d{2}\/\d{2}\/\d{2}\s*/g, '');

  // Remove debit indicator "D " at start
  cleaned = cleaned.replace(/^D\s+/, '');

  // Remove prefixes like "PAYPAL *", "AMZN MKTP"
  cleaned = cleaned.replace(STRIP_PREFIXES, '');

  // Remove trailing reference numbers (e.g. "2691337 35314369001")
  cleaned = cleaned.replace(/\s+\d{4,}[\s\d]*$/, '');

  // Remove concatenated reference numbers (e.g. "DISNEYPLUS35314369001")
  cleaned = cleaned.replace(/\d{7,}$/, '');

  // Remove phone numbers (e.g. "08442411653", "03444810800")
  cleaned = cleaned.replace(/\s*0\d{9,10}\s*$/, '');

  // Remove tracking/reference suffixes (e.g. "-A15EYP", "T-A", "PA")
  cleaned = cleaned.replace(/\s+PA\s*$/, '');
  cleaned = cleaned.replace(/\s+T-A\s*$/, '');
  cleaned = cleaned.replace(/-[A-Z0-9]{4,}$/, '');

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
  { keywords: ['mortgage', 'mtg', 'lendinvest', 'skipton', 'nationwide', 'halifax', 'santander mtg', 'barclays mtg', 'natwest mtg', 'hsbc mtg', 'virgin mtg', 'coventry b.s', 'yorkshire b.s', 'kensington', 'bm solutions', 'accord mort', 'leeds b.s', 'leeds bs', 'principality b.s', 'west brom b.s', 'fleet mort', 'paragon mort', 'keystone mort', 'paratus', 'pepper money', 'together money', 'shawbrook', 'precise mort', 'the mortgage lender', 'foundation home', 'molo', 'landbay', 'atom bank mort'], category: 'mortgage' },
  { keywords: ['natwest loan', 'santander loans', 'novuna', 'ca auto finance', 'tesco bank', 'zopa', 'funding circle', 'bbls', 'bounce back', 'cbils', 'recovery loan', 'iwoca', 'esme loans', 'fleximize', 'capital on tap', 'tide capital', 'starling loan', 'creation.co', 'creation '], category: 'loans' },
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
  { keywords: ['experian', 'equifax', 'transunion', 'clearscore'], category: 'credit_monitoring' },
  { keywords: ['rac ', 'aa break', 'motoring', 'smartrack'], category: 'motoring' },
  { keywords: ['keynest', 'property'], category: 'property_management' },
  { keywords: ['adobe', 'microsoft', 'google', 'openai', 'anthropic', 'github', 'notion', 'slack', 'zoom'], category: 'software' },
  { keywords: ['hmrc'], category: 'tax' },
  { keywords: ['interest', 'a/c interest', 'arranged o/d', 'overdraft', 'bank charge', 'bank fee', 'unpaid item'], category: 'fees' },
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
 * This is the hardcoded-only version. For learning-aware categorisation,
 * use categoriseWithLearning() or categoriseWithLearningSync() from
 * @/lib/learning-engine instead.
 */
export function categoriseTransaction(description: string, bankCategory: string, amount?: number): string {
  const d = description.toLowerCase();
  const bc = bankCategory ? bankCategory.toLowerCase() : '';

  // Handle obvious OpenBanking bank categories first to ensure high precision
  if (bc.includes('loan') && bc.includes('mortgage')) return 'mortgage';
  if (bc === 'mortgage') return 'mortgage';
  
  // Keyword mapping from our manual rules
  for (const { keywords, category } of DESCRIPTION_CATEGORIES) {
    if (keywords.some(kw => d.includes(kw))) return category;
  }

  // Amount-based intelligence: high-value direct debits/standing orders
  // are more likely to be mortgages or loans than generic "bills"
  const absAmount = amount ? Math.abs(amount) : 0;
  if (absAmount >= 500 && (bc === 'direct_debit' || bc === 'standing_order' || bc === 'debit')) {
    // Check for financial company suffixes that suggest mortgage/loan
    if (d.includes('amc') || d.includes('mortgage') || d.includes('b.s') || d.includes('bs ') ||
        d.includes('building soc') || d.includes('home loans')) {
      return 'mortgage';
    }
    if (d.includes('finance') || d.includes('loan') || d.includes('lending') || d.includes('credit')) {
      return 'loans';
    }
  }
  
  // Standard BANK_CATEGORY mapping
  if (bankCategory && BANK_CATEGORY_MAP[bankCategory.toUpperCase()]) {
    return BANK_CATEGORY_MAP[bankCategory.toUpperCase()];
  }
  
  // Fallbacks based on raw string
  if (bc.includes('transfer')) return 'transfers';
  if (bc.includes('loan')) return 'loans';

  return 'other';
}
