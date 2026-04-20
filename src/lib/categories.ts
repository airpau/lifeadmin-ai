/**
 * categories.ts — Single source of truth for Paybacker's canonical category taxonomy.
 *
 * TWO-TIER STRUCTURE:
 *   Tier 1: Fixed top-level categories (this file) — same for all users, used for
 *           cross-user spend analysis, budgets, and RPCs.
 *   Tier 2: User-created subcategories — stored per-user in `user_category_custom`
 *           table, always linked to a parent category ID from this list.
 *
 * Rules:
 *   - Never add a new category without also writing a migration to update
 *     auto_categorise_transactions and detectFallbackSpendingCategory.
 *   - `income` and `transfers` are SYSTEM categories — managed by the classification
 *     pipeline. Do not offer them in user-facing recategorisation flows.
 *   - Budget RPCs and spend analysis ALWAYS aggregate at Tier 1 (parent category).
 *     Subcategory drill-down is for personal organisation only.
 */

// ────────────────────────────────────────────────────────────────────────────
// Canonical category definitions
// ────────────────────────────────────────────────────────────────────────────

export const CATEGORIES = [
  // ── Home & Bills ────────────────────────────────────────────────────────
  { id: 'mortgage',      label: 'Mortgage',              emoji: '🏠', group: 'Home & Bills' },
  { id: 'housing',       label: 'Rent & Housing',         emoji: '🔑', group: 'Home & Bills' },
  { id: 'council_tax',   label: 'Council Tax',            emoji: '🏛️', group: 'Home & Bills' },
  { id: 'energy',        label: 'Energy',                 emoji: '⚡', group: 'Home & Bills' },
  { id: 'water',         label: 'Water',                  emoji: '💧', group: 'Home & Bills' },
  { id: 'broadband',     label: 'Broadband',              emoji: '📡', group: 'Home & Bills' },
  { id: 'mobile',        label: 'Mobile',                 emoji: '📱', group: 'Home & Bills' },
  { id: 'bills',         label: 'Bills & Utilities',      emoji: '📄', group: 'Home & Bills' },

  // ── Food & Drink ─────────────────────────────────────────────────────────
  { id: 'groceries',     label: 'Groceries',              emoji: '🛒', group: 'Food & Drink' },
  { id: 'eating_out',    label: 'Eating Out',             emoji: '🍽️', group: 'Food & Drink' },

  // ── Transport ───────────────────────────────────────────────────────────
  { id: 'transport',     label: 'Transport',              emoji: '🚗', group: 'Transport' },
  { id: 'travel',        label: 'Travel & Holidays',      emoji: '✈️', group: 'Transport' },

  // ── Shopping & Lifestyle ─────────────────────────────────────────────────
  { id: 'shopping',      label: 'Shopping',               emoji: '🛍️', group: 'Shopping & Lifestyle' },
  { id: 'entertainment', label: 'Entertainment',          emoji: '🎬', group: 'Shopping & Lifestyle' },
  { id: 'streaming',     label: 'Streaming',              emoji: '📺', group: 'Shopping & Lifestyle' },
  { id: 'software',      label: 'Software & Apps',        emoji: '💻', group: 'Shopping & Lifestyle' },
  { id: 'health',        label: 'Health & Fitness',       emoji: '🏥', group: 'Shopping & Lifestyle' },
  { id: 'personal_care', label: 'Personal Care',          emoji: '💅', group: 'Shopping & Lifestyle' },

  // ── Finance ─────────────────────────────────────────────────────────────
  { id: 'insurance',     label: 'Insurance',              emoji: '🛡️', group: 'Finance' },
  { id: 'loans',         label: 'Loans & Credit',         emoji: '💳', group: 'Finance' },
  { id: 'savings',       label: 'Savings & Investments',  emoji: '💰', group: 'Finance' },
  { id: 'fees',          label: 'Fees & Charges',         emoji: '🏦', group: 'Finance' },
  { id: 'tax',           label: 'Tax & Government',       emoji: '📊', group: 'Finance' },

  // ── Personal ────────────────────────────────────────────────────────────
  { id: 'education',     label: 'Education',              emoji: '📚', group: 'Personal' },
  { id: 'family',        label: 'Family & Childcare',     emoji: '👶', group: 'Personal' },
  { id: 'pets',          label: 'Pets',                   emoji: '🐾', group: 'Personal' },
  { id: 'charity',       label: 'Charity & Donations',    emoji: '❤️', group: 'Personal' },
  { id: 'gambling',      label: 'Gambling',               emoji: '🎰', group: 'Personal' },

  // ── System (not user-selectable in recategorisation flows) ───────────────
  { id: 'income',        label: 'Income',                 emoji: '💵', group: 'System' },
  { id: 'transfers',     label: 'Transfers',              emoji: '🔄', group: 'System' },

  // ── Catch-all ────────────────────────────────────────────────────────────
  { id: 'other',         label: 'Other',                  emoji: '📦', group: 'Other' },
] as const;

// ────────────────────────────────────────────────────────────────────────────
// Derived types & constants
// ────────────────────────────────────────────────────────────────────────────

export type Category = (typeof CATEGORIES)[number]['id'];

/** All canonical category IDs — used for DB CHECK constraints and validation. */
export const CATEGORY_IDS: ReadonlyArray<Category> = CATEGORIES.map(c => c.id);

/** Human-readable label for each category. */
export const CATEGORY_LABELS: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map(c => [c.id, c.label]),
) as Record<Category, string>;

/** Emoji for each category. */
export const CATEGORY_EMOJI: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map(c => [c.id, c.emoji]),
) as Record<Category, string>;

/** Group name for each category. */
export const CATEGORY_GROUPS: Record<Category, string> = Object.fromEntries(
  CATEGORIES.map(c => [c.id, c.group]),
) as Record<Category, string>;

/**
 * Categories the user can manually select.
 * Excludes `income` and `transfers` — those are managed by the
 * classification pipeline and should not appear in recategorisation UIs.
 */
export const USER_SELECTABLE_CATEGORIES = CATEGORIES.filter(
  c => c.group !== 'System',
);

export const USER_SELECTABLE_IDS: ReadonlyArray<Category> = USER_SELECTABLE_CATEGORIES.map(
  c => c.id,
);

/**
 * Categories grouped by their group name, in display order.
 * Used for building Telegram inline keyboards.
 */
export const CATEGORIES_BY_GROUP: Record<string, typeof USER_SELECTABLE_CATEGORIES> =
  USER_SELECTABLE_CATEGORIES.reduce(
    (acc, cat) => {
      const g = cat.group;
      if (!acc[g]) acc[g] = [];
      acc[g].push(cat);
      return acc;
    },
    {} as Record<string, typeof USER_SELECTABLE_CATEGORIES>,
  );

// ────────────────────────────────────────────────────────────────────────────
// Alias / migration mapping — maps legacy messy values → canonical IDs.
// Used in the DB migration and the classification normaliser.
// ────────────────────────────────────────────────────────────────────────────

export const CATEGORY_ALIASES: Record<string, Category> = {
  // Food aliases
  food:              'groceries',
  // Transport aliases
  fuel:              'transport',
  motoring:          'transport',
  parking:           'transport',
  // Health aliases
  fitness:           'health',
  healthcare:        'health',
  // Finance aliases
  loan:              'loans',
  fee:               'fees',
  // Utility aliases
  utility:           'bills',
  // Entertainment aliases
  music:             'entertainment',
  gaming:            'entertainment',
  storage:           'software',
  // Housing aliases
  property_management: 'housing',
  rent:              'housing',
  // Security → other (too vague without further context)
  security:          'other',
  // Professional services → fees
  professional:      'fees',
  // Cash withdrawals
  cash:              'other',
  // transport (existing, keep)
  transport:         'transport',
  // transfers / income — keep as-is (already canonical)
  transfers:         'transfers',
  income:            'income',
};

// ────────────────────────────────────────────────────────────────────────────
// TrueLayer / Yapily merchant_category → canonical mapping
// ────────────────────────────────────────────────────────────────────────────

/**
 * Maps the raw `category` value sent by TrueLayer / Yapily in the transaction
 * payload to a canonical Paybacker category ID.
 *
 * TrueLayer uses upper-case strings like "BILLS", "EATING_OUT", "TRANSPORT".
 * Yapily uses similar strings. Any unrecognised value falls through to 'other'.
 */
export const TRUELAYER_CATEGORY_MAP: Record<string, Category> = {
  // TrueLayer categories (upper-case)
  BILLS:            'bills',
  CASH:             'other',
  CHARITY:          'charity',
  EATING_OUT:       'eating_out',
  ENTERTAINMENT:    'entertainment',
  EXPENSES:         'fees',
  FAMILY:           'family',
  GENERAL:          'other',
  GROCERIES:        'groceries',
  HOLIDAYS:         'travel',
  HOME:             'housing',
  INCOME:           'income',
  INSURANCE:        'insurance',
  PERSONAL_CARE:    'personal_care',
  PURCHASE:         'shopping',
  SAVINGS:          'savings',
  SHOPPING:         'shopping',
  TRANSPORT:        'transport',
  TRAVEL:           'travel',
  TRANSFER:         'transfers',
  CREDIT:           'income',
  INTEREST:         'income',
  // Yapily categories (similar but may vary)
  Bills:            'bills',
  'Eating Out':     'eating_out',
  Entertainment:    'entertainment',
  Expenses:         'fees',
  Groceries:        'groceries',
  Holidays:         'travel',
  Home:             'housing',
  Income:           'income',
  Insurance:        'insurance',
  'Personal Care':  'personal_care',
  Shopping:         'shopping',
  Transport:        'transport',
  Travel:           'travel',
  Transfer:         'transfers',
  Savings:          'savings',
  Charity:          'charity',
  Family:           'family',
  General:          'other',
};

// ────────────────────────────────────────────────────────────────────────────
// Helper functions
// ────────────────────────────────────────────────────────────────────────────

/** Returns true if the value is a valid canonical category ID. */
export function isValidCategory(value: unknown): value is Category {
  return typeof value === 'string' && (CATEGORY_IDS as ReadonlyArray<string>).includes(value);
}

/**
 * Normalises a raw string to a canonical category ID.
 * Resolves aliases, lowercases, and falls through to 'other'.
 */
export function normaliseCategory(raw: string | null | undefined): Category {
  if (!raw) return 'other';
  const key = raw.toLowerCase().trim();
  if (isValidCategory(key)) return key;
  const aliased = CATEGORY_ALIASES[key];
  if (aliased) return aliased;
  return 'other';
}

/**
 * Maps a TrueLayer / Yapily raw `category` field to a canonical category ID.
 */
export function mapBankCategory(raw: string | null | undefined): Category {
  if (!raw) return 'other';
  const mapped = TRUELAYER_CATEGORY_MAP[raw.trim()] ?? TRUELAYER_CATEGORY_MAP[raw.trim().toUpperCase()];
  if (mapped) return mapped;
  return normaliseCategory(raw);
}

/**
 * Returns a compact, flat list of user-selectable category IDs as a string
 * suitable for inclusion in AI system prompts.
 * e.g. "mortgage, housing, council_tax, energy, ..."
 */
export function categoryListForPrompt(): string {
  return USER_SELECTABLE_IDS.join(', ');
}

/**
 * Returns a formatted multi-line list of categories for AI prompts.
 * Groups by category group.
 */
export function categoryListFormatted(): string {
  const lines: string[] = [];
  for (const [group, cats] of Object.entries(CATEGORIES_BY_GROUP)) {
    lines.push(`${group}: ${cats.map(c => `${c.emoji} ${c.id} (${c.label})`).join(' | ')}`);
  }
  return lines.join('\n');
}
