/**
 * subcategory-engine.ts
 *
 * Resolves a user's free-text recategorisation label to a canonical Tier-1
 * parent category, persisting the mapping so future bot/UI interactions
 * can skip re-inference.
 *
 * Resolution order:
 *   1. Exact match against canonical category IDs (CATEGORY_IDS)
 *   2. Lookup in user_category_mappings (user's previously stored mappings)
 *   3. Keyword-based inference (static map defined here)
 *   4. Default: 'other'
 *
 * After inference the result is stored in user_category_mappings so step 2
 * hits on subsequent calls.
 */

import { type SupabaseClient } from '@supabase/supabase-js';
import { isValidCategory, normaliseCategory, type Category } from '@/lib/categories';

// ────────────────────────────────────────────────────────────────────────────
// Keyword → parent category map
// Keys are lowercase substrings that, when found in the user's label, imply
// the associated parent category. Order matters: first match wins, so more
// specific terms should come before generic ones.
// ────────────────────────────────────────────────────────────────────────────

const KEYWORD_PARENT_MAP: Array<{ keywords: string[]; parent: Category }> = [
  // Rent
  {
    keywords: ['rent', 'mortgage', 'landlord', 'letting', 'tenancy', 'pcl rent', 'hostel'],
    parent: 'rent',
  },
  // Mortgage (overrides rent for mortgage-specific terms)
  {
    keywords: ['mortgage', 'lendinvest', 'skipton', 'nationwide mort', 'halifax mort'],
    parent: 'mortgage',
  },
  // Groceries
  {
    keywords: [
      'tesco', 'sainsbury', 'waitrose', 'lidl', 'asda', 'morrisons', 'aldi',
      'marks', 'm&s food', 'co-op', 'coop food', 'ocado', 'iceland food',
      'whole foods', 'planet organic',
    ],
    parent: 'groceries',
  },
  // Transport
  {
    keywords: [
      'uber', 'train', 'bus', 'rail', 'tfl', 'petrol', 'fuel', 'parking',
      'pcl', 'trainline', 'national rail', 'crosscountry', 'gwr', 'lner',
      'avanti', 'southeastern', 'thameslink', 'oyster', 'shell fuel', 'bp fuel',
      'esso', 'texaco', 'motorway', 'toll',
    ],
    parent: 'transport',
  },
  // Travel
  {
    keywords: ['flight', 'hotel', 'airbnb', 'holiday', 'easyjet', 'ryanair', 'booking.com', 'expedia', 'hostelworld'],
    parent: 'travel',
  },
  // Streaming
  {
    keywords: ['netflix', 'spotify', 'amazon prime', 'disney', 'sky', 'now tv', 'apple tv', 'youtube premium', 'dazn', 'paramount', 'audible'],
    parent: 'streaming',
  },
  // Health & Fitness
  {
    keywords: ['gym', 'fitness', 'energie', 'puregym', 'david lloyd', 'anytime fitness', 'virgin active', 'peloton', 'yoga', 'physio', 'dentist', 'pharmacy', 'boots health', 'lloyds pharmacy'],
    parent: 'health',
  },
  // Software & Apps
  {
    keywords: ['google', 'microsoft', 'adobe', 'aws', 'notion', 'github', 'dropbox', 'slack', 'zoom', 'figma', 'canva pro', 'openai', 'anthropic', 'cloudflare', 'netlify', 'vercel'],
    parent: 'software',
  },
  // Eating Out
  {
    keywords: ['deliveroo', 'just eat', 'uber eats', 'restaurant', 'cafe', 'coffee', 'starbucks', 'costa', 'pret', 'nandos', 'mcdonald', 'pizza', 'kfc', 'greggs', 'subway', 'wagamama'],
    parent: 'eating_out',
  },
  // Shopping
  {
    keywords: ['amazon', 'ebay', 'asos', 'next', 'argos', 'john lewis', 'currys', 'primark', 'h&m', 'zara', 'topshop', 'boohoo', 'very', 'littlewoods'],
    parent: 'shopping',
  },
  // Energy
  {
    keywords: ['octopus', 'ovo energy', 'british gas', 'edf', 'e.on', 'eon next', 'scottish power', 'sse energy', 'bulb'],
    parent: 'energy',
  },
  // Broadband / Mobile
  {
    keywords: ['vodafone', 'ee mobile', 'three mobile', 'o2 mobile', 'giffgaff', 'sky mobile', 'smarty', 'lebara'],
    parent: 'mobile',
  },
  {
    keywords: ['virgin media', 'bt broadband', 'sky broadband', 'communityfibre', 'plusnet', 'talktalk', 'hyperoptic'],
    parent: 'broadband',
  },
  // Insurance
  {
    keywords: ['insurance', 'admiral', 'aviva', 'direct line', 'comparethemarket', 'churchill', 'nationwide insur'],
    parent: 'insurance',
  },
  // Council Tax
  {
    keywords: ['council tax', 'council ', 'borough', 'local authority'],
    parent: 'council_tax',
  },
  // Family & Childcare
  {
    keywords: ['nursery', 'childcare', 'school', 'child', 'kids'],
    parent: 'family',
  },
  // Pets
  {
    keywords: ['pet', 'vet', 'pets at home', 'pawshake', 'rover', 'petplan'],
    parent: 'pets',
  },
  // Entertainment
  {
    keywords: ['cinema', 'theatre', 'odeon', 'vue cinema', 'cineworld', 'ticketmaster', 'eventbrite', 'concert', 'gaming', 'steam', 'playstation', 'xbox'],
    parent: 'entertainment',
  },
  // Charity
  {
    keywords: ['charity', 'donation', 'oxfam', 'british red cross', 'cancer research', 'nhs charity', 'just giving', 'gofundme'],
    parent: 'charity',
  },
  // Tax
  {
    keywords: ['hmrc', 'self assessment', 'vat', 'tax payment'],
    parent: 'tax',
  },
  // Savings
  {
    keywords: ['savings', 'isa', 'pension', 'investment', 'vanguard', 'hargreaves lansdown', 'nutmeg', 'moneybox'],
    parent: 'savings',
  },
  // Loans & Credit
  {
    keywords: ['loan', 'credit card', 'barclaycard', 'amex', 'lloyds credit', 'debt'],
    parent: 'loans',
  },
  // Fees
  {
    keywords: ['fee', 'charge', 'bank charge', 'overdraft fee', 'late payment'],
    parent: 'fees',
  },
  // Education
  {
    keywords: ['university', 'college', 'course', 'udemy', 'coursera', 'duolingo', 'school fee', 'tuition'],
    parent: 'education',
  },
  // Water
  {
    keywords: ['thames water', 'severn trent', 'united utilities', 'anglian water', 'yorkshire water'],
    parent: 'water',
  },
];

// ────────────────────────────────────────────────────────────────────────────
// Core inference function (no DB access — pure keyword matching)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Infers the canonical Tier-1 parent category from a user-supplied label.
 *
 * Steps:
 *   1. If the label itself is a valid canonical ID, return it directly.
 *   2. Keyword scan through KEYWORD_PARENT_MAP (first match wins).
 *   3. Fall through to normaliseCategory (handles aliases from categories.ts).
 *   4. Default: 'other'.
 */
export function inferParentCategory(label: string): Category {
  if (!label) return 'other';

  const lower = label.toLowerCase().trim();

  // Step 1: already canonical
  if (isValidCategory(lower)) return lower as Category;

  // Step 2: keyword scan
  for (const { keywords, parent } of KEYWORD_PARENT_MAP) {
    if (keywords.some(kw => lower.includes(kw))) return parent;
  }

  // Step 3: alias normalisation (catches "groceries", "transport", etc. via CATEGORY_ALIASES)
  const normalised = normaliseCategory(lower);
  if (normalised !== 'other') return normalised;

  return 'other';
}

// ────────────────────────────────────────────────────────────────────────────
// DB-backed resolution (lookup + store mapping)
// ────────────────────────────────────────────────────────────────────────────

export interface SubcategoryResolution {
  /** The canonical Tier-1 parent category for analytics/budgets. */
  parentCategory: Category;
  /**
   * The label to store in bank_transactions.user_subcategory.
   * null when the user typed a canonical category (no custom label needed).
   */
  subcategoryLabel: string | null;
  /** True if the label is already a canonical category ID. */
  isCanonical: boolean;
}

/**
 * Resolves a user-supplied category label to a parent + optional subcategory.
 * Looks up existing mappings first, then infers and persists on first use.
 *
 * @param supabase  Admin client (service-role).
 * @param userId    User's UUID.
 * @param rawLabel  The raw label the user typed (e.g. "Sainsbury's", "rent").
 */
export async function resolveAndStoreMapping(
  supabase: SupabaseClient,
  userId: string,
  rawLabel: string,
): Promise<SubcategoryResolution> {
  const lower = rawLabel.toLowerCase().trim();

  // Step 1: canonical shortcut — no mapping needed
  if (isValidCategory(lower)) {
    return { parentCategory: lower as Category, subcategoryLabel: null, isCanonical: true };
  }

  // Step 2: look up existing user mapping
  const { data: existing } = await supabase
    .from('user_category_mappings')
    .select('parent_category')
    .eq('user_id', userId)
    .eq('subcategory', lower)
    .maybeSingle();

  if (existing?.parent_category && isValidCategory(existing.parent_category)) {
    return {
      parentCategory: existing.parent_category as Category,
      subcategoryLabel: lower,
      isCanonical: false,
    };
  }

  // Step 3: infer parent + persist mapping
  const parent = inferParentCategory(lower);

  await supabase
    .from('user_category_mappings')
    .upsert(
      { user_id: userId, subcategory: lower, parent_category: parent },
      { onConflict: 'user_id,subcategory' },
    );

  return { parentCategory: parent, subcategoryLabel: lower, isCanonical: false };
}
