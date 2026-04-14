-- ============================================================
-- Email Findings — Expanded Finding Types (2026-04-12)
--
-- Adds new finding_type values to email_scan_findings:
--   trial_expiry      — free trial auto-converting to paid
--   insurance_renewal — insurance policy renewal notices
--   dd_advance_notice — Bacs direct debit advance notices
--   government        — HMRC, DVLA, NHS, gov.uk correspondence
-- ============================================================

-- Drop the inline CHECK constraint (PostgreSQL auto-named)
ALTER TABLE email_scan_findings
  DROP CONSTRAINT IF EXISTS email_scan_findings_finding_type_check;

-- Recreate with expanded type list
ALTER TABLE email_scan_findings
  ADD CONSTRAINT email_scan_findings_finding_type_check CHECK (finding_type IN (
    'subscription', 'bill', 'contract', 'dispute_response',
    'cancellation_confirmation', 'price_increase', 'refund_opportunity',
    'flight_delay', 'debt_dispute', 'tax_rebate', 'renewal',
    'forgotten_subscription', 'upcoming_payment', 'deal_expiry',
    'bank_gap', 'trial_expiry', 'insurance_renewal', 'dd_advance_notice',
    'government'
  ));
