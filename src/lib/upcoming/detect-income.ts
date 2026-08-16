// src/lib/upcoming/detect-income.ts
//
// Recurring INCOME detection — the incoming half of the Money Hub
// forward view. Emma still doesn't ship this (their community has asked
// for recurring income since 2020), so it needs to be right rather than
// present.
//
// WHY THIS IS A SEPARATE MODULE FROM detect-recurring.ts
// ------------------------------------------------------
// detect-recurring.ts groups by (counterparty, amount ±2%). That gate is
// exactly right for outgoings: a subscription that charges £9.99 charges
// £9.99, and the ±2% trim is what kicks out the one-off £120 purchase at
// the same merchant.
//
// It is exactly wrong for income. Verified against real production data
// on the only live connection (HSBC Business, 180 days):
//
//   "Stripe Payments UK / GLOFOX PAYMENT" — 109 credits, near-daily on
//   weekdays, amounts from £1.00 to £6,682.84.
//   "ENERGIE FITNESS FR" — 31 credits, every Friday without fail,
//   amounts from £284.88 to £20,308.45.
//
// Both are unmistakably recurring income. Both would be shredded by a
// ±2% amount gate — the group would be split into dozens of singletons
// and nothing would be emitted. For income the regular thing is the
// TIMING, not the amount.
//
// So this module:
//   • groups on counterparty only, and SUMS same-day credits (two client
//     payments on one day = one day's income, not two data points)
//   • takes cadence from the day-to-day intervals, reusing the exact
//     CADENCE_BUCKETS / classifyCadence / computeConfidence from
//     detect-recurring.ts so the two detectors can't drift apart
//   • reports the amount as a median plus a p25–p75 range and an
//     explicit volatility figure, instead of pretending a volatile
//     stream has one true value
//   • adds a 'weekdaily' cadence, because a business taking card
//     settlements every working day is a real and common income shape
//     that none of the weekly/monthly buckets describe
//   • emits EVERY occurrence inside the horizon, not just the next one,
//     so a 30-day forward view shows four Fridays rather than one
//
// Confidence reflects regularity of TIMING (per the spec), with a small
// haircut when the amount is so volatile that the pound figure shouldn't
// be read as a firm number.

import {
  CADENCE_BUCKETS,
  MIN_CONFIDENCE,
  classifyCadence,
  computeConfidence,
  medianOf,
  normaliseCounterparty,
  type Cadence,
  type DetectorTransaction,
} from './detect-recurring';

/** Cadence set for income = the shared buckets plus 'weekdaily'. */
export type IncomeCadence = Cadence | 'weekdaily';

export interface PredictedIncome {
  /** Normalised grouping key. */
  counterparty: string;
  /** Original-ish name for the UI. */
  displayCounterparty: string;
  /** Typical (median) amount for one occurrence, absolute. */
  amount: number;
  /** p25 of observed day totals — the conservative read. */
  amountLow: number;
  /** p75 of observed day totals. */
  amountHigh: number;
  /** (p75 − p25) / median, clamped to 0..2. 0 = fixed salary. */
  amountVariability: number;
  cadence: IncomeCadence;
  /** YYYY-MM-DD, always strictly in the future. */
  expectedDate: string;
  /** 0..1. Emitted rows are ≥ MIN_CONFIDENCE. */
  confidence: number;
  /** Number of distinct days observed in the window. */
  sampleSize: number;
  lastSeen: string;
  /** 0 = the next occurrence, 1 = the one after, … */
  occurrenceIndex: number;
}

export interface DetectIncomeOptions {
  now?: Date;
  /** How far forward to emit occurrences. Default 35 days. */
  horizonDays?: number;
  /** Safety cap on occurrences emitted per counterparty. */
  maxOccurrencesPerSeries?: number;
}

/** A near-daily stream needs more evidence than a monthly salary before
 *  we'll claim it repeats — one busy fortnight is not a pattern. */
const WEEKDAILY_MIN_DAYS = 10;
/** Minimum distinct days for any series. Mirrors the ≥3 occurrences
 *  rule in detect-recurring.ts. */
const MIN_DAYS = 3;

// ─── public entry point ───────────────────────────────────────────
export function detectRecurringIncome(
  transactions: DetectorTransaction[],
  options: DetectIncomeOptions = {},
): PredictedIncome[] {
  const now = options.now ?? new Date();
  const horizonDays = options.horizonDays ?? 35;
  const maxOcc = options.maxOccurrencesPerSeries ?? 31;
  if (!transactions?.length) return [];

  const todayIso = isoDay(now);
  const horizonIso = isoDay(addDays(parseIsoDay(todayIso), horizonDays));

  const groups = groupCredits(transactions);
  const out: PredictedIncome[] = [];

  for (const group of groups.values()) {
    const series = scoreSeries(group);
    if (!series) continue;

    const dates = occurrencesFrom({
      cadence: series.cadence,
      lastSeen: series.lastSeen,
      afterIso: todayIso,
      horizonIso,
      modalWeekday: series.modalWeekday,
      max: maxOcc,
    });

    dates.forEach((expectedDate, occurrenceIndex) => {
      out.push({
        counterparty: group.normalised,
        displayCounterparty: group.display,
        amount: series.amount,
        amountLow: series.amountLow,
        amountHigh: series.amountHigh,
        amountVariability: series.amountVariability,
        cadence: series.cadence,
        expectedDate,
        confidence: series.confidence,
        sampleSize: series.sampleSize,
        lastSeen: series.lastSeen,
        occurrenceIndex,
      });
    });
  }

  return out.sort(
    (a, b) =>
      a.expectedDate.localeCompare(b.expectedDate) ||
      b.amount - a.amount,
  );
}

// ─── grouping ─────────────────────────────────────────────────────
interface CreditGroup {
  normalised: string;
  display: string;
  /** date (YYYY-MM-DD) → summed credit amount for that day. */
  dayTotals: Map<string, number>;
}

function groupCredits(txns: DetectorTransaction[]): Map<string, CreditGroup> {
  const groups = new Map<string, CreditGroup>();

  for (const t of txns) {
    const amount = parseFloat(String(t.amount)) || 0;
    // Credits only. Debits are detect-recurring.ts's job.
    if (amount <= 0.01) continue;

    const raw = (t.counterparty || t.description || '').trim();
    if (!raw) continue;
    const normalised = normaliseCounterparty(raw);
    if (!normalised) continue;

    const day = isoDay(new Date(t.date));
    if (!day) continue;

    let g = groups.get(normalised);
    if (!g) {
      g = { normalised, display: raw, dayTotals: new Map() };
      groups.set(normalised, g);
    }
    // Sum rather than dedupe: three client payments on one Tuesday are
    // one Tuesday's income, and the total is the number a user cares
    // about when asking "what's landing".
    g.dayTotals.set(day, (g.dayTotals.get(day) ?? 0) + amount);
  }

  return groups;
}

// ─── scoring ──────────────────────────────────────────────────────
interface ScoredSeries {
  cadence: IncomeCadence;
  amount: number;
  amountLow: number;
  amountHigh: number;
  amountVariability: number;
  confidence: number;
  sampleSize: number;
  lastSeen: string;
  modalWeekday: number | null;
}

function scoreSeries(group: CreditGroup): ScoredSeries | null {
  const days = Array.from(group.dayTotals.keys()).sort();
  if (days.length < MIN_DAYS) return null;

  const intervals: number[] = [];
  for (let i = 1; i < days.length; i++) {
    const d = daysBetween(days[i - 1], days[i]);
    if (d >= 1) intervals.push(d);
  }
  if (intervals.length < 2) return null;

  const median = medianOf(intervals);
  const weekdayCounts = countWeekdays(days);
  const modalWeekday = modeOf(weekdayCounts);

  let cadence: IncomeCadence | null = null;
  let confidence = 0;

  // Weekdaily first — a Mon-Fri settlement stream has a median interval
  // of 1 with a 3-day jump over each weekend, which no weekly/monthly
  // bucket describes and which classifyCadence() would reject outright.
  const workdayShare =
    days.filter((d) => {
      const wd = parseIsoDay(d).getUTCDay();
      return wd >= 1 && wd <= 5;
    }).length / days.length;

  if (median <= 2 && days.length >= WEEKDAILY_MIN_DAYS && workdayShare >= 0.8) {
    cadence = 'weekdaily';
    // Regularity = share of gaps that are a working-day gap (1 day, or
    // 3 across a weekend) plus a sample boost. A stream with long dead
    // patches scores lower and drops out below MIN_CONFIDENCE.
    const clean = intervals.filter((i) => i === 1 || i === 2 || i === 3).length;
    confidence =
      clean / intervals.length + Math.min(0.15, (days.length - WEEKDAILY_MIN_DAYS) * 0.005);
  } else {
    const shared = classifyCadence(median, intervals);
    if (!shared) return null;
    cadence = shared;
    confidence = computeConfidence(days.length, median, shared, intervals);
  }

  const totals = Array.from(group.dayTotals.values());
  const amount = round2(medianOf(totals));
  const amountLow = round2(percentile(totals, 0.25));
  const amountHigh = round2(percentile(totals, 0.75));
  const amountVariability =
    amount > 0 ? Math.min(2, (amountHigh - amountLow) / amount) : 0;

  // Timing is what we're predicting, so volatility only trims the score
  // — it can't sink a rock-solid weekly series. Above 0.5 IQR/median the
  // pound figure genuinely shouldn't be read as firm, and the UI says so.
  const volatilityHaircut =
    amountVariability > 0.5 ? Math.min(0.15, (amountVariability - 0.5) * 0.15) : 0;

  confidence = Math.max(0, Math.min(1, confidence - volatilityHaircut));
  if (confidence < MIN_CONFIDENCE) return null;

  return {
    cadence,
    amount,
    amountLow,
    amountHigh,
    amountVariability: Math.round(amountVariability * 100) / 100,
    confidence: Math.round(confidence * 100) / 100,
    sampleSize: days.length,
    lastSeen: days[days.length - 1],
    modalWeekday:
      cadence === 'weekly' || cadence === 'fortnightly' || cadence === 'four_weekly'
        ? modalWeekday
        : null,
  };
}

// ─── occurrence expansion ─────────────────────────────────────────
/**
 * Every occurrence of a cadence strictly after `afterIso` and no later
 * than `horizonIso`.
 *
 * Exported because the outgoing detector has the same gap: it emits one
 * next occurrence, so a weekly direct debit showed up once in a 30-day
 * view instead of four times. The cron runs its results through here.
 */
export function occurrencesFrom(opts: {
  cadence: IncomeCadence;
  /** Last observed occurrence, YYYY-MM-DD. */
  lastSeen: string;
  /** Exclusive lower bound, YYYY-MM-DD (usually today). */
  afterIso: string;
  /** Inclusive upper bound, YYYY-MM-DD. */
  horizonIso: string;
  /** 0=Sun..6=Sat. Snaps weekly-family dates onto the usual weekday. */
  modalWeekday?: number | null;
  max?: number;
}): string[] {
  const { cadence, lastSeen, afterIso, horizonIso } = opts;
  const max = opts.max ?? 31;
  const out: string[] = [];

  if (cadence === 'weekdaily') {
    let cursor = addDays(parseIsoDay(afterIso), 1);
    while (isoDay(cursor) <= horizonIso && out.length < max) {
      const wd = cursor.getUTCDay();
      if (wd >= 1 && wd <= 5) out.push(isoDay(cursor));
      cursor = addDays(cursor, 1);
    }
    return out;
  }

  const calendarMonthly: Partial<Record<Cadence, number>> = {
    monthly: 1,
    quarterly: 3,
    annual: 12,
  };
  const monthStep = calendarMonthly[cadence as Cadence];

  let cursor = parseIsoDay(lastSeen);
  let guard = 0;
  while (guard < 400 && out.length < max) {
    guard++;
    cursor = monthStep
      ? addMonthsClamped(cursor, monthStep, parseIsoDay(lastSeen).getUTCDate())
      : addDays(cursor, CADENCE_BUCKETS[cadence as Cadence][2]);

    let iso = isoDay(cursor);
    // Weekly-family series land on a consistent weekday (payroll on a
    // Friday, a client that always pays on a Monday). Day arithmetic
    // alone drifts once a cycle is missed, so snap back.
    if (
      !monthStep &&
      opts.modalWeekday != null &&
      cursor.getUTCDay() !== opts.modalWeekday
    ) {
      const delta = ((opts.modalWeekday - cursor.getUTCDay() + 10) % 7) - 3; // −3..+3
      const snapped = addDays(cursor, delta);
      cursor = snapped;
      iso = isoDay(cursor);
    }

    if (iso > horizonIso) break;
    if (iso > afterIso) out.push(iso);
  }

  return out;
}

// ─── date + stats helpers ─────────────────────────────────────────
function isoDay(d: Date): string {
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

function parseIsoDay(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function addDays(d: Date, days: number): Date {
  const n = new Date(d);
  n.setUTCDate(n.getUTCDate() + days);
  return n;
}

function addMonthsClamped(d: Date, months: number, preferredDay: number): Date {
  const n = new Date(d);
  n.setUTCDate(1);
  n.setUTCMonth(n.getUTCMonth() + months);
  const lastDay = new Date(
    Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0),
  ).getUTCDate();
  n.setUTCDate(Math.min(preferredDay, lastDay));
  return n;
}

function daysBetween(aIso: string, bIso: string): number {
  return Math.round(
    (parseIsoDay(bIso).getTime() - parseIsoDay(aIso).getTime()) / 86_400_000,
  );
}

function countWeekdays(days: string[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const d of days) {
    const wd = parseIsoDay(d).getUTCDay();
    counts.set(wd, (counts.get(wd) ?? 0) + 1);
  }
  return counts;
}

function modeOf(counts: Map<number, number>): number | null {
  let best: number | null = null;
  let bestN = 0;
  for (const [k, n] of counts) {
    if (n > bestN) {
      best = k;
      bestN = n;
    }
  }
  return best;
}

function percentile(xs: number[], p: number): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const idx = Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))));
  return s[idx];
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Human label for a cadence. Shared by the cron log and the UI. */
export function cadenceLabel(c: IncomeCadence): string {
  switch (c) {
    case 'weekdaily': return 'Most weekdays';
    case 'weekly': return 'Weekly';
    case 'fortnightly': return 'Fortnightly';
    case 'four_weekly': return 'Every 4 weeks';
    case 'monthly': return 'Monthly';
    case 'quarterly': return 'Quarterly';
    case 'annual': return 'Yearly';
  }
}
