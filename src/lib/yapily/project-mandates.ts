// src/lib/yapily/project-mandates.ts
//
// Projects future occurrences of a direct debit or standing order from
// a stored snapshot, without calling Yapily again.
//
// Why this exists
// ───────────────
// Yapily's data-restrictions page is explicit that for UK institutions
// the direct-debits, periodic-payments and scheduled-payments endpoints
// "can be accessed once and for a short duration after the consent has
// been authorised. To access these endpoints again or after the valid
// period, you will have to obtain a new consent or reauthorise the
// existing consent."
//
// So the nightly re-poll the sync-upcoming cron used to do could not
// have been returning data past day one — it was manufacturing failed
// requests. Fixing that (fetch once per consent) is straightforwardly
// correct, but it creates a second problem: the single payload we DO
// get is the only copy we will ever have until the user reconnects, and
// the daily prune deletes upcoming_payments rows once their date passes.
// Left alone, the forward view would go empty a month after connecting.
//
// The answer is to keep the mandate (see upcoming_endpoint_snapshots)
// and roll its date forward locally. The bank told us "£62.40 to Thames
// Water, monthly, next on the 14th"; we don't need to ask again to know
// there is probably one on the 14th of next month too.
//
// These projections are deliberately emitted as PREDICTED rows, not as
// bank-confirmed ones. The mandate is real, the future dates are our
// arithmetic — and the alerting path only fires on confirmed sources,
// so keeping them predicted stops us pushing "£62.40 leaving tomorrow"
// notifications based on an extrapolation the bank never made.

/** Approximate cadence in days, keyed off the OBIE frequency string. */
export interface Cadence {
  days: number;
  label: string;
}

/**
 * Maps an OBIE / Yapily frequency string to an approximate cadence.
 *
 * OBIE frequency codes are a small grammar, not an enum — values like
 * `IntrvlMnthDay:01:14` (every 1 month on the 14th), `IntrvlWkDay:02:03`
 * (every 2 weeks on Wednesday), `EvryWorkgDay`, `QtrDay:ENGLISH`. We
 * parse the interval multiplier where it is present and fall back to a
 * keyword match, because banks are inconsistent about which form they
 * emit and some send a plain word like "Monthly".
 *
 * Returns null when nothing is recognisable — the caller then declines
 * to project rather than guessing, which is the right failure mode: a
 * missing row is a smaller lie than an invented one.
 */
export function parseFrequency(raw: unknown): Cadence | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const f = raw.trim();
  const upper = f.toUpperCase();

  // Interval forms carry their own multiplier, e.g. IntrvlWkDay:02:03.
  const intervalMatch = f.match(/^Intrvl(Wk|Mnth)Day:(\d+)/i);
  if (intervalMatch) {
    const unitDays = intervalMatch[1].toLowerCase() === 'wk' ? 7 : 30;
    const multiplier = Math.max(1, parseInt(intervalMatch[2], 10) || 1);
    return {
      days: unitDays * multiplier,
      label: unitDays === 7 ? `every ${multiplier} week(s)` : `every ${multiplier} month(s)`,
    };
  }

  // WkInMnthDay:01:05 — "the first Friday of each month". Monthly.
  if (/^WkInMnthDay/i.test(f)) return { days: 30, label: 'monthly' };
  if (/^QtrDay/i.test(f)) return { days: 91, label: 'quarterly' };
  if (upper.includes('EVRYWORKGDAY') || upper.includes('WORKINGDAY')) {
    return { days: 1, label: 'every working day' };
  }
  if (upper.includes('EVRYDAY') || upper === 'DAILY') return { days: 1, label: 'daily' };

  // Plain-word forms. Ordered longest-first so FORTNIGHTLY isn't
  // shadowed by a NIGHTLY-style substring, and ANNUAL before ANNU.
  if (upper.includes('FORTNIGHT') || upper.includes('BIWEEK')) return { days: 14, label: 'fortnightly' };
  if (upper.includes('WEEK')) return { days: 7, label: 'weekly' };
  if (upper.includes('QUARTER')) return { days: 91, label: 'quarterly' };
  if (upper.includes('ANNUAL') || upper.includes('YEAR')) return { days: 365, label: 'annually' };
  if (upper.includes('MONTH')) return { days: 30, label: 'monthly' };

  return null;
}

export interface MandateProjectionInput {
  /** Last known due date from the bank, YYYY-MM-DD. */
  lastKnownDate: string;
  /** Raw OBIE frequency string from the mandate, if the bank sent one. */
  frequency?: unknown;
  /** Row source — used as the monthly default for recurring mandates. */
  source: 'direct_debit' | 'standing_order';
  /** Project no further than this date, YYYY-MM-DD. */
  horizonIso: string;
  /** Only emit dates strictly after this, YYYY-MM-DD. Usually today. */
  afterIso: string;
  /** Safety valve so a 1-day cadence can't emit thousands of rows. */
  max?: number;
}

/**
 * Rolls `lastKnownDate` forward by the mandate's cadence and returns
 * every occurrence that lands in (afterIso, horizonIso].
 *
 * Monthly stepping uses calendar months rather than 30-day arithmetic
 * so a direct debit on the 31st stays anchored to month-end instead of
 * drifting a day earlier every cycle. Sub-monthly cadences step in
 * whole days, which is what weekly and fortnightly mandates actually do.
 */
export function projectMandateOccurrences(
  input: MandateProjectionInput,
): string[] {
  const cadence = parseFrequency(input.frequency)
    // A direct debit or standing order with no parseable frequency is
    // overwhelmingly monthly in UK retail banking. Defaulting is a
    // judgement call, but the alternative — showing the user nothing
    // for a mandate their bank has confirmed exists — is worse, and
    // these rows are emitted as predictions, not as bank-confirmed.
    ?? { days: 30, label: 'monthly (assumed)' };

  const start = new Date(`${input.lastKnownDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime())) return [];

  const horizon = new Date(`${input.horizonIso}T00:00:00Z`);
  const after = new Date(`${input.afterIso}T00:00:00Z`);
  if (Number.isNaN(horizon.getTime()) || Number.isNaN(after.getTime())) return [];

  const max = input.max ?? 24;
  const out: string[] = [];

  // Calendar-month stepping for anything monthly or longer.
  const monthStep =
    cadence.days >= 28
      ? Math.max(1, Math.round(cadence.days / 30))
      : 0;

  // Guard against a pathological input (far-past date + daily cadence)
  // walking millions of steps before reaching the horizon.
  const ITERATION_CAP = 2000;

  // Every occurrence is computed as an offset from `start`, NOT by
  // repeatedly stepping a mutable cursor.
  //
  // That distinction is load-bearing for month-end mandates. Stepping a
  // cursor means the clamp compounds: 31 Jan clamps to 28 Feb, then the
  // NEXT step starts from 28 Feb and clamps back to 28 Feb, and the
  // projection sticks there forever emitting the same date. Anchoring
  // to the original start day keeps 31 Jan → 28 Feb → 31 Mar → 30 Apr,
  // which is what the bank actually collects.
  const anchorDay = start.getUTCDate();

  for (let step = 1; step <= ITERATION_CAP && out.length < max; step++) {
    let occurrence: Date;

    if (monthStep > 0) {
      occurrence = new Date(Date.UTC(
        start.getUTCFullYear(),
        start.getUTCMonth() + monthStep * step,
        1,
      ));
      // Clamp the anchor day to the length of the target month, so a
      // mandate on the 31st lands on the 28th/29th/30th as appropriate
      // rather than overflowing into the following month.
      const daysInMonth = new Date(Date.UTC(
        occurrence.getUTCFullYear(),
        occurrence.getUTCMonth() + 1,
        0,
      )).getUTCDate();
      occurrence.setUTCDate(Math.min(anchorDay, daysInMonth));
    } else {
      occurrence = new Date(start.getTime() + cadence.days * step * 86_400_000);
    }

    if (occurrence.getTime() > horizon.getTime()) break;
    if (occurrence.getTime() <= after.getTime()) continue;
    out.push(occurrence.toISOString().slice(0, 10));
  }

  return out;
}
