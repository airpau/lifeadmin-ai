// src/lib/upcoming/detect-recurring.ts
//
// Predicts the *next occurrence* of each recurring transaction series
// in an account's history. Distinct from src/lib/detect-recurring.ts,
// which is the subscription-row creator — this module only emits
// predicted upcoming-payment rows for the `upcoming_payments` table.
//
// Rules (per the feature spec):
//   • Require ≥ 3 occurrences in a group
//   • Group by (normalised_counterparty, amount bucket ±2%)
//   • Infer cadence: weekly (6–8d), fortnightly (13–15d), 4-weekly
//     (27–29d), monthly (28–32d), quarterly (88–93d), annual
//     (360–370d)
//   • Score confidence from cadence stddev + sample size
//   • Predict next = last_date + median interval
//   • Only emit rows where confidence ≥ 0.6

export interface DetectorTransaction {
  id: string;
  amount: number; // signed — negative = outgoing
  counterparty: string | null;
  description?: string | null;
  date: string; // ISO timestamp or YYYY-MM-DD
}

export interface PredictedUpcoming {
  counterparty: string;          // normalised key
  displayCounterparty: string;   // original-ish name for UI
  amount: number;                // absolute value
  direction: 'incoming' | 'outgoing';
  cadence: Cadence;
  expectedDate: string;          // YYYY-MM-DD
  confidence: number;            // 0..1, emitted rows are ≥ 0.6
  sampleSize: number;
  lastSeen: string;              // YYYY-MM-DD
}

export type Cadence =
  | 'weekly'
  | 'fortnightly'
  | 'four_weekly'
  | 'monthly'
  | 'quarterly'
  | 'annual';

/** Minimum confidence at which we emit a prediction. Kept as a
 *  top-level const so it can be tightened from one place later. */
export const MIN_CONFIDENCE = 0.6;

/** Cadence window, in days, used both to *classify* a group and to
 *  build the prediction. Each entry is [min, max, canonical]. */
const CADENCE_BUCKETS: Record<Cadence, [number, number, number]> = {
  weekly:       [6, 8, 7],
  fortnightly:  [13, 15, 14],
  four_weekly:  [27, 29, 28],
  monthly:      [28, 32, 30],
  quarterly:    [88, 93, 91],
  annual:       [360, 370, 365],
};

// ─── public entry point ───────────────────────────────────────────
/**
 * Run the detector across a single account's recent history and
 * return the predicted upcoming occurrences.
 *
 * `now` is injected so tests can freeze time.
 */
export function detectRecurringUpcoming(
  transactions: DetectorTransaction[],
  now: Date = new Date(),
): PredictedUpcoming[] {
  if (!transactions?.length) return [];

  // 1. Group by (normalised_counterparty, amount bucket)
  const groups = groupTransactions(transactions);

  // 2. For each group, dedupe same-day duplicates, score, predict.
  const predictions: PredictedUpcoming[] = [];
  for (const group of groups.values()) {
    const prediction = scoreAndPredict(group, now);
    if (prediction && prediction.confidence >= MIN_CONFIDENCE) {
      predictions.push(prediction);
    }
  }

  // Sort by soonest expected first — the cron writes straight
  // through so ordering isn't load-bearing, but it makes logs tidy.
  return predictions.sort((a, b) => a.expectedDate.localeCompare(b.expectedDate));
}

// ─── helpers ──────────────────────────────────────────────────────
interface GroupEntry {
  normalised: string;
  display: string;
  direction: 'incoming' | 'outgoing';
  amounts: number[];            // absolute values
  dates: Date[];                // parsed
  sampleIds: Set<string>;       // used for de-duping same-day rows
}

function groupTransactions(txns: DetectorTransaction[]): Map<string, GroupEntry> {
  // Two-pass: first group only by normalised counterparty + direction
  // so we don't split a legitimate series across amount buckets. Then
  // inside each group we filter to rows whose amount is within ±2% of
  // the group's median — that's what kicks out the genuinely unrelated
  // charges at the same merchant (e.g. Amazon £9.99 subscription vs
  // Amazon £120 one-off purchase).
  const bucketsByCounterparty = new Map<string, GroupEntry>();

  for (const t of txns) {
    const raw = (t.counterparty || t.description || '').trim();
    if (!raw) continue;
    const normalised = normaliseCounterparty(raw);
    if (!normalised) continue;

    const amount = Math.abs(parseFloat(String(t.amount)) || 0);
    if (amount < 0.01) continue;

    const direction: 'incoming' | 'outgoing' = t.amount >= 0 ? 'incoming' : 'outgoing';

    const date = parseDate(t.date);
    if (!date) continue;

    const key = `${normalised}|${direction}`;
    let entry = bucketsByCounterparty.get(key);
    if (!entry) {
      entry = {
        normalised,
        display: raw,
        direction,
        amounts: [],
        dates: [],
        sampleIds: new Set(),
      };
      bucketsByCounterparty.set(key, entry);
    }

    // Dedupe same-day duplicate rows (pending + settled of the same
    // payment, DD rows re-posted by the bank) — one per calendar day
    // per counterparty is enough signal.
    const dayOnly = date.toISOString().slice(0, 10);
    if (entry.sampleIds.has(dayOnly)) continue;

    entry.amounts.push(amount);
    entry.dates.push(date);
    entry.sampleIds.add(dayOnly);
  }

  // Second pass: trim each group to rows whose amount is within ±2%
  // of the group median. Drops one-off big-ticket purchases at a
  // recurring merchant without splitting the recurring series.
  const out = new Map<string, GroupEntry>();
  for (const [key, entry] of bucketsByCounterparty) {
    if (entry.amounts.length < 3) {
      // Still add — scoreAndPredict will reject anyway. Keeps shape
      // consistent for callers who want to introspect.
      out.set(key, entry);
      continue;
    }
    const med = medianOf(entry.amounts);
    const lo = med * 0.98;
    const hi = med * 1.02;
    const trimmed: GroupEntry = {
      normalised: entry.normalised,
      display: entry.display,
      direction: entry.direction,
      amounts: [],
      dates: [],
      sampleIds: new Set(),
    };
    for (let i = 0; i < entry.amounts.length; i++) {
      if (entry.amounts[i] >= lo && entry.amounts[i] <= hi) {
        trimmed.amounts.push(entry.amounts[i]);
        trimmed.dates.push(entry.dates[i]);
        trimmed.sampleIds.add(entry.dates[i].toISOString().slice(0, 10));
      }
    }
    out.set(key, trimmed);
  }

  return out;
}

function scoreAndPredict(group: GroupEntry, now: Date): PredictedUpcoming | null {
  if (group.dates.length < 3) return null;

  // Sort ascending so the last date is actually the last.
  const dates = [...group.dates].sort((a, b) => a.getTime() - b.getTime());
  const intervals: number[] = [];
  for (let i = 1; i < dates.length; i++) {
    const days = Math.round(
      (dates[i].getTime() - dates[i - 1].getTime()) / 86_400_000,
    );
    if (days >= 1) intervals.push(days); // intra-day already deduped, defensive
  }
  if (intervals.length < 2) return null; // need at least 3 rows → 2 intervals

  const median = medianOf(intervals);

  const cadence = classifyCadence(median, intervals);
  if (!cadence) return null;

  const confidence = computeConfidence(group.dates.length, median, cadence, intervals);
  if (confidence < MIN_CONFIDENCE) return null;

  const lastSeen = dates[dates.length - 1];
  const expected = addDays(lastSeen, CADENCE_BUCKETS[cadence][2]);

  // Don't emit predictions for dates that have already passed — pull
  // the expected date forward to the next cycle after `now` if the
  // detector's last-seen was further back than one cadence window.
  const nowIsoDay = now.toISOString().slice(0, 10);
  let expectedIso = expected.toISOString().slice(0, 10);
  let safety = 0;
  while (expectedIso < nowIsoDay && safety < 24) {
    expected.setTime(addDays(expected, CADENCE_BUCKETS[cadence][2]).getTime());
    expectedIso = expected.toISOString().slice(0, 10);
    safety++;
  }

  const medianAmount = medianOf(group.amounts);

  return {
    counterparty: group.normalised,
    displayCounterparty: group.display,
    amount: roundGBP(medianAmount),
    direction: group.direction,
    cadence,
    expectedDate: expectedIso,
    confidence: Math.round(confidence * 100) / 100,
    sampleSize: group.dates.length,
    lastSeen: lastSeen.toISOString().slice(0, 10),
  };
}

/** Lowercase, strip punctuation, drop trailing payment ids /
 *  references / dates that banks sprinkle onto descriptions. */
export function normaliseCounterparty(raw: string): string {
  const s = raw
    .toLowerCase()
    // Drop common bank prefixes / suffixes
    .replace(/^dd /, '')
    .replace(/^direct debit /, '')
    .replace(/^so /, '')
    .replace(/^standing order /, '')
    .replace(/^card /, '')
    .replace(/^contactless /, '')
    .replace(/\s+(ltd|limited|plc|llp|inc|corp|co\.uk|uk|gb)\b/g, '')
    // Strip trailing reference number blocks e.g. "NETFLIX 4829312"
    .replace(/\s+\d{6,}$/g, '')
    .replace(/\s+ref[\s#:]*\w{3,}$/gi, '')
    // Strip trailing dates in common formats
    .replace(/\s+\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/g, '')
    // Collapse whitespace + punctuation
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

function parseDate(iso: string | undefined | null): Date | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function addDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() + days);
  return n;
}

function medianOf(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
}

function roundGBP(n: number): number {
  return Math.round(n * 100) / 100;
}

function classifyCadence(median: number, intervals: number[]): Cadence | null {
  // Find the cadence whose canonical interval is closest to the
  // median (provided the median falls inside or near its window).
  let best: { cadence: Cadence; diff: number } | null = null;
  for (const [cadence, [lo, hi, canon]] of Object.entries(CADENCE_BUCKETS) as [
    Cadence,
    [number, number, number],
  ][]) {
    const inRange = median >= lo && median <= hi;
    const diff = Math.abs(median - canon);
    if (!inRange) continue;
    if (!best || diff < best.diff) best = { cadence, diff };
  }
  if (best) return best.cadence;

  // Fall back: if ≥ 70% of intervals land inside one bucket's window,
  // accept that cadence even if the median drifted (covers the
  // "skipped month" case where the median slips toward 60 days).
  for (const [cadence, [lo, hi]] of Object.entries(CADENCE_BUCKETS) as [
    Cadence,
    [number, number, number],
  ][]) {
    const hits = intervals.filter((i) => i >= lo && i <= hi).length;
    if (hits / intervals.length >= 0.7) return cadence;
  }
  return null;
}

function computeConfidence(
  sampleSize: number,
  median: number,
  cadence: Cadence,
  intervals: number[],
): number {
  // Base = fraction of intervals that sit inside the cadence window.
  const [lo, hi] = CADENCE_BUCKETS[cadence];
  const inWindow = intervals.filter((i) => i >= lo && i <= hi).length / intervals.length;

  // Penalise cadence drift using the *trimmed* mean absolute deviation
  // (drop the single farthest interval). That keeps confidence high
  // when one cycle is missed — a single 59-day gap among 30-day
  // gaps shouldn't sink an otherwise clean monthly series.
  const trimmedMAD = mad(intervals, median);
  const rel = median > 0 ? trimmedMAD / median : 1;
  const driftPenalty = Math.min(0.35, rel * 1.2);

  // Reward more samples — plateau at 12 occurrences (1 year of monthly).
  const sampleBoost = Math.min(0.2, (sampleSize - 3) * 0.025);

  const score = inWindow + sampleBoost - driftPenalty;
  return Math.max(0, Math.min(1, score));
}

/** Median absolute deviation after dropping the single worst
 *  outlier — robust to a one-off missed cycle. */
function mad(xs: number[], median: number): number {
  if (xs.length < 2) return 0;
  const deviations = xs.map((x) => Math.abs(x - median)).sort((a, b) => a - b);
  // Trim the top outlier when we have ≥ 3 intervals (skipped cycle).
  const trimmed = deviations.length >= 3 ? deviations.slice(0, -1) : deviations;
  return medianOf(trimmed);
}
