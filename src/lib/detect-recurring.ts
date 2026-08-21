import { SupabaseClient } from '@supabase/supabase-js';
import { deriveRecurringGroup } from './subscription-key';
import { isPayrollLike } from './subscriptions/payroll-filter';
import {
  ANNUAL_LOOKBACK_DAYS,
  isCouncilTaxMerchant,
  isExcludedTransactionCategory,
  isHighVarianceMerchant,
  qualifyRecurringSeries,
  qualifyAnnualSeries,
} from './subscriptions/recurring-qualification';

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
 * Qualification is delegated to `qualifyRecurringSeries`
 * (src/lib/subscriptions/recurring-qualification.ts): >= 3 occurrences,
 * >= 2 intervals all inside one tight cadence window, amounts within
 * +/-8% of the median, 13-month lookback with a liveness check, £1
 * minimum, and a stricter 4-occurrence identical-amount rule for
 * grocery/fuel/eating-out/retail merchants. The true billing cycle is
 * stored — weekly stays weekly (the old weekly->monthly rewrite is gone).
 *
 * Dismissals are PERMANENT: if any matching subscription row already
 * exists for the merchant — active, dismissed, cancelled or archived —
 * we never re-insert it. Re-subscribing after a dismissal is a manual
 * user action, not something the detector second-guesses.
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

  // Fetch debits inside the ANNUAL window, not the 13-month one.
  //
  // Widened 2026-08-21 so the annual pass has something to work with:
  // two yearly payments are 360+ days apart, so a 396-day fetch could
  // only ever contain one of them.
  //
  // This does NOT widen the general path. qualifyRecurringSeries applies
  // its own LOOKBACK_DAYS cutoff internally, so monthly and weekly
  // detection still sees exactly the same 396 days it always did. That
  // separation is deliberate: feeding older payments into every
  // merchant's interval list would break working detections, because
  // qualification requires every interval to sit inside one cadence
  // window and an old payment adds an enormous one.
  //
  // Ordered newest-first so that if the PostgREST row cap bites on a
  // heavy account, we keep the RECENT payments the liveness check needs
  // (and txs[0] carries the freshest merchant_name/description).
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

  // Group by normalised merchant name (from merchant_name or description)
  const groups = new Map<string, Array<typeof transactions[0] & { extracted_name: string }>>();

  for (const tx of transactions) {
    // Category exclusions: transfers, cash withdrawals, income, fees and
    // payments to a credit card can look perfectly periodic but are never
    // subscriptions. Paired internal transfers are excluded outright.
    if (tx.transfer_pair_id) continue;
    if (isExcludedTransactionCategory(tx.category) || isExcludedTransactionCategory(tx.user_category)) {
      continue;
    }

    const merchantName = tx.merchant_name || extractMerchantFromDescription(tx.description || '');
    if (!merchantName) continue;

    const key = normaliseMerchant(merchantName);
    if (!key || key.length < 3) continue;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ ...tx, extracted_name: merchantName });
  }

  // One fetch of the user's subscription rows (all statuses) for dedup —
  // previously re-queried inside the loop for every merchant group.
  const { data: allUserSubs } = await supabase
    .from('subscriptions')
    .select('id, provider_name, status, cancelled_at, dismissed_at, archived_at, recurring_group')
    .eq('user_id', userId);

  // Helper: extract significant words (3+ chars, no noise)
  const sigWords = (s: string) => s.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !['ltd', 'limited', 'plc', 'the', 'and', 'for'].includes(w));

  let newRecurringCount = 0;

  for (const [normalisedName, txs] of groups.entries()) {
    const displayName = txs[0].extracted_name;

    // Council tax is legitimately recurring but belongs in Expected
    // Bills, never in subscriptions. Shared blocklist with the cron.
    if (isCouncilTaxMerchant(displayName) || isCouncilTaxMerchant(txs[0].description || '')) {
      continue;
    }

    // Never auto-create a subscription from a payroll / salary / wages outgoing.
    // A staff payment ("Lisagroom", £808.71/mo) was mis-detected here as a
    // recurring subscription and triggered a "trial ends in 3 days — reply
    // CANCEL" alert via the Pocket Agent. Payroll is a legitimate business cost,
    // not a cancellable subscription. See src/lib/subscriptions/payroll-filter.ts.
    if (isPayrollLike({ provider_name: displayName, description: txs[0].description })) {
      continue;
    }

    // Qualification core: cadence windows, median amount trim, recency.
    const highVariance = isHighVarianceMerchant(displayName, txs[0].description);
    const occurrences = txs.map((t) => ({
      date: t.timestamp,
      amount: Math.abs(Number(t.amount)),
    }));
    let result = qualifyRecurringSeries(occurrences, { highVariance });

    // Annual pass, additive and only after the general one has failed.
    //
    // The general rules need 3 occurrences with every interval inside
    // one cadence window, over a 396-day lookback. Two yearly intervals
    // span 720+ days, so annual billing could never qualify: the
    // `yearly` cadence window existed and nothing could reach it.
    // Annual insurance, breakdown cover, Prime, domain renewals were
    // all invisible.
    //
    // High-variance merchants (groceries, fuel, retail) are excluded
    // from this pass. Two same-priced supermarket shops a year apart is
    // a coincidence, not a subscription, and with only one interval to
    // go on there is not enough evidence to tell the difference.
    if (!result.qualifies && !highVariance) {
      const annual = qualifyAnnualSeries(occurrences);
      if (annual.qualifies) result = annual;
    }

    if (!result.qualifies || !result.billingCycle || result.medianAmount == null) {
      continue;
    }

    // Mark ONLY the transactions that form the qualifying series as
    // recurring — not one-off charges at the same merchant that the
    // amount trim excluded.
    const usedDays = new Set(result.usedDayKeys);
    const ids = txs
      .filter((t) => {
        const day = new Date(t.timestamp).toISOString().slice(0, 10);
        return usedDays.has(day);
      })
      .map((t) => t.id);
    if (ids.length > 0) {
      await supabase
        .from('bank_transactions')
        .update({ is_recurring: true, recurring_group: normalisedName })
        .in('id', ids);
    }

    // Canonical key for this recurring group — same function used everywhere
    // that inserts into `subscriptions`, so the partial unique index
    // (user_id, recurring_group) will catch anything this heuristic misses.
    const recurringKey = deriveRecurringGroup(displayName);

    const matchingSub = (allUserSubs || []).find((sub) => {
      // Fast path: exact recurring_group match is unambiguous.
      if (recurringKey && sub.recurring_group && sub.recurring_group === recurringKey) return true;

      const subNorm = normaliseMerchant(sub.provider_name);
      // Exact or normalised match
      if (sub.provider_name === displayName) return true;
      if (subNorm === normalisedName) return true;
      // Partial includes
      if (subNorm.length >= 3 && normalisedName.length >= 3) {
        if (subNorm.includes(normalisedName) || normalisedName.includes(subNorm)) return true;
      }
      // Keyword overlap: if 60%+ of significant words match, it's the same provider
      const wordsA = sigWords(normalisedName);
      const wordsB = sigWords(sub.provider_name);
      if (wordsA.length > 0 && wordsB.length > 0) {
        const overlap = wordsA.filter(w => wordsB.some(b => b.includes(w) || w.includes(b))).length;
        const overlapRatio = overlap / Math.min(wordsA.length, wordsB.length);
        if (overlapRatio >= 0.6) return true;
      }
      return false;
    });

    if (matchingSub) {
      // A matching row already exists — never insert another, whatever
      // its status. Dismissed, cancelled and archived rows are PERMANENT
      // tombstones: the old "90 days since dismissal = re-subscription"
      // amnesia silently resurrected subscriptions users had dismissed,
      // so it has been removed. If a user genuinely re-subscribes, they
      // re-add it manually or un-dismiss the existing row.
      continue;
    }

    const bankDesc = txs[0].description || null;

    // Check merchant rules first (learned from user edits), then fall back to keyword matching
    const rule = rulesMap.get(normalisedName) ||
      [...rulesMap.entries()].find(([key]) => normalisedName.includes(key) || key.includes(normalisedName))?.[1];

    const category = rule?.category || categoriseTransaction(displayName, bankDesc);
    const finalDisplayName = rule?.display_name || displayName;

    const { error: insertError } = await supabase.from('subscriptions').insert({
      user_id: userId,
      provider_name: finalDisplayName,
      amount: result.medianAmount,
      billing_cycle: result.billingCycle,
      status: 'active',
      source: 'bank',
      category,
      bank_description: bankDesc,
      notes: 'Detected from bank transactions',
      needs_review: true,
      // Canonical key so `get_subscription_total` can join this row against
      // the ledger and the partial unique index catches any race that
      // slipped past the `matchingSub` filter above. See 20260422020000.
      recurring_group: deriveRecurringGroup(finalDisplayName),
    });

    if (insertError) {
      // Partial unique index on (user_id, lower(provider_name), round(amount,2))
      // guards against concurrent bank-sync runs — when two crons both see no
      // Patreon row and both try to insert, the second one lands here with
      // PG error 23505. That's the expected path, not a failure: silently
      // skip so we don't noisy-log or double-count.
      if ((insertError as { code?: string }).code === '23505') {
        // Already inserted by a parallel run — nothing to do.
      } else {
        console.error(`Failed to create subscription for ${displayName}:`, insertError);
      }
    } else {
      newRecurringCount++;
      // Keep the in-memory dedup list current so a second qualifying
      // group in this run can't insert a near-duplicate row.
      (allUserSubs || []).push({
        id: '',
        provider_name: finalDisplayName,
        status: 'active',
        cancelled_at: null,
        dismissed_at: null,
        archived_at: null,
        recurring_group: deriveRecurringGroup(finalDisplayName),
      });
      console.log(`Detected recurring: ${finalDisplayName} £${result.medianAmount.toFixed(2)}/${result.billingCycle} (${result.occurrencesUsed} payments)[${category}]${rule ? ' (from merchant rules)' : ''}`);
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
