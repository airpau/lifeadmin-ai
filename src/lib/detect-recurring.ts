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
  return amounts.every((a) => Math.abs(a - avg) / avg <= AMOUNT_VARIANCE);
}

/**
 * Detects recurring payments from bank transactions for a user.
 * Marks transactions as recurring and creates subscription records for new ones.
 * Returns the count of new recurring payment groups detected.
 */
export async function detectRecurring(
  userId: string,
  supabase: SupabaseClient
): Promise<number> {
  // Fetch all debit transactions for this user
  const { data: transactions, error } = await supabase
    .from('bank_transactions')
    .select('id, merchant_name, amount, timestamp, recurring_group')
    .eq('user_id', userId)
    .lt('amount', 0) // debits only
    .not('merchant_name', 'is', null)
    .order('timestamp', { ascending: true });

  if (error || !transactions) {
    console.error('Error fetching transactions for recurring detection:', error);
    return 0;
  }

  // Group by normalised merchant name
  const groups = new Map<string, typeof transactions>();
  for (const tx of transactions) {
    const key = normaliseMerchant(tx.merchant_name!);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(tx);
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

    const amounts = sorted.map((t) => Math.abs(t.amount));
    const cycle = detectCycle(intervals);

    if (!cycle || !amountsConsistent(amounts)) continue;

    // Mark transactions as recurring
    const ids = txs.map((t) => t.id);
    await supabase
      .from('bank_transactions')
      .update({ is_recurring: true, recurring_group: normalisedName })
      .in('id', ids);

    // Check if subscription already exists for this user+merchant
    const { data: existing } = await supabase
      .from('subscriptions')
      .select('id, source')
      .eq('user_id', userId)
      .ilike('provider_name', `%${normalisedName}%`)
      .maybeSingle();

    const avgAmount = amounts.reduce((a, b) => a + b, 0) / amounts.length;
    const rawMerchantName = txs[0].merchant_name!;

    if (!existing) {
      // Create new subscription record
      await supabase.from('subscriptions').insert({
        user_id: userId,
        provider_name: rawMerchantName,
        amount: parseFloat(avgAmount.toFixed(2)),
        billing_cycle: cycle === 'weekly' ? 'monthly' : cycle, // map weekly → monthly as closest standard cycle
        status: 'active',
        source: 'bank',
        usage_frequency: 'sometimes',
      });
      newRecurringCount++;
    } else if (existing.source === 'email') {
      // Update existing email-detected subscription with bank confirmation
      await supabase
        .from('subscriptions')
        .update({ source: 'bank_and_email' })
        .eq('id', existing.id);
    }
  }

  return newRecurringCount;
}
