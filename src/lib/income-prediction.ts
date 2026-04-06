import { createClient as createAdmin } from '@supabase/supabase-js';

export interface PredictedIncome {
  source: string;         // e.g. "Employer Name" or "Rental Income"
  income_type: string;    // salary, freelance, rental, benefits, etc.
  expected_amount: number;
  expected_day: number;   // day of month (1-31)
  confidence: number;     // 0-1 based on consistency
  received_this_month: boolean;
  actual_amount?: number; // if already received
}

export interface IncomeForecast {
  predictions: PredictedIncome[];
  totalExpectedIncome: number;
  totalReceivedSoFar: number;
  totalStillExpected: number;
}

export async function predictMonthlyIncome(userId: string, year: number, month: number): Promise<IncomeForecast> {
  const admin = createAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Fetch last 6 months of income transactions
  const sixMonthsAgo = new Date(year, month - 7, 1).toISOString();
  const endOfMonth = new Date(year, month, 0, 23, 59, 59).toISOString();

  const { data: incomeTxns } = await admin
    .from('bank_transactions')
    .select('amount, merchant_name, description, timestamp, income_type')
    .eq('user_id', userId)
    .gt('amount', 0)
    .gte('timestamp', sixMonthsAgo)
    .lte('timestamp', endOfMonth)
    .order('timestamp', { ascending: false });

  if (!incomeTxns || incomeTxns.length === 0) {
    return {
      predictions: [],
      totalExpectedIncome: 0,
      totalReceivedSoFar: 0,
      totalStillExpected: 0,
    };
  }

  // Group by source (normalised merchant name)
  const sourceGroups: Record<
    string,
    Array<{ amount: number; day: number; month: string; income_type: string }>
  > = {};

  for (const tx of incomeTxns) {
    const source = (tx.merchant_name || tx.description || 'Unknown')
      .substring(0, 50)
      .trim();
    const normalised = source
      .replace(/\d{6,}/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    if (!normalised || normalised.length < 3) continue;

    const date = new Date(tx.timestamp);
    const key = normalised;

    if (!sourceGroups[key]) sourceGroups[key] = [];
    sourceGroups[key].push({
      amount: tx.amount,
      day: date.getDate(),
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
      income_type: tx.income_type || 'other',
    });
  }

  // Identify recurring income (appears in 3+ of last 6 months)
  const predictions: PredictedIncome[] = [];
  const currentMonthStr = `${year}-${String(month).padStart(2, '0')}`;

  for (const [source, entries] of Object.entries(sourceGroups)) {
    const uniqueMonths = new Set(entries.map((e) => e.month));
    if (uniqueMonths.size < 3) continue; // need at least 3 months of history

    // Calculate median amount and most common day
    const amounts = entries.map((e) => e.amount).sort((a, b) => a - b);
    const medianAmount = amounts[Math.floor(amounts.length / 2)];

    // Most common day
    const dayCounts: Record<number, number> = {};
    entries.forEach((e) => {
      dayCounts[e.day] = (dayCounts[e.day] || 0) + 1;
    });
    const expectedDay = parseInt(
      Object.entries(dayCounts).sort((a, b) => b[1] - a[1])[0][0]
    );

    // Confidence based on consistency
    const amountVariance =
      amounts.length > 1
        ? Math.sqrt(
            amounts.reduce((s, a) => s + Math.pow(a - medianAmount, 2), 0) /
              amounts.length
          ) / medianAmount
        : 0;
    const monthCoverage = uniqueMonths.size / 6;
    const confidence = Math.min(1, monthCoverage * (1 - Math.min(1, amountVariance)));

    // Check if received this month
    const thisMonthEntries = entries.filter((e) => e.month === currentMonthStr);
    const receivedThisMonth = thisMonthEntries.length > 0;

    // Get display name (title case the source)
    const displayName = source
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ');

    predictions.push({
      source: displayName,
      income_type: entries[0].income_type,
      expected_amount: Math.round(medianAmount * 100) / 100,
      expected_day: expectedDay,
      confidence,
      received_this_month: receivedThisMonth,
      actual_amount: receivedThisMonth
        ? thisMonthEntries.reduce((s, e) => s + e.amount, 0)
        : undefined,
    });
  }

  // Sort by confidence desc, then amount desc
  predictions.sort(
    (a, b) =>
      b.confidence - a.confidence || b.expected_amount - a.expected_amount
  );

  const totalExpectedIncome = predictions.reduce((s, p) => s + p.expected_amount, 0);
  const totalReceivedSoFar = predictions
    .filter((p) => p.received_this_month)
    .reduce((s, p) => s + (p.actual_amount || 0), 0);
  const totalStillExpected = predictions
    .filter((p) => !p.received_this_month)
    .reduce((s, p) => s + p.expected_amount, 0);

  return {
    predictions,
    totalExpectedIncome,
    totalReceivedSoFar,
    totalStillExpected,
  };
}
