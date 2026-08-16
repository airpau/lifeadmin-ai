import {
  Wifi, Landmark, UtensilsCrossed, Shield, Banknote, Smartphone, Home,
  Tv, Monitor, Car, Zap, MoreHorizontal, Dumbbell, Music, Gamepad2,
  Cloud, Heart, Lock, HandHeart, GraduationCap, PawPrint, ParkingCircle,
  Plane, Dice5, Receipt, CircleDollarSign, type LucideIcon, Droplets,
  ShoppingCart, Coffee, ShoppingBag, Newspaper, CreditCard, Baby,
  Building2, Fuel, Briefcase, ArrowLeftRight, Wallet, HandCoins,
} from 'lucide-react';

interface CategoryConfig {
  label: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  /**
   * `false` hides the key from SORTED_CATEGORIES (the recategorise
   * pickers). Bank-ledger buckets like Income / Transfers / Cash are real
   * values that must RENDER correctly, but they are never a sensible
   * thing for a user to pick as a subscription category.
   */
  pickable?: boolean;
}

// ─── Alias normalisation (local copy — deliberate) ────────────────────
// This mirrors `SPENDING_CATEGORY_ALIASES` in
// src/lib/money-hub-classification.ts. It is duplicated rather than
// imported because money-hub-classification.ts imports learning-engine.ts,
// which imports @supabase/supabase-js — pulling that into this leaf module
// would drag the Supabase client into every client bundle that renders a
// category pill. Keep the two maps in lockstep: every VALUE here must be a
// key in CATEGORY_CONFIG below.
const CATEGORY_KEY_ALIASES: Record<string, string> = {
  fees: 'fee',
  loans: 'loan',
  utilities: 'utility',
  bill_payment: 'bills',
  billpayment: 'bills',
  'bill-payment': 'bills',
  dining: 'eating_out',
  restaurants: 'eating_out',
  supermarkets: 'groceries',
  supermarket: 'groceries',
};

/**
 * Resolve any raw category string a writer may have persisted onto the
 * canonical CATEGORY_CONFIG key. Applied at RENDER time by every getter
 * below, so `fees`/`loans`/`utilities` rows written before the aliases
 * existed still render with the right label, icon and colour.
 */
export function normalizeCategoryKey(value: string | null | undefined): string {
  const key = String(value ?? '').toLowerCase().trim();
  if (!key) return '';
  return CATEGORY_KEY_ALIASES[key] || key;
}

// Every category returned anywhere in the backend (detectors, classifier
// fallbacks, user overrides, API routes) MUST have a key in this map —
// otherwise the UI falls through to the generic title-case fallback and
// the user sees inconsistent labels ("Groceries" from one source,
// "groceries" from another).
//
// PALETTE: light theme only. Every consuming surface (the subscriptions
// cards, the Money Hub payments list) is white — `text-*-700` on
// `bg-*-100`/`bg-*-50`. The previous 300/400-level-on-10%-opacity palette
// was built for the retired navy theme and rendered near-invisible.
export const CATEGORY_CONFIG: Record<string, CategoryConfig> = {
  broadband: { label: 'Broadband', icon: Wifi, color: 'text-blue-700', bgColor: 'bg-blue-100' },
  council_tax: { label: 'Council Tax', icon: Landmark, color: 'text-amber-700', bgColor: 'bg-amber-100' },
  food: { label: 'Food & Drink', icon: UtensilsCrossed, color: 'text-orange-700', bgColor: 'bg-orange-100' },
  // Narrower Emma-style food splits — keep `food` too for legacy data.
  groceries: { label: 'Groceries', icon: ShoppingCart, color: 'text-orange-700', bgColor: 'bg-orange-100' },
  eating_out: { label: 'Eating Out', icon: Coffee, color: 'text-orange-700', bgColor: 'bg-orange-50' },
  insurance: { label: 'Insurance', icon: Shield, color: 'text-cyan-700', bgColor: 'bg-cyan-100' },
  // `loans` (plural, emitted by merchant-normalise) resolves here via
  // CATEGORY_KEY_ALIASES rather than a duplicate entry — a second entry
  // put "Loans" in the picker twice.
  loan: { label: 'Loans', icon: Banknote, color: 'text-red-700', bgColor: 'bg-red-100' },
  mobile: { label: 'Mobile', icon: Smartphone, color: 'text-violet-700', bgColor: 'bg-violet-100' },
  mortgage: { label: 'Mortgage', icon: Home, color: 'text-emerald-700', bgColor: 'bg-emerald-100' },
  streaming: { label: 'Streaming', icon: Tv, color: 'text-purple-700', bgColor: 'bg-purple-100' },
  software: { label: 'Software', icon: Monitor, color: 'text-indigo-700', bgColor: 'bg-indigo-100' },
  transport: { label: 'Transport', icon: Car, color: 'text-yellow-700', bgColor: 'bg-yellow-100' },
  utility: { label: 'Utilities', icon: Zap, color: 'text-green-700', bgColor: 'bg-green-100' },
  // Energy is the detector's canonical output for gas/electricity
  // providers — historically it was aliased to "utility" but the alias
  // only normalised at write time, leaving bare `energy` strings in
  // some DB rows that then hit the generic fallback. Give it its own
  // entry so it always renders as "Energy" with the lightning icon.
  energy: { label: 'Energy', icon: Zap, color: 'text-green-700', bgColor: 'bg-green-50' },
  other: { label: 'Other', icon: MoreHorizontal, color: 'text-slate-700', bgColor: 'bg-slate-100' },
  fitness: { label: 'Fitness & Gym', icon: Dumbbell, color: 'text-rose-700', bgColor: 'bg-rose-100' },
  music: { label: 'Music', icon: Music, color: 'text-pink-700', bgColor: 'bg-pink-100' },
  gaming: { label: 'Gaming', icon: Gamepad2, color: 'text-fuchsia-700', bgColor: 'bg-fuchsia-100' },
  storage: { label: 'Cloud Storage', icon: Cloud, color: 'text-sky-700', bgColor: 'bg-sky-100' },
  healthcare: { label: 'Healthcare', icon: Heart, color: 'text-red-700', bgColor: 'bg-red-50' },
  security: { label: 'Security', icon: Lock, color: 'text-zinc-700', bgColor: 'bg-zinc-100' },
  charity: { label: 'Charity', icon: HandHeart, color: 'text-teal-700', bgColor: 'bg-teal-100' },
  education: { label: 'Education', icon: GraduationCap, color: 'text-blue-700', bgColor: 'bg-blue-50' },
  pets: { label: 'Pets', icon: PawPrint, color: 'text-amber-700', bgColor: 'bg-amber-50' },
  parking: { label: 'Parking', icon: ParkingCircle, color: 'text-gray-700', bgColor: 'bg-gray-100' },
  travel: { label: 'Travel', icon: Plane, color: 'text-sky-700', bgColor: 'bg-sky-50' },
  gambling: { label: 'Gambling', icon: Dice5, color: 'text-yellow-700', bgColor: 'bg-yellow-50' },
  bills: { label: 'Bills', icon: Receipt, color: 'text-orange-700', bgColor: 'bg-orange-50' },
  fee: { label: 'Fees', icon: CircleDollarSign, color: 'text-neutral-700', bgColor: 'bg-neutral-100' },
  water: { label: 'Water', icon: Droplets, color: 'text-cyan-700', bgColor: 'bg-cyan-50' },
  motoring: { label: 'Motoring', icon: Car, color: 'text-yellow-700', bgColor: 'bg-yellow-50' },
  property_management: { label: 'Property Management', icon: Home, color: 'text-indigo-700', bgColor: 'bg-indigo-100' },
  credit_monitoring: { label: 'Credit Monitoring', icon: Shield, color: 'text-emerald-700', bgColor: 'bg-emerald-50' },
  tax: { label: 'Tax', icon: Landmark, color: 'text-red-800', bgColor: 'bg-red-50' },
  rent: { label: 'Rent', icon: Home, color: 'text-lime-700', bgColor: 'bg-lime-100' },
  // Generic shopping bucket emitted by the fallback detector for Amazon,
  // eBay, Argos etc. Config previously lacked it, so those transactions
  // all rendered with a greyed-out "Shopping" from the generic fallback.
  shopping: { label: 'Shopping', icon: ShoppingBag, color: 'text-pink-700', bgColor: 'bg-pink-50' },

  // ── Keys emitted by real writers that had no entry until 2026-08-16.
  // Each of these rendered as a grey blob with the generic "…" icon.
  news: { label: 'News & Media', icon: Newspaper, color: 'text-stone-700', bgColor: 'bg-stone-100' },
  credit_card: { label: 'Credit Card', icon: CreditCard, color: 'text-red-700', bgColor: 'bg-red-50' },
  childcare: { label: 'Childcare', icon: Baby, color: 'text-pink-700', bgColor: 'bg-pink-100' },
  business_rates: { label: 'Business Rates', icon: Building2, color: 'text-amber-800', bgColor: 'bg-amber-50' },
  fuel: { label: 'Fuel', icon: Fuel, color: 'text-orange-800', bgColor: 'bg-orange-50' },
  professional: { label: 'Professional Services', icon: Briefcase, color: 'text-indigo-700', bgColor: 'bg-indigo-50' },
  // Bank-ledger buckets. They must render, but they are not sensible
  // picks in a "what kind of subscription is this?" dropdown.
  transfers: { label: 'Transfers', icon: ArrowLeftRight, color: 'text-blue-700', bgColor: 'bg-blue-50', pickable: false },
  cash: { label: 'Cash', icon: Wallet, color: 'text-lime-700', bgColor: 'bg-lime-50', pickable: false },
  credit: { label: 'Credit', icon: HandCoins, color: 'text-emerald-700', bgColor: 'bg-emerald-50', pickable: false },
  income: { label: 'Income', icon: HandCoins, color: 'text-emerald-800', bgColor: 'bg-emerald-100', pickable: false },
};

export function getCategoryLabel(category: string): string {
  const key = normalizeCategoryKey(category);
  if (CATEGORY_CONFIG[key]) return CATEGORY_CONFIG[key].label;
  if (!key) return 'Uncategorised';
  return key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
}

export function getCategoryColor(category: string): string {
  return CATEGORY_CONFIG[normalizeCategoryKey(category)]?.color || 'text-slate-700';
}

export function getCategoryBgColor(category: string): string {
  return CATEGORY_CONFIG[normalizeCategoryKey(category)]?.bgColor || 'bg-slate-100';
}

export function getCategoryIcon(category: string): LucideIcon {
  return CATEGORY_CONFIG[normalizeCategoryKey(category)]?.icon || MoreHorizontal;
}

/** All user-pickable categories sorted alphabetically by label, for dropdowns */
export const SORTED_CATEGORIES = Object.entries(CATEGORY_CONFIG)
  .filter(([, config]) => config.pickable !== false)
  .sort(([, a], [, b]) => a.label.localeCompare(b.label))
  .map(([key, config]) => ({ value: key, label: config.label }));

/** Consolidated filter groups for the subscriptions page filter bar */
export interface FilterGroup {
  value: string;
  label: string;
  icon: LucideIcon;
  color: string;
  bgColor: string;
  /** Category values that belong to this group. Empty array = catch-all (Other). */
  matches: string[];
}

// Chip membership must cover EVERY key in CATEGORY_CONFIG — a key that
// belongs to no named chip and isn't caught by "Other" is unreachable by
// any filter, which is what hid software / transport / shopping /
// groceries / rent / travel / pets / parking etc. before 2026-08-16.
// `matches` entries are canonical keys; the raw value on a subscription is
// normalised through `normalizeCategoryKey` before comparison, so
// `loan`/`loans`, `fee`/`fees` and `utility`/`utilities` can no longer land
// in different buckets depending on which detector wrote the row.
export const SUBSCRIPTION_FILTER_CATEGORIES: FilterGroup[] = [
  { value: 'energy', label: 'Energy & Water', icon: Zap, color: 'text-green-700', bgColor: 'bg-green-100', matches: ['energy', 'utility', 'water'] },
  { value: 'broadband_tv', label: 'Broadband & TV', icon: Wifi, color: 'text-blue-700', bgColor: 'bg-blue-100', matches: ['broadband', 'tv'] },
  { value: 'mobile', label: 'Mobile', icon: Smartphone, color: 'text-violet-700', bgColor: 'bg-violet-100', matches: ['mobile'] },
  { value: 'insurance', label: 'Insurance', icon: Shield, color: 'text-cyan-700', bgColor: 'bg-cyan-100', matches: ['insurance'] },
  { value: 'finance', label: 'Finance', icon: Banknote, color: 'text-red-700', bgColor: 'bg-red-100', matches: ['mortgage', 'loan', 'credit_card', 'credit_monitoring', 'fee', 'tax', 'bills', 'credit', 'income', 'transfers', 'cash'] },
  { value: 'home', label: 'Home', icon: Home, color: 'text-lime-700', bgColor: 'bg-lime-100', matches: ['rent', 'property_management', 'council_tax', 'business_rates', 'security'] },
  { value: 'entertainment', label: 'Entertainment', icon: Tv, color: 'text-purple-700', bgColor: 'bg-purple-100', matches: ['streaming', 'gaming', 'music', 'gambling', 'news'] },
  { value: 'tech', label: 'Software & Tech', icon: Monitor, color: 'text-indigo-700', bgColor: 'bg-indigo-100', matches: ['software', 'storage'] },
  { value: 'health_fitness', label: 'Health & Fitness', icon: Dumbbell, color: 'text-rose-700', bgColor: 'bg-rose-100', matches: ['fitness', 'healthcare', 'childcare'] },
  { value: 'food_shopping', label: 'Food & Shopping', icon: ShoppingCart, color: 'text-orange-700', bgColor: 'bg-orange-100', matches: ['food', 'groceries', 'eating_out', 'shopping'] },
  { value: 'travel_motoring', label: 'Travel & Motoring', icon: Car, color: 'text-yellow-700', bgColor: 'bg-yellow-100', matches: ['transport', 'travel', 'motoring', 'parking', 'fuel'] },
  { value: 'other', label: 'Other', icon: MoreHorizontal, color: 'text-slate-700', bgColor: 'bg-slate-100', matches: [] },
];

/** Every canonical key claimed by a NAMED chip (i.e. not the catch-all). */
const NAMED_CHIP_KEYS = new Set(
  SUBSCRIPTION_FILTER_CATEGORIES.filter((g) => g.matches.length > 0).flatMap((g) => g.matches)
);

/**
 * Keys defined in CATEGORY_CONFIG that no named chip claims — they are
 * reachable only via the "Other" chip. Derived, so adding a category to
 * CATEGORY_CONFIG can never make it unfilterable.
 */
export const OTHER_CHIP_CATEGORIES = Object.keys(CATEGORY_CONFIG).filter(
  (key) => !NAMED_CHIP_KEYS.has(key)
);

/**
 * Single source of truth for "does this subscription belong under this
 * filter chip?". Normalises the raw category first so alias drift
 * (loan/loans, fee/fees, utility/utilities) can't split identical
 * subscriptions across buckets.
 *
 * Unknown `groupValue` falls back to an exact (normalised) category match
 * so legacy `?category=` URL params keep working.
 */
export function categoryMatchesFilterGroup(
  category: string | null | undefined,
  groupValue: string
): boolean {
  const key = normalizeCategoryKey(category);
  const group = SUBSCRIPTION_FILTER_CATEGORIES.find((g) => g.value === groupValue);
  if (!group) return key === normalizeCategoryKey(groupValue);
  // Catch-all: uncategorised rows plus anything no named chip claims.
  if (group.matches.length === 0) return !key || !NAMED_CHIP_KEYS.has(key);
  return !!key && group.matches.includes(key);
}
