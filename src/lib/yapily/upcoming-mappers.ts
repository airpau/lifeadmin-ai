// src/lib/yapily/upcoming-mappers.ts
//
// PURE mapping from Yapily's four "upcoming payments" payloads to our
// UpcomingRow shape. No fetch, no env, no aliased imports, so this can
// be unit-tested directly with `node --test --experimental-strip-types`
// against real captured bank payloads. See upcoming-mappers.test.ts —
// its fixtures are the actual HSBC Business and NatWest responses that
// produced the 2026-09 "£16,220 landing" incident.
//
// The network wrappers live in ./upcoming.ts and are thin: fetch, then
// call one of these.

export interface RawAmount {
  amount?: number | string | null;
  currency?: string | null;
}

/**
 * Work out whether a scheduled / periodic / direct-debit row represents
 * money going OUT (outgoing) or money coming IN (incoming).
 *
 * ONLY an explicit `creditDebitIndicator` is trusted. Everything else
 * is outgoing, because that is what these three resources mean: a
 * direct debit is a mandate to collect FROM this account, a standing
 * order and a scheduled payment are instructions to pay OUT of it.
 *
 * HISTORY, so this is not "simplified" back. Until 2026-09-10 this
 * function also guessed from the sign of the amount: positive meant
 * incoming. Banks send an unsigned MAGNITUDE in `nextPaymentAmount`
 * and `previousPaymentAmount`, so that test was true for essentially
 * every row, and the documented "defaults to outgoing" fallback was
 * unreachable. The result on live data was 28 direct debits (HMRC,
 * Funding Circle, Capital on Tap, British Gas, Aviva, NEST) and a BBLS
 * loan standing order all reported as money ARRIVING, £16,220 of it,
 * and then re-forecast as future income by the mandate projector.
 *
 * The heuristic was added on 2026-04-23 to catch incoming transfers on
 * HSBC Business accounts. It never could have: that commit described
 * incoming as arriving with a NEGATIVE amount, while the code treated
 * negative as outgoing. No bank in the estate has ever returned an
 * incoming row on these endpoints. If one ever does, it will say so
 * with creditDebitIndicator, which is honoured below.
 */
function detectDirection(row: {
  creditDebitIndicator?: string | null;
}): 'incoming' | 'outgoing' {
  return String(row.creditDebitIndicator || '').toUpperCase() === 'CREDIT'
    ? 'incoming'
    : 'outgoing';
}

/** Shape the four endpoint wrappers return to callers. Keeps the
 *  cron code free of provider-specific quirks. */
export interface UpcomingRow {
  source:
    | 'pending_credit'
    | 'pending_debit'
    | 'scheduled_payment'
    | 'standing_order'
    | 'direct_debit';
  direction: 'incoming' | 'outgoing';
  counterparty: string | null;
  amount: number; // positive number; `direction` carries the sign
  currency: string;
  expectedDate: string; // YYYY-MM-DD
  yapilyResourceId: string | null;
  confidence: 1.0;
  raw: unknown;
}

// ─── helpers ───────────────────────────────────────────────────────
export function toDateOnly(iso: string | null | undefined): string {
  if (!iso) return new Date().toISOString().slice(0, 10);
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

// ─── Scheduled payments (future-dated one-off transfers) ───────────
export interface YapilyScheduledPayment {
  id?: string;
  scheduledPaymentDateTime?: string;
  amount?: RawAmount;
  creditDebitIndicator?: string | null;
  payee?: { name?: string | null } | null;
  payeeDetails?: { name?: string | null } | null;
  payer?: { name?: string | null } | null;
  payerDetails?: { name?: string | null } | null;
  reference?: string | null;
}

export function mapScheduledPayments(data: YapilyScheduledPayment[] | null): UpcomingRow[] {
  return (data || []).map((p) => {
    const amount = Math.abs(parseFloat(String(p.amount?.amount ?? 0)) || 0);
    const direction = detectDirection(p);
    // For incoming rows the human-readable counterparty is the payer, not the payee.
    const counterparty =
      direction === 'incoming'
        ? p.payer?.name || p.payerDetails?.name || p.reference || null
        : p.payeeDetails?.name || p.payee?.name || p.reference || null;
    return {
      source: 'scheduled_payment' as const,
      direction,
      counterparty,
      amount,
      currency: p.amount?.currency || 'GBP',
      expectedDate: toDateOnly(p.scheduledPaymentDateTime),
      yapilyResourceId: p.id || null,
      confidence: 1.0,
      raw: p,
    };
  });
}

// Same two-shape warning as direct debits below: HSBC Business and
// NatWest both nest the payee under `payeeDetails` and the status
// under `statusDetails`, and send `frequency` as an object rather than
// the OBIE string parseFrequency() expects.
export interface YapilyPeriodicPayment {
  id?: string;
  nextPaymentDateTime?: string;
  firstPaymentDateTime?: string;
  finalPaymentDateTime?: string;
  nextPaymentAmount?: RawAmount;
  amount?: RawAmount;
  creditDebitIndicator?: string | null;
  payee?: { name?: string | null } | null;
  payeeDetails?: { name?: string | null } | null;
  payer?: { name?: string | null } | null;
  reference?: string | null;
  status?: string;
  statusDetails?: { status?: string | null } | null;
  frequency?: unknown;
}

export function mapPeriodicPayments(data: YapilyPeriodicPayment[] | null): UpcomingRow[] {
  return (data || []).flatMap<UpcomingRow>((p) => {
    const amountSrc = p.nextPaymentAmount ?? p.amount;
    const amount = Math.abs(parseFloat(String(amountSrc?.amount ?? 0)) || 0);
    const direction = detectDirection(p);

    // Ended and unknown-state mandates keep appearing on this
    // endpoint. One live example: a standing order with
    // statusDetails.status 'UNKNOWN', a finalPaymentDateTime of
    // 2026-08-06 and a £0.00 amount was being shown as due today.
    const statusSignals = [p.statusDetails?.status, p.status]
      .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
      .map((v) => v.toUpperCase());
    if (!statusSignals.every((v) => v === 'ACTIVE')) return [];

    // A standing order whose final payment has already been made is
    // finished, whatever its status says.
    const finalIso = p.finalPaymentDateTime ? toDateOnly(p.finalPaymentDateTime) : null;
    if (finalIso && finalIso < new Date().toISOString().slice(0, 10)) return [];

    // Nested first — see the interface note. `payer` is checked for
    // incoming rows because on a genuine CREDIT the other party is the
    // payer, but the nested payee name is what banks actually send.
    const counterparty =
      (direction === 'incoming' ? p.payer?.name?.trim() : null) ||
      p.payeeDetails?.name?.trim() ||
      p.payee?.name?.trim() ||
      p.reference?.trim() ||
      null;

    const anchor = p.nextPaymentDateTime || p.firstPaymentDateTime;
    if (!anchor) {
      console.warn(
        `[yapily.upcoming] standing order ${p.id || counterparty || 'unknown'} has no next or first payment date — skipping`,
      );
      return [];
    }

    return [{
      source: 'standing_order' as const,
      direction,
      counterparty,
      amount,
      currency: amountSrc?.currency || 'GBP',
      expectedDate: toDateOnly(anchor),
      yapilyResourceId: p.id || null,
      confidence: 1.0,
      raw: p,
    }];
  });
}

// ─── Direct debits ─────────────────────────────────────────────────
//
// SHAPE WARNING. Banks send this resource in two different shapes and
// we have been bitten by assuming the flat one. HSBC Business (OBIE
// v3) nests the fields:
//
//   flat (assumed)          nested (HSBC Business, actual)
//   ─────────────────       ──────────────────────────────
//   name                    payeeDetails.name
//   status                  statusDetails.status
//   nextPaymentDateTime     (absent — only previousPaymentDateTime)
//   nextPaymentAmount       (absent — only previousPaymentAmount)
//
// Every optional field below is genuinely optional on some real bank,
// so read through the accessors rather than adding new `d.foo` reads.
export interface YapilyDirectDebit {
  id?: string;
  nextPaymentDateTime?: string;
  previousPaymentDateTime?: string;
  nextPaymentAmount?: RawAmount;
  previousPaymentAmount?: RawAmount;
  creditDebitIndicator?: string | null;
  name?: string | null;
  payeeDetails?: { name?: string | null } | null;
  reference?: string | null;
  status?: string;
  statusDetails?: { status?: string | null } | null;
  frequency?: string;
}

/** Payee name, preferring whichever shape the bank used. The mandate
 *  `reference` is a last resort: it is a payment reference such as
 *  "100721886CCI", which is not a name and reads as noise in the UI. */
function directDebitPayee(d: YapilyDirectDebit): string | null {
  return d.payeeDetails?.name?.trim() || d.name?.trim() || d.reference?.trim() || null;
}

/**
 * Is this mandate live?
 *
 * Checks BOTH shapes and treats a mandate as ended if EITHER says so,
 * rather than picking one field as authoritative. A bank normally
 * sends only one, so they rarely disagree; when they do, showing a
 * cancelled mandate as upcoming money is the more expensive mistake.
 * An absent status means active: some banks omit it entirely, and
 * dropping a real mandate is worse than keeping an ended one.
 */
function directDebitIsActive(d: YapilyDirectDebit): boolean {
  const signals = [d.statusDetails?.status, d.status]
    .filter((v): v is string => typeof v === 'string' && v.trim() !== '')
    .map((v) => v.toUpperCase());
  return signals.every((v) => v === 'ACTIVE');
}

export function mapDirectDebits(data: YapilyDirectDebit[] | null): UpcomingRow[] {
  return (data || []).flatMap<UpcomingRow>((d) => {
    const amountSrc = d.nextPaymentAmount ?? d.previousPaymentAmount;
    const amount = Math.abs(parseFloat(String(amountSrc?.amount ?? 0)) || 0);

    // ── Direction ──────────────────────────────────────────────────
    //
    // A direct debit is a mandate letting someone COLLECT from this
    // account. It is outgoing by construction. Only an explicit
    // CREDIT indicator can say otherwise, and no UK bank we have seen
    // sends one on this endpoint.
    //
    // This deliberately does NOT use detectDirection(). That helper
    // infers direction from the sign of the amount, which is correct
    // for scheduled and periodic payments (where banks do send signed
    // values) and catastrophic here: `previousPaymentAmount.amount` is
    // an unsigned MAGNITUDE, always positive, so every mandate scored
    // as 'incoming'. Between 2026-04-23 and 2026-09-10 that put 28 of
    // one account's outgoing bills — HMRC, Funding Circle, Capital on
    // Tap, British Gas, Aviva, NEST — into the Money Hub as £16,220 of
    // money LANDING, and the mandate projector then forecast the same
    // rows forward as future income. A magnitude carries no direction;
    // do not read one out of it.
    const indicator = String(d.creditDebitIndicator || '').toUpperCase();
    const direction: 'incoming' | 'outgoing' = indicator === 'CREDIT' ? 'incoming' : 'outgoing';

    // ── Mandate status ─────────────────────────────────────────────
    // Cancelled and inactive mandates stay on the endpoint. Showing
    // them as upcoming money is a straight falsehood, so drop them.
    // An absent status is treated as active: some banks omit it, and
    // dropping a real mandate is worse than keeping an ended one.
    if (!directDebitIsActive(d)) return [];

    // ── Date ───────────────────────────────────────────────────────
    //
    // `expectedDate` on a mandate row is the LAST DATE THE BANK GAVE
    // US, and sync-upcoming feeds it to projectMandateOccurrences as
    // `lastKnownDate` to roll forward. So prefer a real next date,
    // fall back to the previous payment date, and if the bank gave
    // neither, emit nothing.
    //
    // Emitting nothing is the point. toDateOnly() silently returns
    // TODAY for a missing date, so a bank that sends only
    // previousPaymentDateTime (HSBC Business does exactly this) had
    // every one of its mandates stamped with today's date — piling
    // them all onto "Today" in the forward view, and anchoring the
    // projector on today so the next occurrence was forecast a month
    // from whenever the cron happened to run rather than from the
    // mandate's real cycle.
    const anchor = d.nextPaymentDateTime || d.previousPaymentDateTime;
    if (!anchor) {
      console.warn(
        `[yapily.upcoming] direct debit ${d.id || directDebitPayee(d) || 'unknown'} has no next or previous payment date — skipping, cannot place it on a timeline`,
      );
      return [];
    }

    return [{
      source: 'direct_debit' as const,
      direction,
      counterparty: directDebitPayee(d),
      amount,
      currency: amountSrc?.currency || 'GBP',
      expectedDate: toDateOnly(anchor),
      yapilyResourceId: d.id || null,
      confidence: 1.0,
      raw: d,
    }];
  });
}

export interface YapilyTransaction {
  id?: string;
  date?: string;
  bookingDateTime?: string;
  valueDateTime?: string;
  amount?: number | string | null;
  currency?: string | null;
  status?: string;
  bookingStatus?: string;
  description?: string | null;
  merchantName?: string | null;
  payee?: { name?: string | null } | null;
  payer?: { name?: string | null } | null;
}

export function mapPendingTransactions(raw: YapilyTransaction[] | null): UpcomingRow[] {
  return (raw || [])
    .filter((t) => {
      const flag = (t.bookingStatus || t.status || '').toUpperCase();
      return flag === 'PENDING';
    })
    .map((t) => {
      const amountNum = parseFloat(String(t.amount ?? 0)) || 0;
      const direction: 'incoming' | 'outgoing' = amountNum >= 0 ? 'incoming' : 'outgoing';
      return {
        source: (direction === 'incoming' ? 'pending_credit' : 'pending_debit') as
          | 'pending_credit'
          | 'pending_debit',
        direction,
        counterparty:
          t.merchantName ||
          t.payee?.name ||
          t.payer?.name ||
          t.description ||
          null,
        amount: Math.abs(amountNum),
        currency: t.currency || 'GBP',
        expectedDate: toDateOnly(t.valueDateTime || t.bookingDateTime || t.date),
        yapilyResourceId: t.id || null,
        confidence: 1.0,
        raw: t,
      };
    });
}
