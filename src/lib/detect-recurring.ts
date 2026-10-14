import { SupabaseClient } from '@supabase/supabase-js';
import { deriveRecurringGroup } from './subscription-key';
import { isPayrollLike } from './subscriptions/payroll-filter';
import {
  ANNUAL_LOOKBACK_DAYS,
  isCouncilTaxMerchant,
  isHighVarianceMerchant,
} from './subscriptions/recurring-qualification';
import {
  detectRecurringSeries,
  groupTransactionsByMerchant,
  isKnownSubscriptionMerchant,
  isOneOffRetailMerchant,
  seriesOccurrences,
} from './subscriptions/recurrence-detector';
import {
  detectionColumnsFor,
  insertSubscriptionDetection,
  storedCycleAndAmount,
} from './subscriptions/detection-writes';

/** Below this confidence a new row is created already flagged for review. */
const AUTO_CONFIRM_CONFIDENCE = 0.8;
/** Below this confidence nothing is created at all. */
const MIN_CREATE_CONFIDENCE = 0.6;

const STRIP_SUFFIXES = /\b(ltd|limited|plc|llp|inc|corp|group|uk|co\.uk)\b/gi;

/**
 * Extract a merchant name from a bank transaction description.
 * UK Open Banking descriptions come in various formats:
 * - "4239 19MAR26 D EXPERIAN NOTTINGHAM GB"
 * - "GYM IQ LTD TO REVOLUT -ZIE5- TPP REVOLUT LTD FP 19/03/26..."
 * - "CA AUTO FINANCE UK"
 * - "9384 17MAR26 WHOOP BOSTON US"
 */
export function extractMerchantFromDescription(description: string): string | null {
  if (!description) return null;

  let cleaned = description;

  // Remove leading card numbers (4 digits)
  cleaned = cleaned.replace(/^\d{4}\s+/, '');

  // Remove date patterns: "19MAR26", "17/03/26", "19/03/26"
  cleaned = cleaned.replace(/\d{2}[A-Z]{3}\d{2}\s*/g, '');
  cleaned = cleaned.replace(/\d{2}\/\d{2}\/\d{2}\s*/g, '');

  // Remove "D " prefix (debit indicator)
  cleaned = cleaned.replace(/^D\s+/, '');

  // Remove FP reference numbers
  cleaned = cleaned.replace(/FP\s+\d{2}\/\d{2}\/\d{2}\s+\d+\s*\d*[A-Z]*/g, '');

  // Remove TPP references
  cleaned = cleaned.replace(/TPP\s+\w+\s+LTD/gi, '');

  // Remove "TO REVOLUT" transfer references and alphanumeric codes like -ZIE5-
  cleaned = cleaned.replace(/TO\s+REVOLUT\s+-\w+-/gi, '');

  // Remove "VIA MOBILE - PYMT" type phrases
  cleaned = cleaned.replace(/VIA\s+MOBILE\s*-?\s*PYMT/gi, '');

  // Remove location suffixes (GB, US, etc.)
  cleaned = cleaned.replace(/\b[A-Z]{2}\s*$/g, '');

  // Remove city names that commonly appear
  cleaned = cleaned.replace(/\b(LONDON|NOTTINGHAM|BOSTON|MANCHESTER|BIRMINGHAM|LEEDS|EDINBURGH|GLASGOW|CARDIFF|BRISTOL)\b/gi, '');

  // Clean up extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // If too short after cleaning, try to use first meaningful words from original
  if (cleaned.length < 3) {
    const words = description.replace(/^\d+\s+/, '').split(/\s+/);
    // Skip date-like and number-like words
    const meaningful = words.filter(w =>
      w.length > 2 && !/^\d+$/.test(w) && !/^\d{2}[A-Z]{3}\d{2}$/.test(w) && w !== 'D'
    );
    cleaned = meaningful.slice(0, 3).join(' ');
  }

  return cleaned.length >= 3 ? cleaned : null;
}

const CATEGORY_KEYWORDS: Record<string, string[]> = {
  mortgage: ['mortgage', 'lendinvest', 'skipton b.s', 'skipton bs', 'halifax mortgage', 'nationwide bs', 'building society', 'paratus', 'paratus amc', 'pepper money', 'together money', 'shawbrook', 'kensington', 'bm solutions', 'molo', 'landbay'],
  rent: ['rent', 'letting', 'openrent', 'estate agent'],
  loan: ['auto finance', 'ca auto finance', 'car finance', 'natwest loan', 'santander loan', 'novuna', 'tesco bank', 'klarna', 'clearpay', 'afterpay', 'bbls', 'bounce back', 'cbils', 'recovery loan', 'funding circle', 'iwoca', 'esme loans', 'fleximize', 'capital on tap', 'creation.co', 'creation financial'],
  insurance: ['insurance', 'aviva', 'direct line', 'admiral', 'axa', 'zurich', 'legal & general'],
  utility: ['energy', 'electric', 'gas', 'water', 'e.on', 'eon next', 'eon energy', 'british gas', 'octopus', 'ovo', 'edf', 'scottish power', 'thames water', 'severn trent', 'united utilities'],
  broadband: ['broadband', 'bt broadband', 'bt fibre', 'sky broadband', 'virgin media', 'vodafone broadband', 'plusnet', 'talktalk', 'hyperoptic', 'communityfibre', 'community fibre'],
  mobile: ['mobile', 'ee ', 'three', 'o2 ', 'giffgaff', 'id mobile', 'smarty', 'lebara', 'tesco mobile'],
  streaming: ['netflix', 'spotify', 'disney', 'amazon prime', 'apple tv', 'paramount', 'now tv', 'youtube', 'dazn', 'crunchyroll', 'patreon'],
  fitness: ['gym', 'fitness', 'puregym', 'david lloyd', 'nuffield', 'anytime fitness', 'the gym', 'whoop', 'peloton', 'strava', 'gym iq'],
  software: ['adobe', 'microsoft', 'google', 'apple', 'icloud', 'dropbox', 'notion', 'slack', 'zoom', 'canva', 'openai', 'anthropic', 'github', 'figma', 'experian'],
  council_tax: ['council tax', 'council'],
  tax: ['hmrc', 'hm revenue', 'self assessment', 'paye', 'corporation tax', 'vat payment', 'tax payment'],
  gambling: ['betfair', 'bet365', 'paddy power', 'william hill', 'coral', 'ladbrokes', 'sky bet', 'betway'],
  food: ['deliveroo', 'just eat', 'uber eats', 'gousto', 'hello fresh', 'mindful chef'],
  shopping: ['amazon', 'ebay', 'asos', 'next'],
  childcare: ['childcare', 'nursery', 'school', 'bright horizons', 'kidsunlimited'],
  transport: ['transport', 'tfl', 'oyster', 'rail', 'train', 'dvla'],
};

function categoriseTransaction(merchantName: string, description: string | null): string {
  const searchText = `${merchantName} ${description || ''}`.toLowerCase();
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    if (keywords.some((kw) => searchText.includes(kw))) {
      return category;
    }
  }
  return 'other';
}

function normaliseMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(STRIP_SUFFIXES, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Detects recurring payments from bank transactions for a user.
 *
 * Rewritten 2026-10-14 (see src/lib/subscriptions/recurrence-detector.ts
 * for the rules and the audit that prompted it). In short: transfers,
 * refunds, cash, bank fees and interest, card repayments and buy now pay
 * later are excluded up front; a merchant then needs at least 3 charges
 * on one consistent cadence with stable amounts (small price rises
 * allowed), or 2 charges about a year apart. Retail, grocery, fuel and
 * eating-out merchants need 4 identical charges. The latest charge must
 * still be live.
 *
 * Dismissals are PERMANENT: if any matching subscription row already
 * exists for the merchant (active, dismissed, cancelled or archived) we
 * never re-insert it. Manual rows are never touched.
 */
export async function detectRecurring(
  userId: string,
  supabase: SupabaseClient
): Promise<number> {
  // Load merchant rules for intelligent categorisation
  const { data: merchantRules } = await supabase
    .from('merchant_rules')
    .select('raw_name_normalised, display_name, category, deal_category, provider_type');

  const rulesMap = new Map<string, { display_name: string; category: string; deal_category: string | null }>();
  for (const rule of merchantRules || []) {
    rulesMap.set(rule.raw_name_normalised, rule);
  }

  // Annual window so two yearly payments can both be seen. Newest first
  // so that if the row cap bites on a heavy account we keep the recent
  // payments the liveness check needs.
  const lookbackStart = new Date(Date.now() - ANNUAL_LOOKBACK_DAYS * 86_400_000).toISOString();
  const { data: transactions, error } = await supabase
    .from('bank_transactions')
    .select('id, merchant_name, description, amount, timestamp, recurring_group, category, user_category, transfer_pair_id')
    .eq('user_id', userId)
    .lt('amount', 0) // debits only
    .is('deleted_at', null)
    .gte('timestamp', lookbackStart)
    .order('timestamp', { ascending: false })
    .limit(5000);

  if (error || !transactions) {
    console.error('Error fetching transactions for recurring detection:', error);
    return 0;
  }

  // Liveness is judged against the freshest transaction we hold, not the
  // wall clock, so a bank feed that stopped syncing a few weeks ago does
  // not make every subscription look lapsed.
  const latestTx = transactions[0]?.timestamp ? new Date(transactions[0].timestamp) : new Date();
  const asOf = latestTx.getTime() < Date.now() ? latestTx : new Date();

  const groups = groupTransactionsByMerchant(transactions);

  // One fetch of the user's subscription rows (all statuses) for dedup.
  const { data: allUserSubs } = await supabase
    .from('subscriptions')
    .select('id, provider_name, status, cancelled_at, dismissed_at, archived_at, recurring_group, bank_description')
    .eq('user_id', userId);

  // Helper: extract significant words (3+ chars, no noise)
  const sigWords = (s: string) => s.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !['ltd', 'limited', 'plc', 'the', 'and', 'for'].includes(w));

  let newRecurringCount = 0;

  for (const [normalisedName, series] of groups.entries()) {
    const displayName = extractMerchantFromDescription(series.displayName) || series.displayName;
    const description = series.description;

    // Council tax is legitimately recurring but belongs in Expected
    // Bills, never in subscriptions. Shared blocklist with the cron.
    if (isCouncilTaxMerchant(displayName) || isCouncilTaxMerchant(description || '')) continue;

    // Never auto-create a subscription from a payroll / salary / wages
    // outgoing. See src/lib/subscriptions/payroll-filter.ts.
    if (isPayrollLike({ provider_name: displayName, description })) continue;

    const highVariance =
      isHighVarianceMerchant(displayName, description) || isOneOffRetailMerchant(displayName, description);
    const result = detectRecurringSeries(seriesOccurrences(series), {
      now: asOf,
      highVariance,
      knownSubscription: isKnownSubscriptionMerchant(displayName, description),
    });

    if (!result.qualifies || !result.cadence || result.amount == null) continue;
    if (result.confidence < MIN_CREATE_CONFIDENCE) continue;

    // Mark ONLY the transactions that form the qualifying series as
    // recurring, not one-off charges at the same merchant.
    const usedDays = new Set(result.usedDayKeys);
    const ids = series.txs
      .filter((t) => usedDays.has(new Date(t.timestamp).toISOString().slice(0, 10)))
      .map((t) => t.id);
    if (ids.length > 0) {
      await supabase
        .from('bank_transactions')
        .update({ is_recurring: true, recurring_group: normalisedName })
        .in('id', ids);
    }

    // Canonical key for this recurring group, same function every writer
    // into `subscriptions` uses, so the partial unique index
    // (user_id, recurring_group) catches anything this heuristic misses.
    const recurringKey = deriveRecurringGroup(displayName);

    const matchingSub = (allUserSubs || []).find((sub) => {
      if (recurringKey && sub.recurring_group && sub.recurring_group === recurringKey) return true;
      const subNorm = normaliseMerchant(sub.provider_name);
      const groupNorm = normaliseMerchant(displayName);
      if (sub.provider_name === displayName) return true;
      if (subNorm === groupNorm || subNorm === normalisedName) return true;
      if (subNorm.length >= 3 && groupNorm.length >= 3) {
        if (subNorm.includes(groupNorm) || groupNorm.includes(subNorm)) return true;
      }
      // Keyword overlap: if 60%+ of significant words match, it's the same provider
      const wordsA = sigWords(groupNorm);
      const wordsB = sigWords(sub.provider_name);
      if (wordsA.length > 0 && wordsB.length > 0) {
        const overlap = wordsA.filter(w => wordsB.some(b => b.includes(w) || w.includes(b))).length;
        const overlapRatio = overlap / Math.min(wordsA.length, wordsB.length);
        if (overlapRatio >= 0.6) return true;
      }
      return false;
    });

    // A matching row already exists: never insert another, whatever its
    // status. Dismissed, cancelled and archived rows are permanent
    // tombstones. The daily cron re-checks existing rows.
    if (matchingSub) continue;

    // Merchant rules first (learned from user edits), then keyword matching.
    const ruleKey = normaliseMerchant(displayName);
    const rule = rulesMap.get(ruleKey) ||
      [...rulesMap.entries()].find(([key]) => ruleKey.includes(key) || key.includes(ruleKey))?.[1];

    const category = rule?.category || categoriseTransaction(displayName, description);
    const finalDisplayName = rule?.display_name || displayName;
    const stored = storedCycleAndAmount(result);
    const confirmed = result.confidence >= AUTO_CONFIRM_CONFIDENCE;

    const { error: insertError } = await insertSubscriptionDetection(supabase, {
      user_id: userId,
      provider_name: finalDisplayName,
      amount: stored.amount,
      billing_cycle: stored.billing_cycle,
      status: 'active',
      source: 'bank',
      category,
      bank_description: description,
      notes: 'Detected from bank transactions',
      needs_review: !confirmed,
      recurring_group: deriveRecurringGroup(finalDisplayName),
      ...detectionColumnsFor(confirmed ? 'confirmed' : 'needs_review', result.reason, result),
    });

    if (insertError) {
      // 23505: a parallel bank-sync run inserted the same row first.
      if (insertError.code !== '23505') {
        console.error(`Failed to create subscription for ${displayName}:`, insertError);
      }
    } else {
      newRecurringCount++;
      (allUserSubs || []).push({
        id: '',
        provider_name: finalDisplayName,
        status: 'active',
        cancelled_at: null,
        dismissed_at: null,
        archived_at: null,
        recurring_group: deriveRecurringGroup(finalDisplayName),
        bank_description: description,
      });
      console.log(
        `Detected recurring: ${finalDisplayName} £${result.amount.toFixed(2)}/${result.cadence} ` +
        `(${result.occurrences} payments, confidence ${result.confidence}) [${category}]${rule ? ' (from merchant rules)' : ''}`,
      );
    }
  }

  // ── Recategorise stale 'other'/'bills' subscriptions ──
  // Re-run keyword matcher on existing subs that are still generic 'other' or 'bills'
  const { data: staleSubs } = await supabase
    .from('subscriptions')
    .select('id, provider_name, category, bank_description')
    .eq('user_id', userId)
    .eq('status', 'active')
    .in('category', ['other', 'bills']);

  let recategorised = 0;
  for (const sub of staleSubs || []) {
    // Check merchant rules first
    const subNorm = normaliseMerchant(sub.provider_name);
    const rule = rulesMap.get(subNorm) ||
      [...rulesMap.entries()].find(([key]) => subNorm.includes(key) || key.includes(subNorm))?.[1];

    const newCat = rule?.category || categoriseTransaction(sub.provider_name, sub.bank_description);
    if (newCat && newCat !== 'other' && newCat !== sub.category) {
      await supabase
        .from('subscriptions')
        .update({ category: newCat })
        .eq('id', sub.id);
      recategorised++;
      console.log(`Recategorised: ${sub.provider_name} ${sub.category} → ${newCat}`);
    }
  }

  console.log(`detectRecurring: processed ${transactions.length} transactions, found ${newRecurringCount} new recurring, recategorised ${recategorised} existing`);
  return newRecurringCount;
}
