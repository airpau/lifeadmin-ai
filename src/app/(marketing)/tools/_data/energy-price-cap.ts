/**
 * OFGEM ENERGY PRICE CAP — SINGLE SOURCE OF TRUTH FOR /tools
 * ==========================================================
 *
 * These are the ONLY hardcoded price-cap figures in the codebase. The
 * energy overcharge checker at /tools/energy-bill-overcharge-checker
 * reads from here and nowhere else.
 *
 * HOW TO UPDATE (do this within a week of each Ofgem announcement —
 * Ofgem sets the cap every 3 months, effective 1 Jan / 1 Apr / 1 Jul /
 * 1 Oct):
 *
 *   1. Open the official table:
 *      https://www.ofgem.gov.uk/information-consumers/energy-advice-households/energy-price-cap-unit-rates-and-standing-charges
 *   2. Copy the "Average electricity and gas unit prices and standing
 *      charges by Direct Debit" row for the NEW period.
 *   3. Add a NEW entry at the TOP of PRICE_CAP_PERIODS below. Newest
 *      first — the checker treats index 0 as current.
 *   4. Do NOT delete the old entries. The checker lets a user pick the
 *      period their bill covers, so historic periods stay useful.
 *   5. Update `verifiedOn` on the entry you add.
 *
 * IMPORTANT — WHAT THESE NUMBERS ARE AND ARE NOT
 *
 * They are the Great Britain AVERAGE for customers paying by Direct
 * Debit, including 5% VAT, rounded to 2dp by Ofgem.
 *
 * They are NOT a per-household hard limit. Ofgem sets the cap
 * regionally, and standing charges in particular vary a lot by region.
 * They also differ by payment method (Direct Debit / standard credit /
 * prepayment). A customer whose rate sits slightly above the GB average
 * is not necessarily being overcharged.
 *
 * The checker must therefore always present a result as "compared to
 * the GB Direct Debit average for <period>", never as "your supplier
 * has breached the cap". That conservatism is deliberate.
 *
 * The cap only applies to standard variable (default) tariffs. Fixed
 * tariffs, business contracts and heat networks are outside it.
 */

export type PriceCapPeriod = {
  /** Stable id used as a <select> value. */
  id: string;
  /** Human label exactly as Ofgem words the period. */
  label: string;
  /** Short label for inline use in result copy. */
  shortLabel: string;
  /** Typical annual bill Ofgem quotes for this period, if published. */
  typicalAnnualBillGbp?: number;
  electricityUnitRatePencePerKwh: number;
  electricityStandingChargePencePerDay: number;
  gasUnitRatePencePerKwh: number;
  gasStandingChargePencePerDay: number;
  /** Date a human last checked these against the Ofgem table. */
  verifiedOn: string;
};

export const PRICE_CAP_PERIODS: ReadonlyArray<PriceCapPeriod> = [
  {
    id: '2026-jul-sep',
    label: '1 July to 30 September 2026 (current)',
    shortLabel: '1 July to 30 September 2026',
    typicalAnnualBillGbp: 1862,
    electricityUnitRatePencePerKwh: 26.11,
    electricityStandingChargePencePerDay: 57.19,
    gasUnitRatePencePerKwh: 7.33,
    gasStandingChargePencePerDay: 29.04,
    verifiedOn: '2026-08-16',
  },
  {
    id: '2026-apr-jun',
    label: '1 April to 30 June 2026',
    shortLabel: '1 April to 30 June 2026',
    electricityUnitRatePencePerKwh: 24.67,
    electricityStandingChargePencePerDay: 57.21,
    gasUnitRatePencePerKwh: 5.74,
    gasStandingChargePencePerDay: 29.09,
    verifiedOn: '2026-08-16',
  },
];

/** The period the checker defaults to. Always index 0. */
export const CURRENT_PRICE_CAP: PriceCapPeriod = PRICE_CAP_PERIODS[0];

/**
 * Ofgem back-billing rule. Standard Licence Condition 21BA prevents a
 * supplier billing a domestic customer for energy used more than this
 * many months before the date of the bill.
 */
export const BACK_BILLING_LIMIT_MONTHS = 12;

/**
 * How long a supplier has to resolve a complaint before the customer
 * can take it to the Energy Ombudsman without a deadlock letter.
 */
export const ENERGY_OMBUDSMAN_WEEKS = 8;

export function getPriceCapPeriod(id: string): PriceCapPeriod {
  return PRICE_CAP_PERIODS.find((p) => p.id === id) ?? CURRENT_PRICE_CAP;
}
