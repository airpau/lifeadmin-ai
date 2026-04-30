-- Add 'cancellation' to the disputes.issue_type allow-list.
--
-- create_dispute_from_subscription RPC defaults p_issue_type to
-- 'cancellation', and the subscriptions-page cancellation flow calls
-- it without overriding. The current CHECK constraint forbids
-- 'cancellation', so every cancellation-flow attempt to create a
-- dispute silently fails — the letter generates but no dispute row
-- is written, which means /api/subscriptions/[id]/cancellation-sent
-- can't link a watchdog row (no dispute to link to) and the auto-
-- track-reply flow never fires for cancellations.
--
-- Additive change: drop and recreate the CHECK with 'cancellation'
-- added. Existing rows are unaffected because none of them use the
-- new value yet.

ALTER TABLE public.disputes
  DROP CONSTRAINT IF EXISTS disputes_issue_type_check;

ALTER TABLE public.disputes
  ADD CONSTRAINT disputes_issue_type_check
  CHECK (issue_type = ANY (ARRAY[
    'complaint',
    'cancellation',
    'energy_dispute',
    'broadband_complaint',
    'flight_compensation',
    'parking_appeal',
    'debt_dispute',
    'refund_request',
    'hmrc_tax_rebate',
    'council_tax_band',
    'dvla_vehicle',
    'nhs_complaint'
  ]));
