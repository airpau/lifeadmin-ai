import { SupabaseClient } from '@supabase/supabase-js';

const STRIP_SUFFIXES = /\b(ltd|limited|plc|llp|inc|corp|group|uk|co\.uk)\b/gi;
const AMOUNT_VARIANCE = 0.10; // 10%
const INTERVAL_TOLERANCE_DAYS = 5;

// Approximate day counts for billing cycles
const CYCLE_DAYS = {
  weekly: 7,
  monthly: 30,
  quarterly: 91,
  yearly: 365,
};

/**
 * Extract a merchant name from a bank transaction description.
 * UK Open Banking descriptions come in various formats:
 * - "4239 19MAR26 D EXPERIAN NOTTINGHAM GB"
 * - "GYM IQ LTD TO REVOLUT -ZIE5- TPP REVOLUT LTD FP 19/03/26..."
 * - "CA AUTO FINANCE UK"
 * - "9384 17MAR26 WHOOP BOSTON US"
 */
function extractMerchantFromDescription(description: string): string | null {
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
  mortgage: ['mortgage', 'halifax mortgage', 'nationwide bs', 'building society'],
  rent: ['rent', 'letting', 'openrent', 'estate agent'],
  loan: ['auto finance', 'car finance', 'loan', 'credit', 'klarna', 'clearpay', 'afterpay'],
  insurance: ['insurance', 'aviva', 'direct line', 'admiral', 'axa', 'zurich', 'legal & general'],
  utility: ['energy', 'electric', 'gas', 'water', 'eon', 'british gas', 'octopus', 'ovo', 'edf', 'scottish power', 'thames water', 'severn trent', 'united utilities'],
  broadband: ['broadband', 'bt ', 'sky ', 'virgin media', 'vodafone', 'plusnet', 'talktalk', 'hyperoptic'],
  mobile: ['mobile', 'ee ', 'three', 'o2 ', 'giffgaff', 'id mobile', 'smarty', 'lebara', 'tesco mobile'],
  streaming: ['netflix', 'spotify', 'disney', 'amazon prime', 'apple tv', 'paramount', 'now tv', 'youtube', 'dazn', 'crunchyroll'],
  fitness: ['gym', 'fitness', 'puregym', 'david lloyd', 'nuffield', 'anytime fitness', 'the gym', 'whoop', 'peloton', 'strava'],
  software: ['adobe', 'microsoft', 'google', 'apple', 'icloud', 'dropbox', 'notion', 'slack', 'zoom', 'canva', 'openai', 'anthropic', 'github', 'figma', 'experian'],
  council_tax: ['council tax', 'council'],
  gambling: ['betfair', 'bet365', 'paddy power', 'william hill', 'coral', 'ladbrokes', 'sky bet', 'betway'],
  food: ['deliveroo', 'just eat', 'uber eats', 'gousto', 'hello fresh', 'mindful chef'],
  shopping: ['amazon', 'ebay', 'asos', 'next'],
  childcare: ['childcare', 'nursery', 'school'],
  transport: ['transport', 'tfl', 'oyster', 'rail', 'train'],
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

function detectCycle(intervals: number[]): string | null {
  for (const [cycle, days] of Object.entries(CYCLE_DAYS)) {
    const allMatch = intervals.every(
      (d) => Math.abs(d - days) <= INTERVAL_TOLERANCE_DAYS
    );
    if (allMatch) return cycle;
  }
  return null;
}

function amountsConsistent(amounts: number[]): boolean {
  if (amounts.length === 0) return false;
  const avg = amounts.reduce((a, b) => a + b, 0) / amounts.length;
  if (avg === 0) return false;
  return amounts.every((a) => Math.abs(a - avg) / avg <= AMOUNT_VARIANCE);
}

/**
 * Detects recurring payments from bank transactions for a user.
 * Uses merchant_name if available, falls back to extracting from description.
 * Marks transactions as recurring and creates subscription records for new ones.
 */
export async function detectRecurring(
  userId: string,
  supabase: SupabaseClient
): Promise<number> {
  // Fetch all debit transactions
  const { data: transactions, error } = await supabase
    .from('bank_transactions')
    .select('id, merchant_name, description, amount, timestamp, recurring_group')
    .eq('user_id', userId)
    .lt('amount', 0) // debits only
    .order('timestamp', { ascending: true });

  if (error || !transactions) {
    console.error('Error fetching transactions for recurring detection:', error);
    return 0;
  }

  // Group by normalised merchant name (from merchant_name or description)
  const groups = new Map<string, Array<typeof transactions[0] & { extracted_name: string }>>();

  for (const tx of transactions) {
    const merchantName = tx.merchant_name || extractMerchantFromDescription(tx.description || '');
    if (!merchantName) continue;

    const key = normaliseMerchant(merchantName);
    if (!key || key.length < 3) continue;

    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push({ ...tx, extracted_name: merchantName });
  }

  let newRecurringCount = 0;

  for (const [normalisedName, txs] of groups.entries()) {
    if (txs.length < 2) continue;

    // Calculate intervals in days between consecutive transactions
    const sorted = [...txs].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );
    const intervals: number[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const diff =
        (new Date(sorted[i].timestamp).getTime() -
          new Date(sorted[i - 1].timestamp).getTime()) /
        (1000 * 60 * 60 * 24);
      intervals.push(diff);
    }

    const amounts = sorted.map((t) => Math.abs(Number(t.amount)));
    const cycle = detectCycle(intervals);

    if (!cycle || !amountsConsistent(amounts)) continue;

    // Mark transactions as recurring
    const ids = txs.map((t) => t.id);
    await supabase
      .from('bank_transactions')
      .update({ is_recurring: true, recurring_group: normalisedName })
      .in('id', ids);

    // Check if subscription already exists (active or dismissed)
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id, dismissed_at')
      .eq('user_id', userId)
      .ilike('provider_name', `%${normalisedName}%`)
      .maybeSingle();

    // Skip if already exists (active) or was dismissed by user
    if (existing) continue;

    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const displayName = txs[0].extracted_name;
    const bankDesc = txs[0].description || null;

    // Auto-categorise based on description keywords
    const category = categoriseTransaction(displayName, bankDesc);

    const { error: insertError } = await supabase.from('subscriptions').insert({
      user_id: userId,
      provider_name: displayName,
      amount: parseFloat(avgAmount.toFixed(2)),
      billing_cycle: cycle === 'weekly' ? 'monthly' : cycle,
      status: 'active',
      source: 'bank',
      category,
      bank_description: bankDesc,
      notes: 'Detected from bank transactions',
    });

    if (insertError) {
      console.error(`Failed to create subscription for ${displayName}:`, insertError);
    } else {
      newRecurringCount++;
      console.log(`Detected recurring: ${displayName} £${avgAmount.toFixed(2)}/${cycle} [${category}]`);
    }
  }

  console.log(`detectRecurring: processed ${transactions.length} transactions, found ${newRecurringCount} new recurring payments`);
  return newRecurringCount;
}
