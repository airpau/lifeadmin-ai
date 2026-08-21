// src/lib/email/scan-persistence.ts
//
// Shared mapping between what the inbox scanners CLASSIFY and what the
// database will actually ACCEPT.
//
// Why this exists
// ───────────────
// The three scan routes (Gmail, Outlook, IMAP) each wrote their own
// version of the same two inserts, and each got it wrong differently.
// Symptom, reported 2026-08-21: "email scanning doesn't seem to do
// anything".
//
// It was doing plenty. It just wasn't keeping any of it.
//
//   • Gmail classified subscriptions, renewals, refunds, flight delays
//     and the rest, then wrote only bills, contracts and price
//     increases to `email_scan_findings`. That is the ONLY table the
//     dashboard's Email Scanner card reads. So a scan that found thirty
//     subscriptions reported "Scan complete · 0 findings — your inbox
//     looks clean."
//
//   • Outlook and IMAP inserted `money_hub_alerts` with a column named
//     `type`. The column is `alert_type`, and it is NOT NULL. Every
//     insert on those two paths violated the constraint and was
//     swallowed by a `.then(({error}) => console.error(...))`.
//
//   • `money_hub_alerts.alert_type` has a CHECK constraint listing 14
//     values. The scanners emit types that aren't in it. Because the
//     insert is a single batch, ONE unmappable row rejected the whole
//     batch, taking the valid alerts with it.
//
// Putting the mapping in one place means a new finding type has exactly
// one place to be taught about, and a type nobody has mapped yet
// degrades to being dropped from one insert rather than silently
// killing a batch.

/**
 * Values `email_scan_findings.finding_type` will accept.
 *
 * Source of truth is the CHECK constraint in
 * supabase/migrations/20260412000003_email_findings_new_types.sql.
 * Keep the two in step: adding a type here without a migration turns a
 * silent drop into a silent insert failure, which is worse.
 */
export const ALLOWED_FINDING_TYPES = new Set([
  'subscription',
  'bill',
  'contract',
  'dispute_response',
  'cancellation_confirmation',
  'price_increase',
  'refund_opportunity',
  'flight_delay',
  'debt_dispute',
  'tax_rebate',
  'renewal',
  'forgotten_subscription',
  'upcoming_payment',
  'deal_expiry',
  'bank_gap',
  'trial_expiry',
  'insurance_renewal',
  'dd_advance_notice',
  'government',
]);

export function isStorableFindingType(type: unknown): type is string {
  return typeof type === 'string' && ALLOWED_FINDING_TYPES.has(type);
}

/**
 * Values `money_hub_alerts.alert_type` will accept.
 * Source: supabase/migrations/20260324020000_money_hub_tables.sql.
 */
const ALLOWED_ALERT_TYPES = new Set([
  'overcharge',
  'price_increase',
  'duplicate_charge',
  'unusual_spending',
  'budget_warning',
  'budget_exceeded',
  'contract_expiring',
  'subscription_unused',
  'compensation_opportunity',
  'insurance_renewal',
  'debt_correspondence',
  'income_change',
  'savings_milestone',
  'general',
]);

/**
 * Scanner classification → an alert_type the table will accept.
 *
 * Deliberately explicit rather than a passthrough with a fallback. Each
 * line is a decision about how a finding should read to the user in
 * Money Hub, not a type cast:
 *   a flight delay or tax rebate is money owed to them → compensation
 *   a contract or deal ending is a deadline → contract_expiring
 *   a debt letter is correspondence they may need to answer
 *
 * Returns null for anything unmapped, and the caller drops that row.
 * Dropping one alert is a much smaller failure than the whole batch
 * being rejected, which is what happened before.
 */
export function toMoneyHubAlertType(scannerType: unknown): string | null {
  if (typeof scannerType !== 'string') return null;
  if (ALLOWED_ALERT_TYPES.has(scannerType)) return scannerType;

  const map: Record<string, string> = {
    bill: 'general',
    contract: 'contract_expiring',
    deal_expiry: 'contract_expiring',
    trial_expiry: 'contract_expiring',
    renewal: 'contract_expiring',
    upcoming_payment: 'general',
    dd_advance_notice: 'general',
    refund_opportunity: 'compensation_opportunity',
    flight_delay: 'compensation_opportunity',
    tax_rebate: 'compensation_opportunity',
    debt_dispute: 'debt_correspondence',
    dispute_response: 'debt_correspondence',
    cancellation_confirmation: 'general',
    bank_gap: 'general',
    government: 'general',
    subscription: 'subscription_unused',
    forgotten_subscription: 'subscription_unused',
  };

  return map[scannerType] ?? null;
}

/** Shape the scanners hand us. Loose on purpose: the classifier's JSON
 *  is not a contract we control. */
export interface ScannedOpportunity {
  type?: string;
  provider?: string;
  emailId?: string;
  title?: string;
  description?: string;
  amount?: number;
  paymentAmount?: number;
  nextPaymentDate?: string;
  contractEndDate?: string;
  previousAmount?: number;
  priceChangeDate?: string;
  paymentFrequency?: string;
  confidence?: number;
  urgency?: string;
  [k: string]: unknown;
}

/**
 * Builds an `email_scan_findings` row. Returns null when the type is
 * one the table would reject, so callers can filter rather than
 * discover it as a failed batch.
 */
export function toFindingRow(
  o: ScannedOpportunity,
  userId: string,
  sessionId: string,
): Record<string, unknown> | null {
  if (!isStorableFindingType(o.type)) return null;
  return {
    user_id: userId,
    scan_session_id: sessionId,
    finding_type: o.type,
    provider: o.provider || 'Unknown',
    email_id: o.emailId || null,
    title: o.title,
    description: o.description || null,
    amount: o.amount ?? o.paymentAmount ?? null,
    due_date: o.nextPaymentDate || null,
    contract_end_date: o.contractEndDate || null,
    previous_amount: o.previousAmount ?? null,
    price_change_date: o.priceChangeDate || null,
    payment_frequency: o.paymentFrequency || null,
    confidence: o.confidence ?? 70,
    urgency: o.urgency || 'routine',
    status: 'new',
    metadata: o,
  };
}

/**
 * Builds a `money_hub_alerts` row, or null if the type has no sensible
 * home. Note `alert_type`, not `type` — the column Outlook and IMAP
 * both got wrong.
 */
export function toMoneyHubAlertRow(
  o: ScannedOpportunity,
  userId: string,
): Record<string, unknown> | null {
  const alertType = toMoneyHubAlertType(o.type);
  if (!alertType) return null;
  return {
    user_id: userId,
    alert_type: alertType,
    title: o.title,
    description: o.description,
    value_gbp: o.amount ?? 0,
    source: 'email',
    status: 'active',
    metadata: o,
  };
}
