import type { SupabaseClient } from '@supabase/supabase-js';
import { extractMerchantFromDescription } from '@/lib/detect-recurring';

/**
 * Predictive recurring-payment detector.
 *
 * Distinct from `src/lib/detect-recurring.ts` (which writes
 * subscription rows during bank sync). This module is read-only — it
 * produces forward-looking predictions used by the payment-alerts cron
 * to warn users about upcoming debits and large credits.
 *
 * Yapily webhooks: as of 2026-05-15 we do NOT subscribe to Yapily's
 * `data.consents` / `data.transactions` notifications. The polling
 * cadence (5x daily via /api/cron/bank-sync) is the live signal.
 * TODO: when Yapily Notifications are configured, hook them into
 * /api/yapily/webhook and call this detector reactively instead of
 * relying solely on the cron schedule.
 */

export type RecurringFrequency = 'monthly' | 'weekly';
export type Confidence = 'high' | 'medium' | 'low';

export interface RecurringPayment {
  merchant: string;
  /** Average absolute (positive) amount in GBP. */
  averageAmount: number;
  frequency: RecurringFrequency;
  /** ISO date string (YYYY-MM-DD) of the predicted next occurrence. */
  nextExpectedDate: string;
  confidence: Confidence;
  /** Number of past hits we matched (≥ 2). */
  occurrences: number;
  /** Most recent posting date — ISO. */
  lastSeenDate: string;
}

interface BankTxRow {
  amount: number | string;
  description: string | null;
  merchant_name: string | null;
  timestamp: string;
}

const STRIP_SUFFIXES = /\b(ltd|limited|plc|llp|inc|corp|group|uk|co\.uk)\b/gi;

function normaliseMerchant(name: string): string {
  return name
    .toLowerCase()
    .replace(STRIP_SUFFIXES, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function daysBetween(a: Date, b: Date): number {
  return Math.abs((a.getTime() - b.getTime()) / 86_400_000);
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function isoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Look back 90 days of debits, group by normalised merchant, and
 * identify monthly (±5d) or weekly (±2d) recurring patterns with
 * amount variance ≤ 20%.
 *
 * Returns one prediction per merchant. When a merchant has both
 * monthly and weekly hits, monthly wins (it's the dominant cadence
 * for subscriptions and bills).
 */
export async function detectRecurringPayments(
  supabase: SupabaseClient,
  userId: string,
): Promise<RecurringPayment[]> {
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - 90);

  const { data, error } = await supabase
    .from('bank_transactions')
    .select('amount, description, merchant_name, timestamp')
    .eq('user_id', userId)
    .lt('amount', 0)
    .gte('timestamp', since.toISOString())
    .order('timestamp', { ascending: true });

  if (error || !data) return [];

  const groups = new Map<string, { displayName: string; rows: BankTxRow[] }>();

  for (const row of data as BankTxRow[]) {
    const raw =
      row.merchant_name ||
      extractMerchantFromDescription(row.description ?? '') ||
      null;
    if (!raw) continue;
    const key = normaliseMerchant(raw);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) {
      bucket.rows.push(row);
    } else {
      groups.set(key, { displayName: raw, rows: [row] });
    }
  }

  const predictions: RecurringPayment[] = [];

  for (const { displayName, rows } of groups.values()) {
    if (rows.length < 2) continue;

    const ordered = [...rows].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
    );
    const amounts = ordered.map((r) => Math.abs(Number(r.amount)));
    const intervals: number[] = [];
    for (let i = 1; i < ordered.length; i++) {
      intervals.push(
        daysBetween(new Date(ordered[i - 1].timestamp), new Date(ordered[i].timestamp)),
      );
    }

    const monthlyMatches = intervals.filter((d) => Math.abs(d - 30) <= 5).length;
    const weeklyMatches = intervals.filter((d) => Math.abs(d - 7) <= 2).length;

    let frequency: RecurringFrequency | null = null;
    let cycleDays = 0;
    if (monthlyMatches >= 1 && monthlyMatches >= weeklyMatches) {
      frequency = 'monthly';
      cycleDays = 30;
    } else if (weeklyMatches >= 2) {
      frequency = 'weekly';
      cycleDays = 7;
    }
    if (!frequency) continue;

    const avg = amounts.reduce((s, n) => s + n, 0) / amounts.length;
    if (avg <= 0) continue;
    const maxDeviation = Math.max(...amounts.map((a) => Math.abs(a - avg) / avg));
    if (maxDeviation > 0.2) continue;

    const last = new Date(ordered[ordered.length - 1].timestamp);
    const medianInterval = intervals.length ? median(intervals) : cycleDays;
    const nextExpected = addDays(last, Math.round(medianInterval || cycleDays));

    const matchedHits = frequency === 'monthly' ? monthlyMatches : weeklyMatches;
    const ratio = matchedHits / intervals.length;
    let confidence: Confidence = 'low';
    if (ratio >= 0.8 && ordered.length >= 3 && maxDeviation <= 0.1) {
      confidence = 'high';
    } else if (ratio >= 0.6 && ordered.length >= 2) {
      confidence = 'medium';
    }

    predictions.push({
      merchant: displayName,
      averageAmount: Math.round(avg * 100) / 100,
      frequency,
      nextExpectedDate: isoDate(nextExpected),
      confidence,
      occurrences: ordered.length,
      lastSeenDate: isoDate(last),
    });
  }

  return predictions;
}

/**
 * Filter predictions to those due within `daysAhead` calendar days
 * from `now` (inclusive of today). `now` defaults to "right now".
 */
export function dueWithin(
  predictions: RecurringPayment[],
  daysAhead: number,
  now: Date = new Date(),
): RecurringPayment[] {
  const todayMs = new Date(isoDate(now)).getTime();
  const horizonMs = todayMs + daysAhead * 86_400_000;
  return predictions.filter((p) => {
    const due = new Date(p.nextExpectedDate).getTime();
    return due >= todayMs && due <= horizonMs;
  });
}
