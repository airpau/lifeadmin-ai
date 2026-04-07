/**
 * AI Self-Learning Engine
 *
 * Learns from user corrections to transaction categorisation and applies
 * those rules across all users. Every correction is stored in merchant_rules
 * with a confidence score that increases as more users confirm the same rule.
 *
 * Rules with confidence >= 3 override hardcoded categorisation logic.
 * Rules with confidence 1-2 are used as suggestions when no hardcoded match exists.
 */

import { createClient } from '@supabase/supabase-js';

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
}

// ─── Pattern normalisation ──────────────────────────────────────────────────

/**
 * Normalise a raw bank description into a stable pattern for rule matching.
 * Strips numbers, dates, reference codes, and lowercases.
 */
export function normalisePattern(raw: string): string {
  if (!raw) return '';
  let p = raw.trim().toLowerCase();

  // Strip leading card numbers (e.g. "9384 ")
  p = p.replace(/^\d{4}\s+/, '');

  // Strip date stamps (e.g. "19MAR26", "17/03/26")
  p = p.replace(/\d{2}[a-z]{3}\d{2}\s*/gi, '');
  p = p.replace(/\d{2}\/\d{2}\/\d{2}\s*/g, '');

  // Strip debit indicator
  p = p.replace(/^d\s+/, '');

  // Strip common prefixes
  p = p.replace(/^(paypal \*|paypal\*|patreon\*\s*|amzn mktp|amzn |sqr\*|google \*|apple\.com\/bill|izettle\*|www\.|https?:\/\/)/i, '');

  // Strip trailing reference numbers
  p = p.replace(/\s+\d{4,}[\s\d]*$/, '');
  p = p.replace(/\d{7,}$/, '');

  // Strip phone numbers
  p = p.replace(/\s*0\d{9,10}\s*$/, '');

  // Strip location suffixes
  p = p.replace(/\s+(london|gb|uk|manchester|birmingham)\s*(gb|uk)?$/i, '');

  // Strip FP payment references
  p = p.replace(/\s+fp\s+\d{2}\/\d{2}\/\d{2}.*$/i, '');

  // Strip common suffixes
  p = p.replace(/\s+(pymts?|payments?|subs?|subscriptions?|ltd|plc|uk|gbr|direct debit|dd|monthly|annual|online|internet|mobile|broadband|membership|membershippat)\s*$/gi, '');

  // Strip tracking/reference suffixes
  p = p.replace(/\s+pa\s*$/, '');
  p = p.replace(/\s+t-a\s*$/, '');
  p = p.replace(/-[a-z0-9]{4,}$/i, '');

  return p.replace(/\s+/g, ' ').trim();
}

// ─── Core learning functions ────────────────────────────────────────────────

export interface LearnParams {
  rawName: string;
  displayName?: string;
  category?: string;
  providerType?: string;
  isSubscription?: boolean;
  isTransfer?: boolean;
  incomeType?: string;
  amount?: number;
  userId: string;
}

/**
 * Learn from a user correction. Called whenever a user recategorises a
 * transaction. If a rule already exists for this pattern, increments
 * confidence and merges new fields. Otherwise creates a new rule.
 */
export async function learnFromCorrection(params: LearnParams) {
  const admin = getAdmin();
  const pattern = normalisePattern(params.rawName);
  if (!pattern) return null;

  // Check if a rule already exists for this normalised pattern
  const { data: existing } = await admin
    .from('merchant_rules')
    .select('*')
    .eq('raw_name_normalised', pattern)
    .limit(1)
    .single();

  if (existing) {
    // Merge new fields and increment confidence
    const updates: Record<string, unknown> = {
      confidence: (existing.confidence || 1) + 1,
      updated_at: new Date().toISOString(),
      source: 'user',
    };

    if (params.displayName && params.displayName !== existing.display_name) {
      updates.display_name = params.displayName;
    }
    if (params.category && params.category.toLowerCase() !== (existing.category || '').toLowerCase()) {
      updates.category = params.category.toLowerCase();
    }
    if (params.providerType !== undefined) {
      updates.provider_type = params.providerType;
    }
    if (params.isSubscription !== undefined) {
      updates.is_subscription = params.isSubscription;
    }
    if (params.isTransfer !== undefined) {
      updates.is_transfer = params.isTransfer;
    }
    if (params.incomeType !== undefined) {
      updates.income_type = params.incomeType.toLowerCase();
    }
    // Update amount range
    if (params.amount !== undefined) {
      const amt = Math.abs(params.amount);
      if (!existing.amount_min || amt < parseFloat(existing.amount_min)) {
        updates.amount_min = amt;
      }
      if (!existing.amount_max || amt > parseFloat(existing.amount_max)) {
        updates.amount_max = amt;
      }
    }

    const { data: updated, error } = await admin
      .from('merchant_rules')
      .update(updates)
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('Learning engine update error:', error.message);
      return null;
    }
    return updated;
  }

  // Create new rule
  const newRule: Record<string, unknown> = {
    raw_name: params.rawName,
    raw_name_normalised: pattern,
    display_name: params.displayName || params.rawName,
    category: (params.category || 'other').toLowerCase(),
    confidence: 1,
    source: 'user',
    created_by_user_id: params.userId,
  };
  if (params.providerType) newRule.provider_type = params.providerType;
  if (params.isSubscription !== undefined) newRule.is_subscription = params.isSubscription;
  if (params.isTransfer !== undefined) newRule.is_transfer = params.isTransfer;
  if (params.incomeType) newRule.income_type = params.incomeType.toLowerCase();
  if (params.amount !== undefined) {
    const amt = Math.abs(params.amount);
    newRule.amount_min = amt;
    newRule.amount_max = amt;
  }

  const { data: created, error } = await admin
    .from('merchant_rules')
    .insert(newRule)
    .select()
    .single();

  if (error) {
    console.error('Learning engine insert error:', error.message);
    return null;
  }
  return created;
}

// ─── Rule application ───────────────────────────────────────────────────────

export interface LearnedRule {
  displayName: string;
  category: string;
  providerType: string | null;
  isSubscription: boolean | null;
  isTransfer: boolean | null;
  incomeType: string | null;
  confidence: number;
}

/**
 * Look up learned rules for a transaction description.
 * Returns the highest-confidence matching rule, or null if no match.
 *
 * If amount is provided and the rule has amount_min/max, checks the range.
 */
export async function applyLearnedRules(
  description: string,
  bankCategory?: string,
  amount?: number,
): Promise<LearnedRule | null> {
  const admin = getAdmin();
  const pattern = normalisePattern(description);
  if (!pattern) return null;

  // Query rules ordered by confidence DESC, look for ILIKE matches
  const { data: rules } = await admin
    .from('merchant_rules')
    .select('display_name, category, provider_type, is_subscription, is_transfer, income_type, confidence, amount_min, amount_max')
    .order('confidence', { ascending: false })
    .limit(200);

  if (!rules || rules.length === 0) return null;

  // Find best match
  for (const rule of rules) {
    // Check if rule's normalised name matches our pattern
    // We compare against the raw_name_normalised field, but since we fetched
    // without it, we do ILIKE-style matching in code
    // Actually, let's query properly
  }

  // Better approach: query with ILIKE for this specific pattern
  const { data: matches } = await admin
    .from('merchant_rules')
    .select('display_name, category, provider_type, is_subscription, is_transfer, income_type, confidence, amount_min, amount_max, raw_name_normalised')
    .order('confidence', { ascending: false })
    .limit(50);

  if (!matches || matches.length === 0) return null;

  for (const rule of matches) {
    const rulePattern = (rule.raw_name_normalised || '').toLowerCase();
    if (!rulePattern) continue;

    // Check if patterns match (either contains the other)
    const matches = pattern.includes(rulePattern) || rulePattern.includes(pattern);
    if (!matches) continue;

    // If amount range specified, check it
    if (amount !== undefined && (rule.amount_min || rule.amount_max)) {
      const absAmt = Math.abs(amount);
      if (rule.amount_min && absAmt < parseFloat(rule.amount_min) * 0.5) continue;
      if (rule.amount_max && absAmt > parseFloat(rule.amount_max) * 2) continue;
    }

    return {
      displayName: rule.display_name,
      category: rule.category,
      providerType: rule.provider_type || null,
      isSubscription: rule.is_subscription ?? null,
      isTransfer: rule.is_transfer ?? null,
      incomeType: rule.income_type || null,
      confidence: rule.confidence || 1,
    };
  }

  return null;
}

/**
 * Get a learned rule synchronously-compatible: pre-fetched rules cache.
 * Call loadLearnedRules() once at the start of a request, then use
 * getLearnedRuleFromCache() for each transaction.
 */
let rulesCache: Array<{
  raw_name_normalised: string;
  display_name: string;
  category: string;
  provider_type: string | null;
  is_subscription: boolean | null;
  is_transfer: boolean | null;
  income_type: string | null;
  confidence: number;
  amount_min: string | null;
  amount_max: string | null;
}> | null = null;

let rulesCacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function loadLearnedRules(): Promise<void> {
  const now = Date.now();
  if (rulesCache && now - rulesCacheTime < CACHE_TTL_MS) return;

  const admin = getAdmin();
  const { data } = await admin
    .from('merchant_rules')
    .select('raw_name_normalised, display_name, category, provider_type, is_subscription, is_transfer, income_type, confidence, amount_min, amount_max')
    .order('confidence', { ascending: false })
    .limit(500);

  rulesCache = data || [];
  rulesCacheTime = now;
}

/**
 * Look up a learned rule from the in-memory cache.
 * Must call loadLearnedRules() first.
 */
export function getLearnedRuleFromCache(
  description: string,
  amount?: number,
): LearnedRule | null {
  if (!rulesCache) return null;
  const pattern = normalisePattern(description);
  if (!pattern) return null;

  for (const rule of rulesCache) {
    const rulePattern = (rule.raw_name_normalised || '').toLowerCase();
    if (!rulePattern) continue;

    const isMatch = pattern.includes(rulePattern) || rulePattern.includes(pattern);
    if (!isMatch) continue;

    // Check amount range if applicable
    if (amount !== undefined && (rule.amount_min || rule.amount_max)) {
      const absAmt = Math.abs(amount);
      if (rule.amount_min && absAmt < parseFloat(rule.amount_min) * 0.5) continue;
      if (rule.amount_max && absAmt > parseFloat(rule.amount_max) * 2) continue;
    }

    return {
      displayName: rule.display_name,
      category: rule.category,
      providerType: rule.provider_type || null,
      isSubscription: rule.is_subscription ?? null,
      isTransfer: rule.is_transfer ?? null,
      incomeType: rule.income_type || null,
      confidence: rule.confidence || 1,
    };
  }

  return null;
}

// ─── Learning-aware categorisation ──────────────────────────────────────────

/**
 * Async categorisation that checks learned rules first, then falls back
 * to hardcoded logic. Use this in API routes instead of categoriseTransaction.
 */
export async function categoriseWithLearning(
  description: string,
  bankCategory: string,
  amount?: number,
): Promise<string> {
  // Try learned rules first
  const learned = await applyLearnedRules(description, bankCategory, amount);
  if (learned && learned.confidence >= 2) {
    return learned.category;
  }

  // Fall back to hardcoded categorisation
  const { categoriseTransaction } = await import('@/lib/merchant-normalise');
  const hardcoded = categoriseTransaction(description, bankCategory);

  // If hardcoded returns generic 'other'/'shopping'/'bills', use learned rule even at confidence 1
  if (learned && ['other', 'shopping', 'bills'].includes(hardcoded)) {
    return learned.category;
  }

  return hardcoded;
}

/**
 * Sync version using pre-loaded cache. Call loadLearnedRules() before using.
 */
export function categoriseWithLearningSync(
  description: string,
  bankCategory: string,
  amount?: number,
): string {
  const { categoriseTransaction } = require('@/lib/merchant-normalise');

  const learned = getLearnedRuleFromCache(description, amount);
  if (learned && learned.confidence >= 2) {
    return learned.category;
  }

  const hardcoded = categoriseTransaction(description, bankCategory);

  if (learned && ['other', 'shopping', 'bills'].includes(hardcoded)) {
    return learned.category;
  }

  return hardcoded;
}

// ─── Transfer detection ─────────────────────────────────────────────────────

const TRANSFER_KEYWORDS = [
  'personal transfer', 'to a/c', 'from a/c', 'via mobile', 'internal',
  'between accounts', 'savings transfer', 'tfr', 'trf', 'fps',
  'online transfer', 'mobile transfer', 'bank transfer',
  'standing order to', 'dd to savings', 'move to savings',
  'credit card payment', 'card payment thank you', 'balance transfer',
];

const CREDIT_CARD_PROVIDERS = [
  'barclaycard', 'mbna', 'halifax credit', 'hsbc credit',
  'american express', 'amex', 'capital one', 'vanquis',
  'aqua', 'marbles', 'tesco bank credit', 'virgin money',
];

/**
 * Detect if a transaction description indicates it's a transfer.
 */
function isTransferByDescription(description: string): boolean {
  const d = description.toLowerCase();

  // Check transfer keywords
  for (const kw of TRANSFER_KEYWORDS) {
    if (d.includes(kw)) return true;
  }

  // Check credit card providers
  for (const provider of CREDIT_CARD_PROVIDERS) {
    if (d.includes(provider)) return true;
  }

  return false;
}

/**
 * Mark transactions as transfers based on description patterns.
 * Scans all transactions and flags those with transfer keywords.
 */
export async function markTransfersFromDescription(userId: string): Promise<number> {
  const admin = getAdmin();

  // Get transactions from last 6 months
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

  const { data: txns } = await admin
    .from('bank_transactions')
    .select('id, description, user_category, income_type')
    .eq('user_id', userId)
    .gte('timestamp', sixMonthsAgo.toISOString())
    .order('timestamp', { ascending: false })
    .limit(5000);

  if (!txns || txns.length === 0) return 0;

  const toUpdate: string[] = [];
  for (const txn of txns) {
    if (isTransferByDescription(txn.description || '')) {
      toUpdate.push(txn.id);
    }
  }

  // Update in batches of 50
  let updated = 0;
  for (let i = 0; i < toUpdate.length; i += 50) {
    const batch = toUpdate.slice(i, i + 50);
    const { count } = await admin
      .from('bank_transactions')
      .update({ user_category: 'transfers', income_type: 'transfer' })
      .in('id', batch);
    if (count) updated += count;
  }

  return updated;
}

/**
 * Detect transfers between a user's own bank accounts by finding matching
 * pairs: same amount, same date (within 1 day), one credit one debit.
 */
export async function detectTransfersBetweenAccounts(userId: string): Promise<number> {
  const admin = getAdmin();

  // Get last 3 months of transactions across all accounts
  const threeMonthsAgo = new Date();
  threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

  const { data: txns } = await admin
    .from('bank_transactions')
    .select('id, amount, timestamp, description, category, bank_connection_id')
    .eq('user_id', userId)
    .gte('timestamp', threeMonthsAgo.toISOString())
    .order('timestamp', { ascending: false })
    .limit(2000);

  if (!txns || txns.length === 0) return 0;

  // Only detect across different bank connections
  const connectionIds = new Set(txns.map(t => t.bank_connection_id).filter(Boolean));
  if (connectionIds.size < 2) return 0;

  const matched = new Set<string>();
  let transferCount = 0;

  // Group by date (YYYY-MM-DD)
  const byDate: Record<string, typeof txns> = {};
  for (const t of txns) {
    const date = t.timestamp.substring(0, 10);
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push(t);
    // Also add to adjacent date for 1-day tolerance
    const nextDay = new Date(date);
    nextDay.setDate(nextDay.getDate() + 1);
    const nextKey = nextDay.toISOString().substring(0, 10);
    if (!byDate[nextKey]) byDate[nextKey] = [];
    byDate[nextKey].push(t);
  }

  for (const t of txns) {
    if (matched.has(t.id)) continue;
    const amt = parseFloat(t.amount);
    if (amt === 0) continue;

    const date = t.timestamp.substring(0, 10);
    const candidates = byDate[date] || [];

    for (const c of candidates) {
      if (c.id === t.id || matched.has(c.id)) continue;
      if (c.bank_connection_id === t.bank_connection_id) continue;

      const cAmt = parseFloat(c.amount);
      // One should be positive, one negative, same absolute amount
      if (Math.abs(Math.abs(amt) - Math.abs(cAmt)) < 0.01 && amt * cAmt < 0) {
        matched.add(t.id);
        matched.add(c.id);
        transferCount++;
        break;
      }
    }
  }

  // Mark matched transactions
  if (matched.size > 0) {
    const ids = Array.from(matched);
    // Update in batches of 50
    for (let i = 0; i < ids.length; i += 50) {
      const batch = ids.slice(i, i + 50);
      await admin
        .from('bank_transactions')
        .update({ user_category: 'transfers', income_type: 'transfer' })
        .in('id', batch);
    }
  }

  return transferCount;
}
